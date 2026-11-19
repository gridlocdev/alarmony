/**
 * What is due to ring, and when the next thing is (PRD §9). Ringing is remembered per device by key, never in
 * the file (PRD §9.3); the UI keeps the rung log and passes it in.
 */
import { dueBetween, nextDue } from './alarms.ts';
import type { Alarm, ClockData, Timer } from './format.ts';
import { DEFAULT_SOUND } from './sounds.ts';

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
  /**
   * `timer:<id>:<endsAt>`, `alarm:<id>:<due ISO>` or `snooze:<id>:<due ISO>`: changes when a timer is restarted
   * or an alarm moved, so it rings again (PRD §9.3).
   */
  readonly key: string;
  readonly kind: 'timer' | 'alarm';
  readonly id: string;
  readonly label: string;
  /** When it came due (ms since the epoch). */
  readonly at: number;
  /** The sound it rings with. */
  readonly sound: string;
  /** It offers Snooze (alarms with snooze on). */
  readonly snooze: boolean;
}

/** An alarm snoozed on this device: it rings again at `at` (PRD §9.2). Kept per device, never in the file. */
export interface Snooze {
  readonly id: string;
  readonly label: string;
  readonly sound: string;
  readonly at: number;
}

/** Where to look for due alarms: this device's zone, and since when each alarm counts (PRD §9.4). */
export interface AlarmWindow {
  readonly zone: string;
  /** Due moments after this ring or count as missed; set later for an alarm just added or moved. */
  readonly since: (alarm: Alarm) => number;
  readonly snoozes: readonly Snooze[];
}

export function timerKey(timer: Timer): string {
  return `timer:${timer.id}:${timer.endsAt ?? ''}`;
}

export function alarmKey(id: string, at: number): string {
  return `alarm:${id}:${new Date(at).toISOString()}`;
}

export function snoozeKey(id: string, at: number): string {
  return `snooze:${id}:${new Date(at).toISOString()}`;
}

/** Everything that came due by `now` and hasn't rung on this device, oldest first. */
export function dueNow(
  data: ClockData,
  now: number,
  rung: ReadonlySet<string>,
  alarms: AlarmWindow | null = null,
): Due[] {
  const out: Due[] = [];
  for (const t of data.timers) {
    if (t.state !== 'running' || t.endsAt === null) continue;
    const at = Date.parse(t.endsAt);
    const key = timerKey(t);
    if (at <= now && !rung.has(key))
      out.push({ key, kind: 'timer', id: t.id, label: t.label, at, sound: DEFAULT_SOUND, snooze: false });
  }
  if (alarms) {
    for (const a of data.alarms)
      for (const at of dueBetween(a, alarms.since(a), now, alarms.zone)) {
        const key = alarmKey(a.id, at);
        if (!rung.has(key))
          out.push({ key, kind: 'alarm', id: a.id, label: a.label, at, sound: a.sound, snooze: a.snooze });
      }
    for (const s of alarms.snoozes) {
      const key = snoozeKey(s.id, s.at);
      if (s.at <= now && !rung.has(key))
        out.push({ key, kind: 'alarm', id: s.id, label: s.label, at: s.at, sound: s.sound, snooze: true });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Rings now, or only a "Missed" notice: due within the last 10 minutes rings (PRD §9.4). */
export function shouldRing(due: Due, now: number): boolean {
  return now - due.at <= RING_LATE_MS;
}

/** The next moment anything comes due after `now`, or null; the scheduler sets one timer for it (PRD §9.5). */
export function nextDueAt(data: ClockData, now: number, alarms: AlarmWindow | null = null): number | null {
  const times: number[] = [];
  for (const t of data.timers)
    if (t.state === 'running' && t.endsAt !== null) times.push(Date.parse(t.endsAt));
  if (alarms) {
    for (const a of data.alarms) times.push(nextDue(a, now, alarms.zone) ?? Infinity);
    for (const s of alarms.snoozes) times.push(s.at);
  }
  const after = times.filter((t) => t > now);
  return after.length ? Math.min(...after) : null;
}

/** The ringing volume after `elapsed` ms, rising from 20% to `volume` over 30 s (PRD §9.2). */
export function rampVolume(volume: number, elapsed: number): number {
  const share = RAMP_FROM + (1 - RAMP_FROM) * Math.min(1, Math.max(0, elapsed / RAMP_MS));
  return volume * share;
}
