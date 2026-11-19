import type { Stopwatch } from './format.ts';

/** Total elapsed time at `now` (PRD §3.2): `elapsedMs` plus, while running, now minus `startedAt`. */
export function stopwatchElapsed(sw: Stopwatch, now: number): number {
  if (sw.state !== 'running' || sw.startedAt === null) return sw.elapsedMs;
  return sw.elapsedMs + Math.max(0, now - Date.parse(sw.startedAt));
}

/** The lap in progress: elapsed time minus every finished lap. */
export function currentLap(sw: Stopwatch, now: number): number {
  return Math.max(0, stopwatchElapsed(sw, now) - sw.laps.reduce((a, b) => a + b, 0));
}

export interface LapMarks {
  /** Index into `laps` of the fastest and slowest, or -1 below three laps (PRD §8.1). */
  readonly fastest: number;
  readonly slowest: number;
}

export const MIN_LAPS_TO_MARK = 3;

export function lapMarks(laps: readonly number[]): LapMarks {
  if (laps.length < MIN_LAPS_TO_MARK) return { fastest: -1, slowest: -1 };
  let fastest = 0;
  let slowest = 0;
  laps.forEach((lap, i) => {
    if (lap < (laps[fastest] ?? Infinity)) fastest = i;
    if (lap > (laps[slowest] ?? -Infinity)) slowest = i;
  });
  return fastest === slowest ? { fastest: -1, slowest: -1 } : { fastest, slowest };
}
