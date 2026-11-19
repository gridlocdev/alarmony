/**
 * The app's state and actions: the open tab, dialogs, notices, the selected timer and what is ringing. Every edit
 * goes through `edit`, so it is one undo step (PRD §11). Time comes from the `now` passed in, so tests set it.
 */
import { batch, computed, signal, type Signal } from '@preact/signals';
import {
  DEFAULT_SOUND,
  MISSED_LOOKBACK_MS,
  RING_LIMIT_MS,
  dueNow,
  isFinished,
  newId,
  shouldRing,
  soonestTimer,
  timerKey,
  timerLeft,
  formatCountdown,
  type ClockData,
  type Due,
  type Op,
  type Timer,
} from '@alarmony/core';
import {
  saveSettings,
  type ClockSession,
  type DeviceSettings,
  type RungLog,
  type SaveStatus,
  type Tab,
} from '@alarmony/ui';

/** How long a notice stays (PRD §5.3). */
export const NOTICE_MS = 5000;
/** A hidden window looks for changes made elsewhere this often, so it rings what was added there (PRD §3.5). */
export const HIDDEN_REFRESH_MS = 60_000;

/** The tabs slice 1 has, in toolbar order (World Clock and Alarms come in later slices). */
export const TABS: readonly { readonly id: Tab; readonly title: string }[] = [
  { id: 'stopwatch', title: 'Stopwatch' },
  { id: 'timers', title: 'Timers' },
];

export type DialogState =
  | { readonly kind: 'menu'; readonly initial: string }
  | { readonly kind: 'shortcuts' }
  | { readonly kind: 'settings' }
  | { readonly kind: 'newTimer' }
  | { readonly kind: 'editTimer'; readonly id: string };

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

const shown = (tab: Tab): Tab => (TABS.some((t) => t.id === tab) ? tab : 'timers');
const quoted = (label: string) => (label ? `“${label}”` : 'timer');

export class AppController {
  readonly session: ClockSession;
  readonly version: string;
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

  readonly #rung: RungLog;
  readonly #after: (ms: number, run: () => void) => () => void;
  readonly #sound: SoundOut;
  readonly #saveSettings: (s: DeviceSettings) => void;
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
    this.now = deps.now;
    this.#rung = deps.rung;
    this.#after = deps.after ?? (() => () => undefined);
    this.#sound = deps.sound ?? SILENT;
    this.#saveSettings = deps.saveSettings ?? ((s) => void saveSettings(s));
    const now = deps.now();
    this.data = signal(session.doc.data);
    this.clock = signal(now);
    this.frame = signal(now);
    this.settings = signal(deps.settings);
    this.tab = signal(shown(deps.settings.tab));
    session.doc.onChange((change) => {
      batch(() => {
        this.data.value = session.doc.data;
        this.rev.value++;
        // An Undo button belongs to the edit before; another edit takes it away (PRD §5.3).
        const n = this.notice.peek();
        if (n?.action?.label === 'Undo' && change.kind !== 'setting')
          this.notice.value = n.sticky ? { ...n, action: undefined } : null;
        this.#forgetGoneRings();
        // An editor for a timer that went (undo, Use Theirs, a change made elsewhere) has nothing to show.
        const d = this.dialog.peek();
        if (d?.kind === 'editTimer' && !session.doc.data.timers.some((t) => t.id === d.id))
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
    const done = this.doc.apply(ops, label);
    if (done && said) this.sayUndoable(said);
    return done;
  }

  undo(): void {
    const step = this.doc.undo();
    if (step) this.say(`Undid ${step.label.toLowerCase()}.`);
  }

  redo(): void {
    const step = this.doc.redo();
    if (step) this.say(`Redid ${step.label.toLowerCase()}.`);
  }

  newId(prefix: string): string {
    const d = this.data.peek();
    return newId(prefix, new Set([...d.timers, ...d.presets].map((i) => i.id)));
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
    this.announcement.value = text;
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
   * hidden it reads at most once a minute. A failed save is tried again first. Returns how many items changed.
   */
  async refreshFromFile(hidden: boolean): Promise<number | null> {
    this.tick();
    if (this.session.status.peek() === 'failed') this.session.retry();
    const now = this.now();
    if (this.dialog.peek()) return null;
    if (hidden && now - this.#lastRefresh < HIDDEN_REFRESH_MS) return null;
    this.#lastRefresh = now;
    return this.session.refresh();
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

  #checkDue(now: number): void {
    const due = dueNow(this.data.peek(), now, this.#rung.keys());
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
    if (ring.length) this.announcement.value = `${ring.map((r) => r.label || 'Timer').join(', ')} done.`;
  }

  /** One sticky notice names everything missed since it was last dismissed (PRD §9.4). */
  #sayMissed(list: readonly Due[]): void {
    if (!list.length) return;
    const shown = this.notice.peek();
    const before = shown !== null && shown === this.#missedNotice ? this.#missed : [];
    this.#missed = [...before, ...list.map((d) => d.label || 'Timer')];
    const names =
      this.#missed.length === 1
        ? this.#missed[0]!
        : `${this.#missed.slice(0, -1).join(', ')} and ${this.#missed.at(-1)!}`;
    this.say(`Missed: ${names} finished.`, { sticky: true });
    this.#missedNotice = this.notice.peek();
  }

  #setRinging(list: readonly Due[]): void {
    this.ringing.value = list;
    if (!list.length) {
      this.#sound.stop();
      this.soundWaiting.value = false;
      return;
    }
    if (!this.#sound.ringing) this.#sound.ring(DEFAULT_SOUND, this.settings.peek().volume);
    this.soundWaiting.value = !this.#sound.allowed;
  }

  /** A ringing timer that was restarted, reset or deleted stops ringing. */
  #forgetGoneRings(): void {
    const timers = new Map(this.data.peek().timers.map((t) => [t.id, t]));
    const list = this.ringing.peek();
    const left = list.filter((r) => {
      const t = timers.get(r.id);
      return t !== undefined && timerKey(t) === r.key;
    });
    if (left.length !== list.length) this.#setRinging(left);
  }

  /** Stop one ringing item (PRD §9.2): the sound stops; the timer stays finished until dismissed. */
  stopRinging(key: string): void {
    this.#setRinging(this.ringing.peek().filter((r) => r.key !== key));
  }

  stopAll(): void {
    this.#setRinging([]);
  }

  /** A click or key on the page: from now on the browser lets the page play sound (PRD §9.4). */
  unlockSound(): void {
    if (!this.soundWaiting.peek()) {
      if (!this.#sound.allowed) this.#sound.unlock();
      return;
    }
    this.#sound.unlock();
    this.#sound.stop();
    this.#sound.ring(DEFAULT_SOUND, this.settings.peek().volume);
    this.soundWaiting.value = false;
  }

  previewSound(): void {
    this.#sound.unlock();
    this.#sound.preview(DEFAULT_SOUND, this.settings.peek().volume);
  }

  /** Timers that finished and still show Done. */
  finished(now: number): Timer[] {
    return this.data.peek().timers.filter((t) => isFinished(t, now));
  }
}
