/**
 * The app's state and actions: the open tab, dialogs, notices, the selected timer and what is ringing. Every edit
 * goes through `edit`, so it is one undo step (PRD §11). Time comes from the `now` passed in, so tests set it.
 */
import { batch, computed, effect, signal, type Signal } from '@preact/signals';
import {
  DEFAULT_SOUND,
  MISSED_LOOKBACK_MS,
  RING_LATE_MS,
  RING_LIMIT_MS,
  alarmIsOn,
  dueNow,
  isDone,
  newId,
  shouldRing,
  soonestTimer,
  timerKey,
  timerLeft,
  formatCountdown,
  type Alarm,
  type WorldClock,
  type AlarmWindow,
  type ClockData,
  type Due,
  type Op,
  type Timer,
  NEWER_FILE_MESSAGE,
} from '@alarmony/core';
import {
  deviceMemory,
  lookSince,
  saveSettings,
  type ClockSession,
  type DeviceMemory,
  type DeviceSettings,
  type RungLog,
  type SaveStatus,
  type Tab,
} from '@alarmony/ui';
import { freshAnnouncement } from './announce.ts';
import { clockTime } from './time.ts';
import { trayState } from './tray.ts';
import { ItemMenu } from './itemMenu.ts';

/** How long a notice stays (PRD §5.3). */
export const NOTICE_MS = 5000;
/** A hidden window looks for changes made elsewhere this often, so it rings what was added there (PRD §3.5). */
export const HIDDEN_REFRESH_MS = 60_000;

/** How often the device notes that it is running, so a later start knows what it missed (PRD §9.4). */
const SEEN_EVERY_MS = 60_000;

/** The tabs, in toolbar order (PRD §5.1). */
export const TABS: readonly { readonly id: Tab; readonly title: string }[] = [
  { id: 'timers', title: 'Timers' },
  { id: 'stopwatch', title: 'Stopwatch' },
  { id: 'alarms', title: 'Alarms' },
  { id: 'world', title: 'World Clock' },
];

export type DialogState =
  | { readonly kind: 'menu'; readonly initial: string }
  | { readonly kind: 'shortcuts' }
  | { readonly kind: 'settings' }
  | { readonly kind: 'addClock' }
  | { readonly kind: 'renameClock'; readonly id: string }
  | { readonly kind: 'newTimer' }
  | { readonly kind: 'editTimer'; readonly id: string }
  | { readonly kind: 'newAlarm' }
  | { readonly kind: 'editAlarm'; readonly id: string }
  | { readonly kind: 'renamePreset'; readonly id: string };

export interface Notice {
  readonly text: string;
  readonly action?: { readonly label: string; readonly run: () => void };
  /** Stays until dismissed. */
  readonly sticky?: boolean;
  readonly tone?: 'error';
}

/** What the app needs from the page: a clock, a timer for notices, and sound. Tests pass their own. */
export interface AppDeps {
  readonly now: () => number;
  readonly version: string;
  readonly settings: DeviceSettings;
  readonly rung: RungLog;
  /** Calls `run` after `ms`; returns a cancel function. */
  readonly after?: (ms: number, run: () => void) => () => void;
  readonly sound?: SoundOut;
  /** Keeps device settings; the page's storage by default. */
  readonly saveSettings?: (s: DeviceSettings) => void;
  /** This device's time zone: alarms ring on its clock (PRD §9.1). The system's by default. */
  readonly zone?: string;
  /** Snoozes and the last time this device looked for due alarms; memory only by default. */
  readonly memory?: DeviceMemory;
  /** Shows a system notification (PRD §9.2). */
  readonly notify?: (title: string) => void;
  /** Asks the browser to allow notifications; called from a click. */
  readonly askToNotify?: () => void;
  /** Desktop only: asks for another folder and reloads from it (PRD §3.7). */
  readonly openFolder?: () => Promise<void>;
}

/** The sound player as the controller uses it. */
export interface SoundOut {
  readonly allowed: boolean;
  readonly ringing: boolean;
  unlock(): void;
  ring(id: string, volume: number): void;
  stop(): void;
  preview(id: string, volume: number): void;
}

const SILENT: SoundOut = {
  allowed: true,
  ringing: false,
  unlock: () => undefined,
  ring: () => undefined,
  stop: () => undefined,
  preview: () => undefined,
};

const shown = (tab: Tab): Tab => (TABS.some((t) => t.id === tab) ? tab : 'world');
const quoted = (label: string) => (label ? `“${label}”` : 'timer');
/** What decides when an alarm rings: a change to any of it starts its due times afresh. */
const ringSig = (a: Alarm) => `${a.enabled}|${a.time}|${a.days.join(',')}|${a.once ?? ''}`;

export class AppController {
  readonly session: ClockSession;
  readonly version: string;
  readonly zone: string;
  /** Desktop only: Open Folder…; null in the browser. */
  readonly openFolder: (() => Promise<void>) | null;
  readonly now: () => number;
  /** The file's data; changes with every edit, undo and refresh. */
  readonly data: Signal<ClockData>;
  /** Bumped on every change to the data, for things that read the undo history. */
  readonly rev = signal(0);
  /** The time the page last ticked: the countdowns read it. */
  readonly clock: Signal<number>;
  /** The stopwatch display's time, ticked every frame while it shows a running stopwatch (PRD §8.1). */
  readonly frame: Signal<number>;
  readonly settings: Signal<DeviceSettings>;
  readonly tab: Signal<Tab>;
  readonly dialog = signal<DialogState | null>(null);
  readonly notice = signal<Notice | null>(null);
  readonly announcement = signal('');
  readonly selected = signal<string | null>(null);
  readonly itemMenu = new ItemMenu();
  /** What is ringing on this device, newest first (PRD §9.2). */
  readonly ringing = signal<readonly Due[]>([]);
  /** Something rings but the browser won't play sound until the page is clicked (PRD §9.4). */
  readonly soundWaiting = signal(false);

  /** The stopwatch display needs every frame. */
  readonly wantsFrames = computed(
    () => this.tab.value === 'stopwatch' && this.data.value.stopwatch.state === 'running',
  );
  readonly selectedTimer = computed<Timer | null>(
    () => this.data.value.timers.find((t) => t.id === this.selected.value) ?? null,
  );
  readonly selectedClock = computed<WorldClock | null>(
    () => this.data.value.clocks.find((c) => c.id === this.selected.value) ?? null,
  );
  readonly selectedAlarm = computed<Alarm | null>(
    () => this.data.value.alarms.find((a) => a.id === this.selected.value) ?? null,
  );

  readonly #rung: RungLog;
  readonly #after: (ms: number, run: () => void) => () => void;
  readonly #sound: SoundOut;
  readonly #saveSettings: (s: DeviceSettings) => void;
  readonly #memory: DeviceMemory;
  readonly #notify: (title: string) => void;
  readonly #askToNotify: () => void;
  /** Per alarm: what decides its ring times, and since when its due times count (PRD §9.4). */
  readonly #alarmSince = new Map<string, { sig: string; since: number }>();
  #seenSaved = -Infinity;
  /** The sound ringing now, so a newer alarm with another sound takes over. */
  #ringSound: string | null = null;
  #missedTimersOnly = true;
  #dropNotice: (() => void) | null = null;
  #lastRefresh = -Infinity;
  /** A sticky error a passing notice covers for now. */
  #underneath: Notice | null = null;
  /** The names in the Missed notice now showing, so the next miss joins it. */
  #missed: string[] = [];
  #missedNotice: Notice | null = null;

  constructor(session: ClockSession, deps: AppDeps) {
    this.session = session;
    this.version = deps.version;
    this.openFolder = deps.openFolder ?? null;
    this.now = deps.now;
    this.#rung = deps.rung;
    this.#after = deps.after ?? (() => () => undefined);
    this.#sound = deps.sound ?? SILENT;
    this.#saveSettings = deps.saveSettings ?? ((s) => void saveSettings(s));
    this.zone = deps.zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.#memory = deps.memory ?? deviceMemory(false);
    this.#notify = deps.notify ?? (() => undefined);
    this.#askToNotify = deps.askToNotify ?? (() => undefined);
    const now = deps.now();
    // On start, alarms count from the last time this device ran, so what came due meanwhile rings or is missed.
    const since = lookSince(this.#memory.seen(), now, now - RING_LATE_MS);
    for (const a of session.doc.data.alarms) this.#alarmSince.set(a.id, { sig: ringSig(a), since });
    this.data = signal(session.doc.data);
    this.clock = signal(now);
    this.frame = signal(now);
    this.settings = signal(deps.settings);
    this.tab = signal(shown(deps.settings.tab));
    session.onNotice = (text, tone) => this.say(text, tone ? { tone, sticky: true } : {});
    // A file from a newer Alarmony says so for as long as it is shown read-only (PRD §3.3).
    let locked: Notice | null = null;
    effect(() => {
      if (session.readOnly.value) {
        this.say(NEWER_FILE_MESSAGE, { tone: 'error', sticky: true });
        locked = this.notice.peek();
      } else if (locked) {
        if (this.notice.peek() === locked) this.notice.value = null;
        if (this.#underneath === locked) this.#underneath = null;
        locked = null;
      }
    });
    session.doc.onChange((change) => {
      batch(() => {
        this.data.value = session.doc.data;
        this.rev.value++;
        // An Undo button belongs to the edit before; another edit takes it away (PRD §5.3).
        const n = this.notice.peek();
        if (n?.action?.label === 'Undo' && change.kind !== 'setting')
          this.notice.value = n.sticky ? { ...n, action: undefined } : null;
        this.#noteAlarmChanges(
          change.kind === 'replace' || change.kind === 'outside' || change.kind === 'merge',
        );
        this.#forgetGoneRings();
        // An editor for an item that went (undo, Use Theirs, a change made elsewhere) has nothing to show.
        const d = this.dialog.peek();
        const data = session.doc.data;
        if (
          (d?.kind === 'editTimer' && !data.timers.some((t) => t.id === d.id)) ||
          (d?.kind === 'editAlarm' && !data.alarms.some((a) => a.id === d.id)) ||
          (d?.kind === 'renameClock' && !data.clocks.some((c) => c.id === d.id)) ||
          (d?.kind === 'renamePreset' && !data.presets.some((p) => p.id === d.id))
        )
          this.dialog.value = null;
      });
    });
  }

  get doc() {
    return this.session.doc;
  }

  // ── Edits ────────────────────────────────────────────────────────────────

  /** Applies an edit as one undo step and says `said` with Undo. False when it changed nothing. */
  edit(ops: readonly Op[] | null, label: string, said?: string): boolean {
    // The edit is stamped with the time now, so the view shows it at that time too, not the last tick's: a new
    // 3-minute timer reads 3:00, not 3:01.
    this.clock.value = Math.max(this.clock.peek(), this.now());
    if (this.#refuseLocked()) return false;
    const done = this.doc.apply(ops, label);
    if (done && said) this.sayUndoable(said);
    return done;
  }

  /** True, after saying why, when the file is read-only (PRD §3.3). */
  #refuseLocked(): boolean {
    if (!this.doc.locked) return false;
    this.say(NEWER_FILE_MESSAGE, { tone: 'error' });
    return true;
  }

  undo(): void {
    if (this.#refuseLocked()) return;
    const step = this.doc.undo();
    if (step) this.say(`Undid ${step.label.toLowerCase()}.`);
  }

  redo(): void {
    if (this.#refuseLocked()) return;
    const step = this.doc.redo();
    if (step) this.say(`Redid ${step.label.toLowerCase()}.`);
  }

  newId(prefix: string): string {
    const d = this.data.peek();
    return newId(prefix, new Set([...d.clocks, ...d.alarms, ...d.timers, ...d.presets].map((i) => i.id)));
  }

  describeTimer(t: Timer): string {
    return quoted(t.label);
  }

  // ── Notices ──────────────────────────────────────────────────────────────

  say(text: string, opts: Omit<Notice, 'text'> = {}): void {
    this.#dropNotice?.();
    this.#dropNotice = null;
    const notice: Notice = { text, ...opts };
    // A passing notice covers a sticky error for a while; the error comes back when it goes (PRD §3.4).
    const shown = this.notice.peek();
    if (notice.sticky) this.#underneath = null;
    else if (shown?.sticky && shown.tone === 'error') this.#underneath = shown;
    this.notice.value = notice;
    this.announcement.value = freshAnnouncement(text, this.announcement.peek());
    if (!notice.sticky)
      this.#dropNotice = this.#after(NOTICE_MS, () => {
        if (this.notice.peek() !== notice) return;
        this.notice.value = this.#underneath;
        this.#underneath = null;
      });
  }

  sayUndoable(text: string): void {
    this.say(text, { action: { label: 'Undo', run: () => this.undo() } });
  }

  dismissNotice(): void {
    const covered = this.notice.peek() !== this.#underneath;
    this.notice.value = covered ? this.#underneath : null;
    this.#underneath = null;
  }

  /** The save state moved: a failed save stays in the status bar until it works (PRD §3.4). */
  saveStatusChanged(status: SaveStatus): void {
    if (status === 'failed')
      this.say("Couldn't save. Your changes are kept here and Alarmony keeps trying.", {
        sticky: true,
        tone: 'error',
        action: { label: 'Try Again', run: () => this.session.retry() },
      });
    else if (status === 'saved') {
      const tryAgain = (n: Notice | null) => n?.tone === 'error' && n.action?.label === 'Try Again';
      if (tryAgain(this.#underneath)) this.#underneath = null;
      if (tryAgain(this.notice.peek())) this.notice.value = null;
    }
  }

  /**
   * Looks for changes made elsewhere (PRD §3.5): the page calls this on focus, on showing and every 15 s; while
   * hidden it reads at most once a minute. A failed save is tried again first. A change it takes is one undo
   * step, said with Undo. Returns how many items changed.
   */
  async refreshFromFile(hidden: boolean): Promise<number | null> {
    this.tick();
    if (this.session.status.peek() === 'failed') this.session.retry();
    const now = this.now();
    if (this.dialog.peek()) return null;
    if (hidden && now - this.#lastRefresh < HIDDEN_REFRESH_MS) return null;
    this.#lastRefresh = now;
    const changed = await this.session.refresh();
    if (changed) this.sayUndoable('Updated with changes made elsewhere.');
    return changed;
  }

  // ── Tabs, dialogs, settings ──────────────────────────────────────────────

  showTab(tab: Tab): void {
    this.tab.value = shown(tab);
    this.setSettings({ tab: this.tab.value });
  }

  open(dialog: DialogState): void {
    this.dialog.value = dialog;
  }

  close(): void {
    this.dialog.value = null;
  }

  /** A dialog, the ringing sheet or a save question is in front, so single keys don't reach the tabs. */
  blocked(): boolean {
    return (
      this.dialog.value !== null ||
      this.ringing.value.length > 0 ||
      this.session.conflict.value !== null ||
      this.session.recoverable.value !== null
    );
  }

  setSettings(patch: Partial<DeviceSettings>): void {
    this.settings.value = { ...this.settings.peek(), ...patch };
    this.#saveSettings(this.settings.peek());
    if (patch.ring === false) this.stopAll();
  }

  // ── Time and ringing ─────────────────────────────────────────────────────

  /** Once a second: move the countdowns on and ring anything that came due (PRD §9.5). */
  tick(): void {
    const now = this.now();
    batch(() => {
      this.clock.value = now;
      this.#checkDue(now);
    });
  }

  /** Every frame while the stopwatch shows and runs. */
  tickFrame(): void {
    this.frame.value = this.now();
  }

  /** The window title: the soonest timer's time left, as a menu bar would show it. */
  readonly title = computed(() => {
    const now = this.clock.value;
    const t = soonestTimer(this.data.value.timers, now);
    return t ? `${formatCountdown(timerLeft(t, now))} · Alarmony` : 'Alarmony';
  });

  /** What the desktop app's menu bar icon shows (PRD §15). */
  readonly tray = computed(() =>
    trayState({
      data: this.data.value,
      now: this.clock.value,
      zone: this.zone,
      format: this.settings.value.timeFormat,
      ringing: this.ringing.value,
      countdown: this.settings.value.menuBarCountdown,
    }),
  );

  /**
   * An alarm whose ring time changed counts its due times from the moment of the change (PRD §9.3), so moving it to
   * a time just gone doesn't ring it. A change from the file may have come due while it was on its way, so it
   * looks back as far as ringing late allows.
   */
  #noteAlarmChanges(fromFile: boolean): void {
    const now = this.now();
    for (const a of this.session.doc.data.alarms) {
      const sig = ringSig(a);
      const known = this.#alarmSince.get(a.id);
      if (known?.sig === sig) continue;
      const since = fromFile ? Math.min(known?.since ?? now, now - RING_LATE_MS) : now;
      this.#alarmSince.set(a.id, { sig, since });
    }
  }

  #sinceFor(a: Alarm, now: number): number {
    const known = this.#alarmSince.get(a.id);
    return known?.sig === ringSig(a) ? known.since : now;
  }

  #checkDue(now: number): void {
    const snoozes = this.#memory.snoozes();
    const window: AlarmWindow = { zone: this.zone, since: (a) => this.#sinceFor(a, now), snoozes };
    const due = dueNow(this.data.peek(), now, this.#rung.keys(), window);
    // Due times before this check have been seen; later checks needn't look so far back.
    for (const e of this.#alarmSince.values()) e.since = Math.max(e.since, now - RING_LATE_MS);
    if (snoozes.some((s) => s.at <= now)) this.#memory.setSnoozes(snoozes.filter((s) => s.at > now));
    if (now - this.#seenSaved >= SEEN_EVERY_MS) {
      this.#seenSaved = now;
      this.#memory.setSeen(now);
    }
    const ring: Due[] = [];
    const missed: Due[] = [];
    for (const d of due) {
      this.#rung.add(d.key, now);
      if (!this.settings.peek().ring) continue;
      if (shouldRing(d, now)) ring.push(d);
      // Anything older than a day is past news, not a missed timer (PRD §9.4).
      else if (now - d.at <= MISSED_LOOKBACK_MS) missed.push(d);
    }
    // Ringing stops by itself after 15 minutes and leaves a notice (PRD §9.2).
    const left = this.ringing.peek().filter((r) => now - r.at < RING_LIMIT_MS || ring.includes(r));
    const timedOut = this.ringing.peek().filter((r) => !left.includes(r));
    this.#sayMissed([...missed, ...timedOut]);
    if (ring.length || timedOut.length) this.#setRinging([...ring.reverse(), ...left]);
    if (ring.length) {
      const said = ring.map((r) => this.ringTitle(r)).join(', ');
      this.announcement.value = freshAnnouncement(said, this.announcement.peek());
      if (this.settings.peek().notifications) for (const r of ring) this.#notify(this.ringTitle(r));
    }
  }

  /** "Wake up · 7:00 AM" or "Pasta · Timer done" (PRD §9.2). */
  ringTitle(d: Due): string {
    return d.kind === 'alarm'
      ? `${d.label || 'Alarm'} · ${clockTime(d.at, this.settings.peek().timeFormat)}`
      : `${d.label || 'Timer'} · Timer done`;
  }

  /** One sticky notice names everything missed since it was last dismissed (PRD §9.4). */
  #sayMissed(list: readonly Due[]): void {
    if (!list.length) return;
    const shown = this.notice.peek();
    const joining = shown !== null && shown === this.#missedNotice;
    const format = this.settings.peek().timeFormat;
    this.#missed = [
      ...(joining ? this.#missed : []),
      ...list.map((d) =>
        d.kind === 'alarm' ? `${d.label || 'Alarm'} at ${clockTime(d.at, format)}` : d.label || 'Timer',
      ),
    ];
    this.#missedTimersOnly = (!joining || this.#missedTimersOnly) && list.every((d) => d.kind === 'timer');
    const names =
      this.#missed.length === 1
        ? this.#missed[0]!
        : `${this.#missed.slice(0, -1).join(', ')} and ${this.#missed.at(-1)!}`;
    this.say(this.#missedTimersOnly ? `Missed: ${names} finished.` : `Missed: ${names}.`, { sticky: true });
    this.#missedNotice = this.notice.peek();
  }

  #setRinging(list: readonly Due[]): void {
    this.ringing.value = list;
    if (!list.length) {
      this.#sound.stop();
      this.#ringSound = null;
      this.soundWaiting.value = false;
      return;
    }
    // One sound plays: the newest's (PRD §9.2).
    const sound = list[0]!.sound;
    if (!this.#sound.ringing || sound !== this.#ringSound) {
      if (this.#sound.ringing) this.#sound.stop();
      this.#sound.ring(sound, this.settings.peek().volume);
      this.#ringSound = sound;
    }
    this.soundWaiting.value = !this.#sound.allowed;
  }

  /** A ringing timer that was restarted, reset or deleted stops ringing; so does an alarm deleted or turned off. */
  #forgetGoneRings(): void {
    const data = this.data.peek();
    const timers = new Map(data.timers.map((t) => [t.id, t]));
    const alarms = new Map(data.alarms.map((a) => [a.id, a]));
    const list = this.ringing.peek();
    const left = list.filter((r) => {
      if (r.kind === 'alarm') return alarms.get(r.id)?.enabled === true;
      const t = timers.get(r.id);
      return t !== undefined && timerKey(t) === r.key;
    });
    if (left.length !== list.length) this.#setRinging(left);
    const snoozes = this.#memory.snoozes();
    const kept = snoozes.filter((s) => alarms.get(s.id)?.enabled === true);
    if (kept.length !== snoozes.length) this.#memory.setSnoozes(kept);
  }

  /** Stop one ringing item (PRD §9.2): the sound stops; the timer stays finished until dismissed. */
  stopRinging(key: string): void {
    this.#setRinging(this.ringing.peek().filter((r) => r.key !== key));
  }

  stopAll(): void {
    this.#setRinging([]);
  }

  /** Snooze one ringing alarm: it rings again after the file's snooze length, on this device (PRD §9.2). */
  snooze(key: string): void {
    const d = this.ringing.peek().find((r) => r.key === key);
    if (!d?.snooze) return;
    const at = this.now() + this.data.peek().settings.snoozeMinutes * 60_000;
    const snoozes = this.#memory.snoozes().filter((s) => s.id !== d.id);
    this.#memory.setSnoozes([...snoozes, { id: d.id, label: d.label, sound: d.sound, at }]);
    this.stopRinging(key);
    const name = d.label ? `“${d.label}”` : 'the alarm';
    this.say(`Snoozed ${name} until ${clockTime(at, this.settings.peek().timeFormat)}.`);
  }

  /** Snooze the newest ringing alarm that can be (S on the ringing sheet). */
  snoozeFirst(): void {
    const d = this.ringing.peek().find((r) => r.snooze);
    if (d) this.snooze(d.key);
  }

  /** The switch as it reads now: a passed one-off alarm reads off (PRD §7.3). */
  alarmOn(a: Alarm): boolean {
    return alarmIsOn(a, this.clock.value, this.zone);
  }

  /** A click or key on the page: from now on the browser lets the page play sound (PRD §9.4). */
  unlockSound(): void {
    if (!this.soundWaiting.peek()) {
      if (!this.#sound.allowed) this.#sound.unlock();
      return;
    }
    this.#sound.unlock();
    this.#sound.stop();
    this.#sound.ring(this.#ringSound ?? DEFAULT_SOUND, this.settings.peek().volume);
    this.soundWaiting.value = false;
  }

  /** Asks for permission to notify, from a click: adding an alarm or turning notifications on (PRD §9.2). */
  askToNotify(): void {
    if (this.settings.peek().notifications) this.#askToNotify();
  }

  /** Plays one cycle of a sound, at the set volume (PRD §10). */
  previewSound(id: string = DEFAULT_SOUND): void {
    this.#sound.unlock();
    this.#sound.preview(id, this.settings.peek().volume);
  }

  /** Timers that are Done: their time has run out and they haven't been dismissed. */
  done(now: number): Timer[] {
    return this.data.peek().timers.filter((t) => isDone(t, now));
  }
}
