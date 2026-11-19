/**
 * What is due to ring, and when the next thing is (PRD §9). Ringing is remembered per device by key, never in
 * the file (PRD §9.3); the UI keeps the rung log and passes it in.
 */
import type { ClockData, Timer } from './format.ts';

/** Something due less than this long ago rings now; older is a missed notice (PRD §9.4). */
export const RING_LATE_MS = 10 * 60_000;
/** Ringing stops by itself after this (PRD §9.2). */
export const RING_LIMIT_MS = 15 * 60_000;
/** The rung log keeps keys this long (PRD §9.3). */
export const RUNG_KEEP_MS = 3 * 24 * 3_600_000;
/** How far back missed things are looked for (PRD §9.4). */
export const MISSED_LOOKBACK_MS = 24 * 3_600_000;
/** The sound rises from this share of the set volume (PRD §9.2)… */
export const RAMP_FROM = 0.2;
/** …to all of it over this long. */
export const RAMP_MS = 30_000;

export interface Due {
  /** `timer:<id>:<endsAt>`: changes when the timer is restarted, so it rings again (PRD §9.3). */
  readonly key: string;
  readonly kind: 'timer';
  readonly id: string;
  readonly label: string;
  /** When it came due (ms since the epoch). */
  readonly at: number;
}

export function timerKey(timer: Timer): string {
  return `timer:${timer.id}:${timer.endsAt ?? ''}`;
}

/** Everything that came due by `now` and hasn't rung on this device, oldest first. */
export function dueNow(data: ClockData, now: number, rung: ReadonlySet<string>): Due[] {
  const out: Due[] = [];
  for (const t of data.timers) {
    if (t.state !== 'running' || t.endsAt === null) continue;
    const at = Date.parse(t.endsAt);
    const key = timerKey(t);
    if (at <= now && !rung.has(key)) out.push({ key, kind: 'timer', id: t.id, label: t.label, at });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Rings now, or only a "Missed" notice: due within the last 10 minutes rings (PRD §9.4). */
export function shouldRing(due: Due, now: number): boolean {
  return now - due.at <= RING_LATE_MS;
}

/** The next moment anything comes due after `now`, or null; the scheduler sets one timer for it (PRD §9.5). */
export function nextDueAt(data: ClockData, now: number): number | null {
  let next: number | null = null;
  for (const t of data.timers) {
    if (t.state !== 'running' || t.endsAt === null) continue;
    const at = Date.parse(t.endsAt);
    if (at > now && (next === null || at < next)) next = at;
  }
  return next;
}

/** The ringing volume after `elapsed` ms, rising from 20% to `volume` over 30 s (PRD §9.2). */
export function rampVolume(volume: number, elapsed: number): number {
  const share = RAMP_FROM + (1 - RAMP_FROM) * Math.min(1, Math.max(0, elapsed / RAMP_MS));
  return volume * share;
}
