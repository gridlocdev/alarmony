/**
 * One open clock file: the ClockDoc, the store it came from, and the saving around it (PRD §3.3–§3.6).
 * Every change saves at once; saves never overlap; failures retry, then wait for "Try Again"; a conflict stops
 * saving until the user picks Keep Mine or Use Theirs. What happens when is decided by the table in
 * `saveChart.ts`; this class keeps the state and does the reading and writing.
 */
import { signal } from '@preact/signals';
import {
  ClockDoc,
  LISTS,
  NEWER_FILE_MESSAGE,
  classifyFile,
  emptyData,
  sameValue,
  serialize,
  type ClockData,
} from '@alarmony/core';
import { wait } from '../schedule.ts';
import { ConflictError, type ClockStore } from '../store/clockStore.ts';
import { step, type Effect, type SaveEvent, type SaveState } from './saveChart.ts';

export type SaveStatus = 'saved' | 'saving' | 'failed' | 'conflict';

/** Keeps the data being saved until the save lands (PRD §3.6). */
export interface RecoveryStorage {
  get(): string | null;
  /** False when it couldn't keep the text (the browser's storage is full or turned off). */
  set(text: string): boolean;
  /** False when it couldn't (storage turned off): the next start offers the snapshot again, which is safe. */
  clear(): boolean;
}

export function memoryRecovery(): RecoveryStorage & { text: string | null } {
  return {
    text: null,
    get() {
      return this.text;
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
  /** How many items differ between this window and the file. */
  readonly changed: number;
}

export interface OpenResult {
  readonly session: ClockSession;
  /** A message for the status bar: an unreadable file kept aside, or items skipped. */
  readonly notice: string | null;
}

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

/** Reads file text; a newer file stops here (PRD §3.3: slice 1 refuses it rather than showing it read-only). */
function readText(text: string | null): { data: ClockData | null; skipped: number; corrupt: boolean } {
  if (text === null) return { data: null, skipped: 0, corrupt: false };
  const r = classifyFile(text);
  if (r.kind === 'newer') throw new Error(NEWER_FILE_MESSAGE);
  if (r.kind === 'corrupt') return { data: null, skipped: 0, corrupt: true };
  return { data: r.data, skipped: r.skipped, corrupt: false };
}

export class ClockSession {
  readonly doc: ClockDoc;
  readonly store: ClockStore;
  readonly status = signal<SaveStatus>('saved');
  readonly conflict = signal<Conflict | null>(null);
  /** A conflict choice is reading the file; the dialog's buttons wait for it. */
  readonly choosing = signal(false);
  /** Unsaved data from last time that differs from the file; the UI offers Restore or Discard (PRD §3.6). */
  readonly recoverable = signal<string | null>(null);
  /** False when the last save's data couldn't be kept in the recovery slot (PRD §3.6). */
  readonly backedUp = signal(true);

  #state: SaveState = 'clean';
  #version: string | null;
  readonly #recovery: RecoveryStorage;
  readonly #wait: (ms: number) => Promise<void>;
  /** The write in progress, then the conflict count if it found one; `flush` waits for both. */
  #writing: Promise<void> | null = null;
  #counting: Promise<void> | null = null;
  /** Bumped by `dropRead`, so a read that started before it is ignored when it finishes. */
  #reads = 0;
  /** The file a refresh or Use Theirs read, for `takeFile` and `replaceWithFile`. */
  #read: { version: string | null; data: ClockData | null } | null = null;
  /** Items the last `takeFile` changed, for `refresh` to return. */
  #taken: number | null = null;

  private constructor(store: ClockStore, data: ClockData, version: string | null, opts: SessionOptions) {
    this.store = store;
    this.doc = new ClockDoc(data);
    this.#version = version;
    this.#recovery = opts.recovery ?? memoryRecovery();
    this.#wait = opts.wait ?? wait;
    this.doc.onChange((change) => {
      if (change.kind !== 'replace') this.#fire('edit');
    });
  }

  /** Loads the store's file and starts a session on it. */
  static async open(store: ClockStore, opts: SessionOptions = {}): Promise<OpenResult> {
    const file = await store.load();
    const read = readText(file.text);
    let notice: string | null = null;
    if (read.corrupt && file.text !== null) {
      const name = await store.saveCopy(file.text);
      notice = `clock.json couldn't be read. It was kept as ${name}, and a new one was started.`;
    } else if (read.skipped) {
      notice = `Skipped ${plural(read.skipped, 'item')} Alarmony couldn't read.`;
    }
    const data = read.data ?? emptyData(opts.zone ?? null);
    // Read last time's unsaved data before anything here can save.
    const recovery = opts.recovery ?? memoryRecovery();
    const saved = recovery.get();
    const session = new ClockSession(store, data, file.version, { ...opts, recovery });
    if (saved !== null) {
      if (saved !== serialize(data) && classifyFile(saved).kind === 'ok') session.recoverable.value = saved;
      else recovery.clear();
    }
    // A new file is written at once, and an unreadable one is replaced, so the next start finds it (PRD §3.1).
    if (read.data === null) session.#fire('edit');
    return { session, notice };
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
    while (this.#writing || this.#counting) await (this.#writing ?? this.#counting);
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
        : to === 'savingDirty'
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
        // While last time's unsaved data waits for Restore or Discard, it keeps the recovery slot.
        if (this.recoverable.value !== null) return;
        const kept = this.#recovery.set(serialize(this.doc.data));
        // An older backup left in the slot would offer to restore stale data next time.
        if (!kept) this.#recovery.clear();
        this.backedUp.value = kept;
        return;
      }
      case 'clearSnapshot':
        if (this.recoverable.value === null) this.#recovery.clear();
        return;
      case 'writeFile': {
        const writing: Promise<void> = this.#write(serialize(this.doc.data)).finally(() => {
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
        this.#version = read.version;
        this.doc.replace(read.data);
        return;
      }
      case 'replaceWithFile': {
        const read = this.#read;
        if (!read) return;
        this.#version = read.version;
        this.doc.replace(read.data ?? emptyData());
        return;
      }
      case 'showConflict': {
        const counting: Promise<void> = this.#changedOnDisk().then((changed) => {
          if (this.#state === 'conflict' || this.#state === 'choosing') this.conflict.value = { changed };
          if (this.#counting === counting) this.#counting = null;
        });
        this.#counting = counting;
        return;
      }
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

  async #changedOnDisk(): Promise<number> {
    try {
      const file = await this.store.load();
      const r = file.text === null ? null : classifyFile(file.text);
      return countChanged(this.doc.data, r?.kind === 'ok' ? r.data : emptyData());
    } catch {
      return 0;
    }
  }

  /**
   * Looks for a change made somewhere else (the CLI, another window, another device) and takes it when this
   * window has nothing unsaved (PRD §3.5). Returns how many items it changed, or null when it took nothing.
   * With unsaved changes it leaves the file alone: the next save finds the conflict and asks.
   */
  async refresh(): Promise<number | null> {
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
    // A change made here while the file was being read wins: its save will see the conflict.
    if (reads !== this.#reads || !this.#is('refreshing')) return null;
    this.#read = read;
    this.#fire('refreshRead');
    return this.#taken;
  }

  /** Conflict → Use Theirs: take the file on disk; this window's unsaved changes are dropped. */
  async useTheirs(): Promise<string | null> {
    if (!this.#is('conflict')) return null;
    this.#fire('choose');
    return this.#choosing(() => this.#takeTheirs());
  }

  /** Conflict → Keep Mine: save this window's data over the file. */
  async keepMine(): Promise<void> {
    if (!this.#is('conflict')) return;
    this.#fire('choose');
    await this.#choosing(async () => {
      const file = await this.store.load();
      // A file from a newer Alarmony is never written (PRD §3.3); the conflict waits for another choice.
      if (file.text !== null && classifyFile(file.text).kind === 'newer') throw new Error(NEWER_FILE_MESSAGE);
      this.#version = file.version;
      this.#fire('keepMine');
    });
    await this.flush();
  }

  /** Runs a conflict choice; if it fails, the dialog comes back for another. */
  async #choosing<T>(choice: () => Promise<T>): Promise<T> {
    try {
      return await choice();
    } catch (e) {
      this.#fire('chooseFailed');
      throw e;
    }
  }

  async #takeTheirs(): Promise<string | null> {
    const file = await this.store.load();
    const read = readText(file.text);
    let notice: string | null = null;
    if (read.corrupt && file.text !== null) {
      const name = await this.store.saveCopy(file.text);
      notice = `clock.json couldn't be read. It was kept as ${name}.`;
    }
    this.#read = { version: file.version, data: read.data ?? emptyData() };
    this.#fire('takeTheirs');
    // The unreadable or missing file is written again from the data here.
    if (read.data === null) this.#fire('edit');
    return notice;
  }

  /** Recovery → Restore: put last time's unsaved data back, and save it. */
  restoreRecovered(): void {
    const text = this.recoverable.value;
    this.recoverable.value = null;
    if (text === null) return;
    const r = classifyFile(text);
    if (r.kind !== 'ok') return;
    this.doc.replace(r.data);
    this.#fire('edit');
  }

  /** Recovery → Discard. */
  discardRecovered(): void {
    this.recoverable.value = null;
    this.#recovery.clear();
  }
}
