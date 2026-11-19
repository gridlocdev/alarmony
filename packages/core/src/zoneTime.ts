/**
 * Wall-clock time in an IANA zone, both ways, by arithmetic on the zone's UTC offset (PRD §7.3). The zone's
 * rules come from the system through Intl; nothing steps minute by minute.
 */

/** A date and time on a wall clock. Months are 1–12. */
export interface Wall {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(zone, f);
  }
  return f;
}

/** True when the system knows the zone. */
export function knownZone(zone: string): boolean {
  try {
    formatter(zone);
    return true;
  } catch {
    return false;
  }
}

/** The wall clock in `zone` at the instant `ms`, to the second. */
function wallParts(ms: number, zone: string): Wall & { readonly second: number } {
  const parts: Record<string, number> = {};
  for (const p of formatter(zone).formatToParts(ms))
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour! % 24,
    minute: parts.minute!,
    second: parts.second!,
  };
}

export function wallAt(ms: number, zone: string): Wall {
  const { year, month, day, hour, minute } = wallParts(ms, zone);
  return { year, month, day, hour, minute };
}

/** The wall clock read as if it were UTC, in ms. */
function asUtc(w: Wall): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
}

/** The zone's offset from UTC at the instant `ms`, in ms (Tokyo: +9 h). */
export function offsetAt(ms: number, zone: string): number {
  const w = wallParts(ms, zone);
  const floored = Math.floor(ms / 1000) * 1000;
  return asUtc(w) + w.second * 1000 - floored;
}

/**
 * The instant the wall clock in `zone` reads `w`. A time that happens twice (clocks going back) gives the first;
 * a time that doesn't exist (clocks going forward) gives the first minute after the gap (PRD §7.3).
 */
export function instantOf(w: Wall, zone: string): number {
  const local = asUtc(w);
  // Any transition near this time sits between the offsets half a day either side.
  const before = offsetAt(local - 12 * HOUR, zone);
  const after = offsetAt(local + 12 * HOUR, zone);
  const fits = [local - before, local - after].filter((t) => asUtc(wallAt(t, zone)) === local);
  if (fits.length) return Math.min(...fits);
  // In the gap: the transition itself, found by halving the span between the two readings.
  let lo = local - after;
  let hi = local - before;
  if (lo > hi) [lo, hi] = [hi, lo];
  while (hi - lo > MINUTE) {
    const mid = lo + Math.floor((hi - lo) / 2 / MINUTE) * MINUTE;
    if (offsetAt(mid, zone) === offsetAt(hi, zone)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** The wall date `days` after `w`'s date (calendar arithmetic, no zone). */
export function addDays(w: Wall, days: number): Wall {
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day + days));
  return { ...w, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** 1–7, Monday = 1. */
export function weekday(w: Wall): number {
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
  return d === 0 ? 7 : d;
}
