/**
 * One open clock file: the ClockDoc, the store it came from, and the saving around it (PRD §3.3–§3.6).
 * Every change saves at once; saves never overlap; failures retry, then wait for "Try Again". A save that finds
 * the file changed somewhere else replays this window's unsaved operations onto it, and asks (Keep Mine, Use
 * Theirs) only when both sides changed the same thing. What happens when is decided by the table in
 * `saveChart.ts`; this class keeps the state and does the reading and writing.
 */
import { signal } from '@preact/signals';
import {
  ClockDoc,
  LISTS,
  NEWER_FILE_MESSAGE,
  applyOps,
  classifyFile,
  diffOps,
  emptyData,
  findClashes,
  readOps,
  replay,
  sameValue,
  serialize,
  type ClockData,
  type Op,
  type ReplayMode,
} from '@alarmony/core';
import { wait } from '../schedule.ts';
import { ConflictError, type ClockStore } from '../store/clockStore.ts';
import { SnapshotStore, readOnlyFolderMessage } from '../store/snapshotStore.ts';
import { step, type Effect, type SaveEvent, type SaveState } from './saveChart.ts';

export type SaveStatus = 'saved' | 'saving' | 'failed' | 'conflict';

/** This window's crash snapshot (PRD §3.6): one slot per window, so another window's is never offered. */
export interface RecoveryStorage {
  /** What a window that closed or crashed left unsaved, never one still open; null when there is none. */
  leftover(): Promise<string | null>;
  /** Forgets the leftover just offered (Restore or Discard). */
  dropLeftover(): void;
  /** Keeps this window's snapshot. False when it couldn't (the browser's storage is full or turned off). */
  set(text: string): boolean;
  /** False when it couldn't (storage turned off): the next start offers the snapshot again, which is safe. */
  clear(): boolean;
}

/** A recovery slot in memory: `text` is this window's, `left` what the last one left behind. */
export function memoryRecovery(left: string | null = null): RecoveryStorage & {
  text: string | null;
  left: string | null;
} {
  return {
    text: null,
    left,
    leftover() {
      return Promise.resolve(this.left);
    },
    dropLeftover() {
      this.left = null;
    },
    set(text) {
      this.text = text;
      return true;
    },
    clear() {
      this.text = null;
      return true;
    },
  };
}

export interface SessionOptions {
  readonly recovery?: RecoveryStorage;
  /** Waits between retries; tests pass one that doesn't. */
  readonly wait?: (ms: number) => Promise<void>;
  /** The zone for the one clock a new file starts with (PRD §3.1). */
  readonly zone?: string | null;
}

/** Waits before the 2nd and 3rd tries (PRD §3.4). */
export const RETRY_DELAYS = [300, 600] as const;

export interface Conflict {
  /** What both sides changed, by label or time: "Wake", "07:00", "Timer", "Stopwatch". */
  readonly items: readonly string[];
}

export interface OpenResult {
  readonly session: ClockSession;
  /** A message for the status bar: an unreadable file kept aside, or items skipped. */
  readonly notice: string | null;
}

/** The label of a change picked up from the file, for Undo (PRD §3.5). */
export const OUTSIDE_LABEL = 'Changes made elsewhere';

/** How many items, plus the stopwatch, differ between two files. */
export function countChanged(a: ClockData, b: ClockData): number {
  let n = sameValue(a.stopwatch, b.stopwatch) ? 0 : 1;
  for (const list of LISTS) {
    const left = new Map<string, unknown>(a[list].map((i) => [i.id, i]));
    const right = new Map<string, unknown>(b[list].map((i) => [i.id, i]));
    for (const id of new Set([...left.keys(), ...right.keys()]))
      if (!sameValue(left.get(id), right.get(id))) n++;
  }
  return n;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface TextRead {
  readonly data: ClockData | null;
  readonly skipped: number;
  readonly corrupt: boolean;
  /** From a newer Alarmony: shown read-only and never written (PRD §3.3). */
  readonly newer: boolean;
}

/** Reads file text at open. */
function readText(text: string | null): TextRead {
  if (text === null) return { data: null, skipped: 0, corrupt: false, newer: false };
  const r = classifyFile(text);
  if (r.kind === 'newer') return { data: r.data, skipped: 0, corrupt: false, newer: true };
  if (r.kind === 'corrupt') return { data: null, skipped: 0, corrupt: true, newer: false };
  return { data: r.data, skipped: r.skipped, corrupt: false, newer: false };
}

/** What the crash snapshot keeps: the file it started from and the operations not saved on top of it. */
export interface Snapshot {
  readonly version: string | null;
  readonly base: ClockData;
  readonly ops: readonly Op[];
}

const SNAPSHOT_KIND = 'alarmony-unsaved';

export function encodeSnapshot(snapshot: Snapshot, at: number): string {
  return JSON.stringify({
    kind: SNAPSHOT_KIND,
    at,
    version: snapshot.version,
    base: serialize(snapshot.base),
    ops: snapshot.ops,
  });
}

/**
 * A snapshot read back, or null when it can't be. An older Alarmony kept the whole file instead; that counts as
 * this window's changes on top of the file as it is now.
 */
export function readSnapshot(text: string, file: ClockData, version: string | null): Snapshot | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw === 'object' && raw !== null && (raw as { kind?: unknown }).kind === SNAPSHOT_KIND) {
    const r = raw as { version?: unknown; base?: unknown; ops?: unknown };
    const base = typeof r.base === 'string' ? classifyFile(r.base) : null;
    const ops = readOps(r.ops);
    if (base?.kind !== 'ok' || !ops) return null;
    return { version: typeof r.version === 'string' ? r.version : null, base: base.data, ops };
  }
  const whole = classifyFile(text);
  return whole.kind === 'ok' ? { version, base: file, ops: diffOps(file, whole.data) } : null;
}

export class ClockSession {
  readonly doc: ClockDoc;
  readonly store: ClockStore;
  readonly status = signal<SaveStatus>('saved');
  /** Both sides changed the same things; the UI asks Keep Mine or Use Theirs (PRD §3.5). */
  readonly conflict = signal<Conflict | null>(null);
  /** A conflict choice is reading the file; the dialog's buttons wait for it. */
  readonly choosing = signal(false);
  /** Unsaved changes another window left; the UI offers Restore or Discard (PRD §3.6). */
  readonly recoverable = signal<string | null>(null);
  /**
   * Nothing here changes the file: it is from a newer Alarmony (PRD §3.3), or the store can't be written (a folder
   * picked in Firefox or Safari, PRD §3.7). It is shown and rings. `lockReason` says which.
   */
  readonly readOnly = signal(false);
  /** False when the last change couldn't be kept in the recovery slot (PRD §3.6). */
  readonly backedUp = signal(true);
  /** Where the session's own notices go: a merge, a missing file written again. The app sets it. */
  onNotice: (text: string, tone?: 'error') => void = () => undefined;

  #state: SaveState = 'clean';
  #version: string | null;
  /** The file as of `#version`; `#pending` turns it into the data here. */
  #base: ClockData;
  /** This window's operations the file doesn't have yet (PRD §3.5). */
  #pending: Op[] = [];
  readonly #recovery: RecoveryStorage;
  readonly #wait: (ms: number) => Promise<void>;
  /** The write in progress and the data it writes. */
  #writing: Promise<void> | null = null;
  #sending: ClockData | null = null;
  /** The read after a write found the file changed; `flush` waits for it too. */
  #merging: Promise<void> | null = null;
  /** Bumped by `dropRead`, so a read that started before it is ignored when it finishes. */
  #reads = 0;
  /** The file a refresh, a merge or a conflict choice read. */
  #read: { version: string | null; data: ClockData | null } | null = null;
  #mode: ReplayMode = 'mine';
  #clashes: readonly string[] = [];
  /** Items the last `takeFile` changed, for `refresh` to return. */
  #taken: number | null = null;
  #leftover: Snapshot | null = null;

  private constructor(store: ClockStore, data: ClockData, version: string | null, opts: SessionOptions) {
    this.store = store;
    this.doc = new ClockDoc(data);
    this.#version = version;
    this.#base = data;
    this.#recovery = opts.recovery ?? memoryRecovery();
    this.#wait = opts.wait ?? wait;
    this.doc.onChange((change) => {
      // Changes from the file (picked up, merged, replaced) are already in it.
      if (change.kind === 'outside' || change.kind === 'merge' || change.kind === 'replace') return;
      this.#pending.push(...change.ops);
      this.#fire('edit');
    });
  }

  /** Loads the store's file and starts a session on it. */
  static async open(store: ClockStore, opts: SessionOptions = {}): Promise<OpenResult> {
    const file = await store.load();
    const read = readText(file.text);
    if (read.newer || store.readOnly) {
      const session = new ClockSession(store, read.data ?? emptyData(opts.zone ?? null), file.version, opts);
      session.#lock(true);
      // What another window left unsaved waits until this version can write the file. The app says why it can't.
      return { session, notice: null };
    }
    let notice: string | null = null;
    if (read.corrupt && file.text !== null) {
      const name = await store.saveCopy(file.text);
      notice = `clock.json couldn't be read. It was kept as ${name}, and a new one was started.`;
    } else if (read.skipped) {
      notice = `Skipped ${plural(read.skipped, 'item')} Alarmony couldn't read.`;
    }
    const data = read.data ?? emptyData(opts.zone ?? null);
    // Read what another window left unsaved before anything here can save.
    const recovery = opts.recovery ?? memoryRecovery();
    const left = await recovery.leftover();
    const session = new ClockSession(store, data, file.version, { ...opts, recovery });
    if (left !== null) {
      const snap = readSnapshot(left, data, file.version);
      if (snap && serialize(applyOps(snap.base, snap.ops)) !== serialize(data)) {
        session.#leftover = snap;
        session.recoverable.value = left;
      } else recovery.dropLeftover();
    }
    // A new file is written at once, and an unreadable one is replaced, so the next start finds it (PRD §3.1).
    if (read.data === null) session.#fire('edit');
    return { session, notice };
  }

  /** Why nothing here can change the file, while `readOnly` is true. */
  get lockReason(): string {
    return this.store instanceof SnapshotStore ? readOnlyFolderMessage(this.store.name) : NEWER_FILE_MESSAGE;
  }

  /** The version of the file this session last read or wrote. */
  get version(): string | null {
    return this.#version;
  }

  /** Where saving stands, as in the table in `saveChart.ts`. */
  get state(): SaveState {
    return this.#state;
  }

  /** Resolves once nothing is waiting to be saved (or saving has stopped on a failure or conflict). */
  async flush(): Promise<void> {
    while (this.#writing || this.#merging) await (this.#writing ?? this.#merging);
  }

  /** "Try Again" after a failed save. */
  retry(): void {
    this.#fire('retry');
  }

  /** Reads the state fresh, past what TypeScript remembers from before an `await`. */
  #is(state: SaveState): boolean {
    return this.#state === state;
  }

  #fire(event: SaveEvent): void {
    const { to, effects } = step(this.#state, event);
    this.#state = to;
    const asking = to === 'conflict' || to === 'choosing';
    this.status.value =
      to === 'clean' || to === 'refreshing'
        ? 'saved'
        : to === 'savingDirty' || to === 'merging'
          ? 'saving'
          : asking
            ? 'conflict'
            : to;
    if (!asking) this.conflict.value = null;
    this.choosing.value = to === 'choosing';
    for (const effect of effects) this.#run(effect);
  }

  #run(effect: Effect): void {
    switch (effect) {
      case 'snapshot': {
        const text = encodeSnapshot(
          { version: this.#version, base: this.#base, ops: this.#pending },
          Date.now(),
        );
        const kept = this.#recovery.set(text);
        // An older snapshot left in the slot would offer to restore stale data next time.
        if (!kept) this.#recovery.clear();
        this.backedUp.value = kept;
        return;
      }
      case 'clearSnapshot':
        this.#recovery.clear();
        return;
      case 'writeFile': {
        const data = this.doc.data;
        this.#sending = data;
        const writing: Promise<void> = this.#write(serialize(data)).finally(() => {
          if (this.#writing === writing) this.#writing = null;
        });
        this.#writing = writing;
        return;
      }
      case 'readFile':
        this.#read = null;
        return;
      case 'dropRead':
        this.#reads++;
        return;
      case 'takeFile': {
        const read = this.#read;
        this.#taken = null;
        if (!read?.data || read.version === this.#version) return;
        this.#taken = countChanged(this.doc.data, read.data);
        const ops = diffOps(this.doc.data, read.data);
        this.#version = read.version;
        this.#base = read.data;
        this.#pending = [];
        this.doc.takeOutside(read.data, ops, OUTSIDE_LABEL);
        return;
      }
      case 'readToMerge': {
        const merging: Promise<void> = this.#readToMerge().finally(() => {
          if (this.#merging === merging) this.#merging = null;
        });
        this.#merging = merging;
        return;
      }
      case 'mergeFile': {
        const read = this.#read;
        if (!read?.data) return;
        const merged = replay(this.#base, read.data, this.#pending, this.#mode);
        this.#version = read.version;
        this.#base = read.data;
        this.#pending = diffOps(read.data, merged.data);
        this.doc.merge(merged.data, !merged.dropped);
        return;
      }
      case 'showConflict':
        this.conflict.value = { items: this.#clashes };
        return;
    }
  }

  async #write(text: string): Promise<void> {
    try {
      this.#version = await this.#saveWithRetry(text);
    } catch (e) {
      if (e instanceof ConflictError) {
        this.#fire('versionChanged');
      } else {
        console.error(e);
        this.#fire('failed');
      }
      return;
    }
    // The file now has what was sent; what changed here since stays pending.
    const sent = this.#sending ?? this.doc.data;
    this.#base = sent;
    this.#pending = diffOps(sent, this.doc.data);
    this.#sending = null;
    this.#fire('saved');
  }

  async #saveWithRetry(text: string): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.store.save(text, this.#version);
      } catch (e) {
        const delay = RETRY_DELAYS[attempt];
        if (e instanceof ConflictError || delay === undefined) throw e;
        await this.#wait(delay);
      }
    }
  }

  /**
   * After a write found the file changed (PRD §3.5): replays this window's operations onto it, or asks when both
   * sides changed the same things. A missing or unreadable file has nothing to merge with, so this window's data
   * is written again (an unreadable one is kept aside first).
   */
  async #readToMerge(): Promise<void> {
    try {
      const file = await this.store.load();
      if (!this.#is('merging')) return;
      const r = file.text === null ? null : classifyFile(file.text);
      if (r?.kind === 'newer') throw new Error(NEWER_FILE_MESSAGE);
      if (r?.kind === 'ok') {
        this.#read = { version: file.version, data: r.data };
        const clashes = findClashes(this.#base, r.data, this.#pending);
        if (clashes.length) {
          this.#clashes = [...new Set(clashes.map((c) => c.name))];
          this.#fire('clashed');
          return;
        }
        this.#mode = 'mine';
        this.#fire('merged');
        this.onNotice('Merged with changes made elsewhere.');
        return;
      }
      let notice = 'clock.json was missing, so it was saved again.';
      if (r?.kind === 'corrupt' && file.text !== null) {
        notice = `clock.json couldn't be read. It was kept as ${await this.store.saveCopy(file.text)}.`;
        if (!this.#is('merging')) return;
      }
      this.#read = { version: file.version, data: this.#base };
      this.#mode = 'mine';
      this.#fire('merged');
      this.onNotice(notice);
    } catch (e) {
      console.error(e);
      if (!this.#is('merging')) return;
      this.#fire('mergeFailed');
      if (e instanceof Error && e.message === NEWER_FILE_MESSAGE) this.onNotice(e.message, 'error');
    }
  }

  /**
   * Looks for a change made somewhere else (the CLI, another window, another device) and takes it as one undo
   * step when this window has nothing unsaved (PRD §3.5). Returns how many items it changed, or null when it
   * took nothing. With unsaved changes it leaves the file alone: the next save merges with it.
   */
  async refresh(): Promise<number | null> {
    if (this.readOnly.peek()) return this.#refreshReadOnly();
    if (this.#state !== 'clean') return null;
    this.#fire('refresh');
    const reads = this.#reads;
    // A file that can't be read or parsed leaves nothing to take; the next refresh tries again.
    const read = await this.store.load().then(
      (file) => {
        const r = file.text === null ? null : classifyFile(file.text);
        return { version: file.version, data: r?.kind === 'ok' ? r.data : null };
      },
      () => ({ version: this.#version, data: null }),
    );
    // A change made here while the file was being read wins: its save merges with the file.
    if (reads !== this.#reads || !this.#is('refreshing')) return null;
    this.#read = read;
    this.#fire('refreshRead');
    return this.#taken;
  }

  #lock(locked: boolean): void {
    this.doc.locked = locked;
    this.readOnly.value = locked;
  }

  /**
   * A read-only file follows the file as it changes, and opens for editing once it is one this version can write
   * (PRD §3.3). A missing or unreadable file leaves what is shown; nothing is written either way. It returns null:
   * there is no history to undo the change with.
   */
  async #refreshReadOnly(): Promise<null> {
    const file = await this.store.load().catch(() => null);
    const r = file && file.text !== null ? classifyFile(file.text) : null;
    if (!file || !this.readOnly.peek() || file.version === this.#version) return null;
    const data = r?.kind === 'ok' ? r.data : r?.kind === 'newer' ? r.data : null;
    if (!data) return null;
    this.#base = data;
    this.#version = file.version;
    this.doc.replace(data);
    if (r?.kind === 'ok' && !this.store.readOnly) {
      this.#lock(false);
      this.onNotice('clock.json can be changed again.');
    }
    return null;
  }

  /** Conflict → Use Theirs: their side of every clash; this window's other changes stay. */
  useTheirs(): Promise<string | null> {
    return this.#choose('theirs');
  }

  /** Conflict → Keep Mine: every change here, over theirs. Returns a notice when the file was kept aside. */
  keepMine(): Promise<string | null> {
    return this.#choose('mine');
  }

  async #choose(mode: ReplayMode): Promise<string | null> {
    if (!this.#is('conflict')) return null;
    this.#fire('choose');
    let notice: string | null;
    try {
      const file = await this.store.load();
      const r = file.text === null ? null : classifyFile(file.text);
      // A file from a newer Alarmony is never written (PRD §3.3); the conflict waits for another choice.
      if (r?.kind === 'newer') throw new Error(NEWER_FILE_MESSAGE);
      // An unreadable one is never written over without a copy (PRD §3.3).
      const kept = r?.kind === 'corrupt' && file.text !== null ? await this.store.saveCopy(file.text) : null;
      this.#read = { version: file.version, data: r?.kind === 'ok' ? r.data : this.#base };
      this.#mode = mode;
      notice = kept && `clock.json couldn't be read. It was kept as ${kept}.`;
    } catch (e) {
      this.#fire('chooseFailed');
      throw e;
    }
    this.#fire('chosen');
    await this.flush();
    return notice;
  }

  /** Recovery → Restore: replay the other window's unsaved operations onto the file, through the merge (§3.5). */
  restoreRecovered(): void {
    const snap = this.#leftover;
    this.#leftover = null;
    this.recoverable.value = null;
    this.#recovery.dropLeftover();
    if (!snap) return;
    this.doc.replace(applyOps(snap.base, snap.ops));
    this.#base = snap.base;
    this.#pending = [...snap.ops];
    this.#version = snap.version;
    this.#fire('edit');
  }

  /** Recovery → Discard. */
  discardRecovered(): void {
    this.#leftover = null;
    this.recoverable.value = null;
    this.#recovery.dropLeftover();
  }
}
