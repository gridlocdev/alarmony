import type { Timer } from './format.ts';

/** What a timer has left at `now` (ms since the epoch). */
export function timerLeft(timer: Timer, now: number): number {
  switch (timer.state) {
    case 'running':
      return Math.max(0, Date.parse(timer.endsAt ?? '') - now);
    case 'paused':
      return timer.leftMs ?? timer.ms;
    case 'idle':
      return timer.ms;
  }
}

/** A running timer whose end has passed is finished (PRD §8.2); finishing writes nothing. */
export function isFinished(timer: Timer, now: number): boolean {
  return timer.state === 'running' && Date.parse(timer.endsAt ?? '') <= now;
}

/** How far through it is, 0 to 1, for the ring that empties. */
export function timerProgress(timer: Timer, now: number): number {
  return Math.min(1, Math.max(0, 1 - timerLeft(timer, now) / timer.ms));
}

/** The soonest-ending running timer that hasn't finished, for the window title and the menu bar. */
export function soonestTimer(timers: readonly Timer[], now: number): Timer | null {
  let best: Timer | null = null;
  for (const t of timers)
    if (t.state === 'running' && !isFinished(t, now) && (!best || timerLeft(t, now) < timerLeft(best, now)))
      best = t;
  return best;
}
