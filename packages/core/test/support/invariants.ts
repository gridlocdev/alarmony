import { expect } from 'vitest';
import { LISTS, MAX_LABEL, MAX_LAPS, type ClockData } from '../../src/index.ts';

/** The rules every file this engine writes keeps (PRD §4.2). */
export function checkInvariants(data: ClockData): void {
  for (const list of LISTS) {
    const ids = data[list].map((i) => i.id);
    expect(new Set(ids).size, `ids are unique in ${list}`).toBe(ids.length);
  }
  for (const item of [...data.clocks, ...data.alarms, ...data.presets, ...data.timers])
    expect(item.label.length, `${item.id}'s label fits`).toBeLessThanOrEqual(MAX_LABEL);
  for (const a of data.alarms) {
    expect(a.days, `${a.id}'s days are sorted 1–7 without repeats`).toEqual(
      [...new Set(a.days)].filter((d) => d >= 1 && d <= 7).sort((x, y) => x - y),
    );
    const oneOffOn = a.enabled && a.days.length === 0;
    expect(a.once !== null, `${a.id} has once only while it is an enabled one-off`).toBe(oneOffOn);
  }
  for (const t of data.timers) {
    expect(t.endsAt !== null, `${t.id} has endsAt only while running`).toBe(t.state === 'running');
    expect(t.leftMs !== null, `${t.id} has leftMs only while paused`).toBe(t.state === 'paused');
    if (t.leftMs !== null) {
      expect(t.leftMs, `${t.id}'s leftMs is above 0`).toBeGreaterThan(0);
      expect(t.leftMs, `${t.id}'s leftMs is at most its length`).toBeLessThanOrEqual(t.ms);
    }
  }
  const sw = data.stopwatch;
  expect(sw.startedAt !== null, 'the stopwatch has startedAt only while running').toBe(
    sw.state === 'running',
  );
  expect(sw.laps.length, 'laps fit').toBeLessThanOrEqual(MAX_LAPS);
  if (sw.state === 'idle') {
    expect(sw.elapsedMs, 'an idle stopwatch is at zero').toBe(0);
    expect(sw.laps, 'an idle stopwatch has no laps').toEqual([]);
  }
}
