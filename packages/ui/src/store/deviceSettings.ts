/**
 * What each device keeps for itself, never in clock.json (PRD §9.3, §13): its settings, what it has rung, and
 * the crash snapshot. All of it lives in this page's own storage.
 */
import { RUNG_KEEP_MS } from '@alarmony/core';
import type { RecoveryStorage } from '../session/clockSession.ts';

export type Theme = 'system' | 'light' | 'dark';
export type TimeFormat = 'system' | '12' | '24';
export type Tab = 'world' | 'alarms' | 'stopwatch' | 'timers';

export interface DeviceSettings {
  readonly theme: Theme;
  readonly timeFormat: TimeFormat;
  readonly ring: boolean;
  readonly notifications: boolean;
  /** 0–1. */
  readonly volume: number;
  readonly tab: Tab;
}

export const DEFAULT_SETTINGS: DeviceSettings = {
  theme: 'system',
  timeFormat: 'system',
  ring: true,
  notifications: true,
  volume: 0.8,
  tab: 'timers',
};

const SETTINGS_KEY = 'alarmony.settings';
const RUNG_KEY = 'alarmony.rung';
const RECOVERY_KEY = 'alarmony.unsaved';

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
