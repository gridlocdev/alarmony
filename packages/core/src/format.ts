/**
 * clock.json: the one data file (PRD §3.2), and the only way to read it (`classifyFile`, PRD §3.3).
 * Every item keeps the keys Alarmony doesn't know in `extra`, and items it can't read stay in `unread`; both
 * are written back unchanged.
 */

/** The format this version reads and writes. A higher number is a file from a newer Alarmony. */
export const FORMAT = 1;
export const DATA_FILE = 'clock.json';
export const MAX_LABEL = 100;
export const MAX_LAPS = 999;
/** Durations: 1 s to 99:59:59 (PRD §3.2). */
export const MIN_DURATION_MS = 1000;
export const MAX_DURATION_MS = (99 * 3600 + 59 * 60 + 59) * 1000;
export const DEFAULT_SNOOZE_MINUTES = 9;

export const NEWER_FILE_MESSAGE = 'This file was made by a newer Alarmony. Update to change it.';

export type RunState = 'idle' | 'running' | 'paused';

/** Keys this version doesn't know, kept as they were. */
export type Extra = Readonly<Record<string, unknown>>;

export interface WorldClock {
  readonly id: string;
  readonly zone: string;
  readonly label: string;
  readonly extra: Extra;
}

export interface Alarm {
  readonly id: string;
  /** `HH:MM`, 24-hour, on the ringing device's clock. */
  readonly time: string;
  /** 1–7, Monday = 1, sorted; empty means once. */
  readonly days: readonly number[];
  readonly label: string;
  readonly sound: string;
  readonly snooze: boolean;
  readonly enabled: boolean;
  /** A one-off alarm's ring time, `YYYY-MM-DDTHH:MM` local; null otherwise. */
  readonly once: string | null;
  readonly extra: Extra;
}

export interface Preset {
  readonly id: string;
  readonly label: string;
  readonly ms: number;
  readonly extra: Extra;
}

export interface Timer {
  readonly id: string;
  readonly label: string;
  /** The length it was set to. */
  readonly ms: number;
  readonly state: RunState;
  /** When a running timer ends (ISO, UTC). */
  readonly endsAt: string | null;
  /** What a paused timer has left. */
  readonly leftMs: number | null;
  readonly extra: Extra;
}

export interface Stopwatch {
  readonly state: RunState;
  /** When it last started running (ISO, UTC). */
  readonly startedAt: string | null;
  /** Time counted before `startedAt`. */
  readonly elapsedMs: number;
  /** Each lap's own length, oldest first. */
  readonly laps: readonly number[];
  readonly extra: Extra;
}

export interface FileSettings {
  readonly snoozeMinutes: number;
  readonly extra: Extra;
}

export const LISTS = ['clocks', 'alarms', 'presets', 'timers'] as const;
export type ListName = (typeof LISTS)[number];

export interface ListItems {
  readonly clocks: WorldClock;
  readonly alarms: Alarm;
  readonly presets: Preset;
  readonly timers: Timer;
}
export type Item = ListItems[ListName];

export interface ClockData {
  readonly format: number;
  readonly settings: FileSettings;
  readonly clocks: readonly WorldClock[];
  readonly alarms: readonly Alarm[];
  readonly presets: readonly Preset[];
  readonly timers: readonly Timer[];
  readonly stopwatch: Stopwatch;
  /** Items Alarmony couldn't read, written back as they were. */
  readonly unread: Readonly<Record<ListName, readonly unknown[]>>;
  readonly extra: Extra;
}

const NO_EXTRA: Extra = Object.freeze({});

export const IDLE_STOPWATCH: Stopwatch = {
  state: 'idle',
  startedAt: null,
  elapsedMs: 0,
  laps: [],
  extra: NO_EXTRA,
};

/** A new file: one clock for this device's zone and nothing else (PRD §3.1). */
export function emptyData(zone: string | null = null, id = 'c_local'): ClockData {
  return {
    format: FORMAT,
    settings: { snoozeMinutes: DEFAULT_SNOOZE_MINUTES, extra: NO_EXTRA },
    clocks: zone ? [{ id, zone, label: '', extra: NO_EXTRA }] : [],
    alarms: [],
    presets: [],
    timers: [],
    stopwatch: IDLE_STOPWATCH,
    unread: { clocks: [], alarms: [], presets: [], timers: [] },
    extra: NO_EXTRA,
  };
}

// ── Reading ────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown, max = MAX_LABEL): v is string => typeof v === 'string' && v.length <= max;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v);
const isWhole = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isInstant = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isDuration = (v: unknown): v is number =>
  isWhole(v, MIN_DURATION_MS, MAX_DURATION_MS) && (v as number) % 1000 === 0;

function extraOf(raw: Raw, known: readonly string[]): Extra {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) if (!known.includes(k)) out[k] = v;
  return Object.keys(out).length ? out : NO_EXTRA;
}

const CLOCK_KEYS = ['id', 'zone', 'label'] as const;
const ALARM_KEYS = ['id', 'time', 'days', 'label', 'sound', 'snooze', 'enabled', 'once'] as const;
const PRESET_KEYS = ['id', 'label', 'ms'] as const;
const TIMER_KEYS = ['id', 'label', 'ms', 'state', 'endsAt', 'leftMs'] as const;
const STOPWATCH_KEYS = ['state', 'startedAt', 'elapsedMs', 'laps'] as const;
const SETTINGS_KEYS = ['snoozeMinutes'] as const;
const TOP_KEYS = ['format', 'settings', ...LISTS, 'stopwatch'] as const;

function readClock(r: Raw): WorldClock | null {
  if (!isId(r.id) || typeof r.zone !== 'string' || !r.zone || !isText(r.label ?? '')) return null;
  return {
    id: r.id,
    zone: r.zone,
    label: (r.label as string | undefined) ?? '',
    extra: extraOf(r, CLOCK_KEYS),
  };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOCAL_MINUTE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

function readAlarm(r: Raw): Alarm | null {
  if (!isId(r.id) || typeof r.time !== 'string' || !TIME.test(r.time)) return null;
  const days = r.days ?? [];
  if (!Array.isArray(days) || !days.every((d) => isWhole(d, 1, 7))) return null;
  const sorted = [...new Set(days as number[])].sort((a, b) => a - b);
  const once = r.once ?? null;
  if (once !== null && (typeof once !== 'string' || !LOCAL_MINUTE.test(once))) return null;
  if (!isText(r.label ?? '') || !isText(r.sound ?? 'chimes', 40)) return null;
  return {
    id: r.id,
    time: r.time,
    days: sorted,
    label: (r.label as string | undefined) ?? '',
    sound: (r.sound as string | undefined) ?? 'chimes',
    snooze: r.snooze !== false,
    enabled: r.enabled === true,
    once: once as string | null,
    extra: extraOf(r, ALARM_KEYS),
  };
}

function readPreset(r: Raw): Preset | null {
  if (!isId(r.id) || !isText(r.label ?? '') || !isDuration(r.ms)) return null;
  return { id: r.id, label: (r.label as string | undefined) ?? '', ms: r.ms, extra: extraOf(r, PRESET_KEYS) };
}

function readTimer(r: Raw): Timer | null {
  if (!isId(r.id) || !isText(r.label ?? '') || !isDuration(r.ms)) return null;
  const base = {
    id: r.id,
    label: (r.label as string | undefined) ?? '',
    ms: r.ms,
    extra: extraOf(r, TIMER_KEYS),
  };
  switch (r.state) {
    case 'idle':
      return { ...base, state: 'idle', endsAt: null, leftMs: null };
    case 'running':
      return isInstant(r.endsAt) ? { ...base, state: 'running', endsAt: r.endsAt, leftMs: null } : null;
    case 'paused':
      return isWhole(r.leftMs, 1, r.ms) ? { ...base, state: 'paused', endsAt: null, leftMs: r.leftMs } : null;
    default:
      return null;
  }
}

function readStopwatch(v: unknown): Stopwatch {
  if (!isObject(v)) return IDLE_STOPWATCH;
  const laps =
    Array.isArray(v.laps) && v.laps.every((l) => isWhole(l, 0, Number.MAX_SAFE_INTEGER)) ? v.laps : [];
  const elapsedMs = isWhole(v.elapsedMs, 0, Number.MAX_SAFE_INTEGER) ? v.elapsedMs : 0;
  const extra = extraOf(v, STOPWATCH_KEYS);
  const base = { elapsedMs, laps: (laps as number[]).slice(0, MAX_LAPS), extra };
  if (v.state === 'running' && isInstant(v.startedAt))
    return { ...base, state: 'running', startedAt: v.startedAt };
  if (v.state === 'paused') return { ...base, state: 'paused', startedAt: null };
  return { ...IDLE_STOPWATCH, extra };
}

function readSettings(v: unknown): FileSettings {
  if (!isObject(v)) return { snoozeMinutes: DEFAULT_SNOOZE_MINUTES, extra: NO_EXTRA };
  return {
    snoozeMinutes: isWhole(v.snoozeMinutes, 1, 60) ? v.snoozeMinutes : DEFAULT_SNOOZE_MINUTES,
    extra: extraOf(v, SETTINGS_KEYS),
  };
}

const READERS: { readonly [L in ListName]: (r: Raw) => ListItems[L] | null } = {
  clocks: readClock,
  alarms: readAlarm,
  presets: readPreset,
  timers: readTimer,
};

function readList<L extends ListName>(list: L, v: unknown): { items: ListItems[L][]; unread: unknown[] } {
  const items: ListItems[L][] = [];
  const unread: unknown[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(v) ? v : []) {
    const item = isObject(raw) ? READERS[list](raw) : null;
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    } else unread.push(raw);
  }
  return { items, unread };
}

export type FileRead =
  | { readonly kind: 'ok'; readonly data: ClockData; readonly skipped: number }
  | { readonly kind: 'newer'; readonly format: number }
  | { readonly kind: 'corrupt'; readonly reason: string };

/** The only way any code reads clock.json (PRD §3.3). */
export function classifyFile(text: string): FileRead {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (e) {
    return { kind: 'corrupt', reason: e instanceof Error ? e.message : 'not JSON' };
  }
  if (!isObject(json)) return { kind: 'corrupt', reason: 'not a clock file' };
  if (!isWhole(json.format, 1, Number.MAX_SAFE_INTEGER))
    return { kind: 'corrupt', reason: 'no format number' };
  if (json.format > FORMAT) return { kind: 'newer', format: json.format };
  for (const list of LISTS)
    if (json[list] !== undefined && !Array.isArray(json[list]))
      return { kind: 'corrupt', reason: `${list} is not a list` };
  const clocks = readList('clocks', json.clocks);
  const alarms = readList('alarms', json.alarms);
  const presets = readList('presets', json.presets);
  const timers = readList('timers', json.timers);
  const data: ClockData = {
    format: FORMAT,
    settings: readSettings(json.settings),
    clocks: clocks.items,
    alarms: alarms.items,
    presets: presets.items,
    timers: timers.items,
    stopwatch: readStopwatch(json.stopwatch),
    unread: { clocks: clocks.unread, alarms: alarms.unread, presets: presets.unread, timers: timers.unread },
    extra: extraOf(json, TOP_KEYS),
  };
  const skipped = LISTS.reduce((n, l) => n + data.unread[l].length, 0);
  return { kind: 'ok', data, skipped };
}

// ── Writing ────────────────────────────────────────────────────────────────

function withExtra<T extends object>(known: T, extra: Extra): T & Extra {
  return { ...known, ...extra };
}

/** The file text: two-space JSON, keys in a fixed order, a trailing newline (PRD §3.1). */
export function serialize(data: ClockData): string {
  const s = data.stopwatch;
  const out = withExtra(
    {
      format: data.format,
      settings: withExtra({ snoozeMinutes: data.settings.snoozeMinutes }, data.settings.extra),
      clocks: [
        ...data.clocks.map((c) => withExtra({ id: c.id, zone: c.zone, label: c.label }, c.extra)),
        ...data.unread.clocks,
      ],
      alarms: [
        ...data.alarms.map((a) =>
          withExtra(
            {
              id: a.id,
              time: a.time,
              days: a.days,
              label: a.label,
              sound: a.sound,
              snooze: a.snooze,
              enabled: a.enabled,
              once: a.once,
            },
            a.extra,
          ),
        ),
        ...data.unread.alarms,
      ],
      presets: [
        ...data.presets.map((p) => withExtra({ id: p.id, label: p.label, ms: p.ms }, p.extra)),
        ...data.unread.presets,
      ],
      timers: [
        ...data.timers.map((t) =>
          withExtra(
            { id: t.id, label: t.label, ms: t.ms, state: t.state, endsAt: t.endsAt, leftMs: t.leftMs },
            t.extra,
          ),
        ),
        ...data.unread.timers,
      ],
      stopwatch: withExtra(
        { state: s.state, startedAt: s.startedAt, elapsedMs: s.elapsedMs, laps: s.laps },
        s.extra,
      ),
    },
    data.extra,
  );
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** The name an unreadable file is kept under: `clock unreadable 2026-11-19-090507.json` (PRD §3.3). */
export function unreadableName(now: Date, n = 1): string {
  const p = (x: number) => String(x).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `clock unreadable ${stamp}${n > 1 ? ` ${n}` : ''}.json`;
}
