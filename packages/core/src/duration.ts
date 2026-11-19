import { MAX_DURATION_MS, MIN_DURATION_MS } from './format.ts';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const UNITS: Readonly<Record<string, number>> = {
  h: HOUR,
  hr: HOUR,
  hrs: HOUR,
  hour: HOUR,
  hours: HOUR,
  m: MINUTE,
  min: MINUTE,
  mins: MINUTE,
  minute: MINUTE,
  minutes: MINUTE,
  s: SECOND,
  sec: SECOND,
  secs: SECOND,
  second: SECOND,
  seconds: SECOND,
};

const inRange = (ms: number): number | null =>
  Number.isFinite(ms) && ms >= MIN_DURATION_MS && ms <= MAX_DURATION_MS
    ? Math.round(ms / SECOND) * SECOND
    : null;

/**
 * A typed duration (PRD §8.2): `5` (a bare number is minutes), `5m`, `1h30m`, `1h 30m`, `90s`, `1.5h`,
 * `1:30:00` (h:m:s), `25:00` (m:s). Null when it isn't one, or is outside 1 s to 99:59:59.
 */
export function parseDuration(text: string): number | null {
  const s = text.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return inRange(Number(s) * MINUTE);
  const clock = /^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/.exec(s);
  if (clock) {
    const [a, b, c] = [Number(clock[1]), Number(clock[2]), clock[3] === undefined ? null : Number(clock[3])];
    return inRange(c === null ? a * MINUTE + b * SECOND : a * HOUR + b * MINUTE + c * SECOND);
  }
  const part = /(\d+(?:\.\d+)?)\s*([a-z]+)\s*/y;
  let total = 0;
  let found = false;
  part.lastIndex = 0;
  while (part.lastIndex < s.length) {
    const m = part.exec(s);
    const unit = m ? UNITS[m[2] ?? ''] : undefined;
    if (!m || unit === undefined) return null;
    total += Number(m[1]) * unit;
    found = true;
  }
  return found ? inRange(total) : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A timer's time left: `H:MM:SS` from an hour up, else `M:SS` (PRD §8.2). Rounds up, so 0.2 s left shows 0:01. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / SECOND));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** The stopwatch: `MM:SS.cc`, then `H:MM:SS.cc` from an hour up (PRD §8.1). */
export function formatStopwatch(ms: number): string {
  const cs = Math.floor(Math.max(0, ms) / 10);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}.${pad(c)}` : `${pad(m)}:${pad(s)}.${pad(c)}`;
}

/** Words for a length, for labels and screen readers: "1 hour 30 minutes", "45 seconds". */
export function describeDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / SECOND));
  const parts: string[] = [];
  const add = (n: number, word: string) => {
    if (n > 0) parts.push(`${n} ${word}${n === 1 ? '' : 's'}`);
  };
  add(Math.floor(total / 3600), 'hour');
  add(Math.floor((total % 3600) / 60), 'minute');
  add(total % 60, 'second');
  return parts.length ? parts.join(' ') : '0 seconds';
}

/** A duration in the form `parseDuration` reads back: `5m`, `1h30m`, `1h0m5s`. */
export function durationInput(ms: number): string {
  const total = Math.max(0, Math.round(ms / SECOND));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (!h && !s) return `${m}m`;
  if (!h) return m ? `${m}m${s}s` : `${s}s`;
  return s ? `${h}h${m}m${s}s` : `${h}h${m}m`;
}
