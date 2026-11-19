/**
 * What each device keeps for itself, never in clock.json (PRD §9.3, §13): its settings, what it has rung, and
 * the crash snapshot. All of it lives in this page's own storage.
 */
import { MISSED_LOOKBACK_MS, RUNG_KEEP_MS, type Snooze } from '@alarmony/core';
import type { RecoveryStorage } from '../session/clockSession.ts';

export type Theme = 'system' | 'light' | 'dark';
export type TimeFormat = 'system' | '12' | '24';
export type Tab = 'world' | 'alarms' | 'stopwatch' | 'timers';
export type WorldView = 'cards' | 'list';

export interface DeviceSettings {
  readonly theme: Theme;
  readonly timeFormat: TimeFormat;
  readonly ring: boolean;
  readonly notifications: boolean;
  /** 0–1. */
  readonly volume: number;
  readonly tab: Tab;
  /** World clocks as cards with faces, or as a list (PRD §6.2). */
  readonly worldView: WorldView;
  /** World clocks show seconds in their digital time. */
  readonly showSeconds: boolean;
  /** Desktop: the menu bar icon shows the soonest timer's time left (PRD §15). */
  readonly menuBarCountdown: boolean;
  /** Desktop: open hidden in the menu bar when you log in (PRD §15). */
  readonly openAtLogin: boolean;
}

export const DEFAULT_SETTINGS: DeviceSettings = {
  theme: 'system',
  timeFormat: 'system',
  ring: true,
  notifications: true,
  volume: 0.8,
  tab: 'world',
  worldView: 'cards',
  showSeconds: false,
  menuBarCountdown: true,
  openAtLogin: false,
};

const SETTINGS_KEY = 'alarmony.settings';
const RUNG_KEY = 'alarmony.rung';
const RECOVERY_KEY = 'alarmony.unsaved';
const SNOOZE_KEY = 'alarmony.snoozes';
const SEEN_KEY = 'alarmony.seen';

/** Page storage, or null where it is turned off. */
function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readJson(key: string): unknown {
  try {
    const text = storage()?.getItem(key);
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    storage()?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;

export function loadSettings(): DeviceSettings {
  const raw = readJson(SETTINGS_KEY);
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  return {
    theme: oneOf(r.theme, ['system', 'light', 'dark'], d.theme),
    timeFormat: oneOf(r.timeFormat, ['system', '12', '24'], d.timeFormat),
    ring: typeof r.ring === 'boolean' ? r.ring : d.ring,
    notifications: typeof r.notifications === 'boolean' ? r.notifications : d.notifications,
    volume: typeof r.volume === 'number' && r.volume >= 0 && r.volume <= 1 ? r.volume : d.volume,
    tab: oneOf(r.tab, ['world', 'alarms', 'stopwatch', 'timers'], d.tab),
    worldView: oneOf(r.worldView, ['cards', 'list'], d.worldView),
    showSeconds: typeof r.showSeconds === 'boolean' ? r.showSeconds : d.showSeconds,
    menuBarCountdown: typeof r.menuBarCountdown === 'boolean' ? r.menuBarCountdown : d.menuBarCountdown,
    openAtLogin: typeof r.openAtLogin === 'boolean' ? r.openAtLogin : d.openAtLogin,
  };
}

export function saveSettings(settings: DeviceSettings): boolean {
  return writeJson(SETTINGS_KEY, settings);
}

/** What this device has rung: key → when (PRD §9.3). Entries older than 3 days are dropped on load. */
export interface RungLog {
  has(key: string): boolean;
  add(key: string, at: number): void;
  keys(): ReadonlySet<string>;
}

/** The stored log's entries younger than 3 days at `now`. */
function readRung(now: number): Map<string, number> {
  const raw = readJson(RUNG_KEY);
  const entries = new Map<string, number>();
  if (typeof raw === 'object' && raw !== null)
    for (const [k, v] of Object.entries(raw))
      if (typeof v === 'number' && now - v < RUNG_KEEP_MS) entries.set(k, v);
  return entries;
}

export function rungLog(now: number, persist = true): RungLog {
  const entries = persist ? readRung(now) : new Map<string, number>();
  let keys: ReadonlySet<string> = new Set(entries.keys());
  return {
    has: (key) => entries.has(key),
    add(key, at) {
      entries.set(key, at);
      if (persist) {
        // Other tabs share the stored log: merge what they rang in, so no tab writes over another.
        for (const [k, v] of readRung(at)) if (!entries.has(k)) entries.set(k, v);
        writeJson(RUNG_KEY, Object.fromEntries(entries));
      }
      keys = new Set(entries.keys());
    },
    keys: () => keys,
  };
}

/**
 * What this device remembers between runs for ringing (PRD §9.2, §9.4): the alarms it snoozed, and when it last
 * looked for due alarms, so on the next start it knows what it missed.
 */
export interface DeviceMemory {
  snoozes(): Snooze[];
  setSnoozes(list: readonly Snooze[]): void;
  /** When this device last looked for due alarms, or null the first time. */
  seen(): number | null;
  setSeen(at: number): void;
}

function readSnoozes(): Snooze[] {
  const raw = readJson(SNOOZE_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is Snooze =>
      typeof s === 'object' &&
      s !== null &&
      typeof (s as Snooze).id === 'string' &&
      typeof (s as Snooze).label === 'string' &&
      typeof (s as Snooze).sound === 'string' &&
      typeof (s as Snooze).at === 'number',
  );
}

/** The device's ringing memory: page storage, or memory only (`persist` false, for tests). */
export function deviceMemory(persist = true): DeviceMemory {
  let snoozes: Snooze[] = persist ? readSnoozes() : [];
  const seenRaw = persist ? readJson(SEEN_KEY) : null;
  let seen = typeof seenRaw === 'number' && Number.isFinite(seenRaw) ? seenRaw : null;
  return {
    snoozes: () => snoozes,
    setSnoozes(list) {
      snoozes = [...list];
      if (persist) writeJson(SNOOZE_KEY, snoozes);
    },
    seen: () => seen,
    setSeen(at) {
      seen = at;
      if (persist) writeJson(SEEN_KEY, at);
    },
  };
}

/** Since when to look for due alarms on start: the last run, at most a day back (PRD §9.4). */
export function lookSince(seen: number | null, now: number, fallback: number): number {
  return Math.max(now - MISSED_LOOKBACK_MS, Math.min(now, seen ?? fallback));
}

/** The crash snapshot in page storage (PRD §3.6). */
export function localRecovery(key = RECOVERY_KEY): RecoveryStorage {
  return {
    get: () => {
      try {
        return storage()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set: (text) => {
      try {
        const s = storage();
        if (!s) return false;
        s.setItem(key, text);
        return true;
      } catch {
        return false;
      }
    },
    clear: () => {
      try {
        storage()?.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
  };
}
