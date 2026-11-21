import { describe, expect, it } from 'vitest';
import {
  ClockDoc,
  MAX_HISTORY,
  addPreset,
  addTimerTime,
  addTimer,
  classifyFile,
  currentLap,
  deletePreset,
  deleteTimer,
  dueNow,
  editTimer,
  emptyData,
  isDone,
  lapMarks,
  lapStopwatch,
  nextDueAt,
  pauseAllTimers,
  pauseTimer,
  rampVolume,
  renamePreset,
  resetStopwatch,
  resetTimer,
  restartTimer,
  serialize,
  setSnoozeMinutes,
  shouldRing,
  startTimer,
  stopwatchElapsed,
  timerKey,
  timerLeft,
  toggleStopwatch,
  toggleTimer,
  type ClockData,
  type Op,
} from '../src/index.ts';
import { checkInvariants } from './support/invariants.ts';
import { RANDOM_TIMEOUT, runRandomOps } from './support/randomOps.ts';

const T0 = Date.parse('2026-11-19T18:00:00.000Z');
const M = 60_000;

function withTimer(ms = 10 * M): ClockDoc {
  const doc = new ClockDoc(emptyData('UTC'));
  doc.apply(addTimer(doc.data, { id: 't_1', ms, label: 'Pasta' }, T0), 'Started timer');
  return doc;
}

describe('timers', () => {
  it('runs from now and counts down', () => {
    const doc = withTimer();
    const t = doc.data.timers[0]!;
    expect(t.state).toBe('running');
    expect(timerLeft(t, T0 + M)).toBe(9 * M);
    expect(isDone(t, T0 + 10 * M)).toBe(true);
    checkInvariants(doc.data);
  });

  it('pauses with the time left and resumes from it', () => {
    const doc = withTimer();
    doc.apply(pauseTimer(doc.data, 't_1', T0 + 4 * M), 'Paused');
    expect(doc.data.timers[0]).toMatchObject({ state: 'paused', leftMs: 6 * M, endsAt: null });
    doc.apply(startTimer(doc.data, 't_1', T0 + 20 * M), 'Resumed');
    expect(timerLeft(doc.data.timers[0]!, T0 + 20 * M)).toBe(6 * M);
    checkInvariants(doc.data);
  });

  it("won't pause a finished timer; toggling it restarts it", () => {
    const doc = withTimer();
    expect(pauseTimer(doc.data, 't_1', T0 + 11 * M)).toBeNull();
    doc.apply(toggleTimer(doc.data, 't_1', T0 + 11 * M), 'Restarted');
    expect(timerLeft(doc.data.timers[0]!, T0 + 11 * M)).toBe(10 * M);
  });

  it('cancels back to idle with its length kept, then deletes', () => {
    const doc = withTimer();
    doc.apply(resetTimer(doc.data, 't_1'), 'Cancelled');
    expect(doc.data.timers[0]).toMatchObject({ state: 'idle', ms: 10 * M, endsAt: null, leftMs: null });
    expect(resetTimer(doc.data, 't_1')).toBeNull();
    doc.apply(deleteTimer(doc.data, 't_1'), 'Deleted');
    expect(doc.data.timers).toEqual([]);
    doc.undo();
    expect(doc.data.timers[0]?.id).toBe('t_1');
  });

  it('adds a minute to a running, paused or done timer, and its length grows with it', () => {
    const doc = withTimer();
    doc.apply(addTimerTime(doc.data, 't_1', M, T0 + 3 * M), '+1 min');
    expect(doc.data.timers[0]).toMatchObject({ ms: 11 * M });
    expect(timerLeft(doc.data.timers[0]!, T0 + 3 * M)).toBe(8 * M);
    doc.apply(pauseTimer(doc.data, 't_1', T0 + 3 * M), 'Paused');
    doc.apply(addTimerTime(doc.data, 't_1', M, T0 + 3 * M), '+1 min');
    expect(doc.data.timers[0]).toMatchObject({ ms: 12 * M, leftMs: 9 * M });
    doc.apply(startTimer(doc.data, 't_1', T0 + 3 * M), 'Resumed');
    doc.apply(addTimerTime(doc.data, 't_1', M, T0 + 20 * M), '+1 min');
    expect(doc.data.timers[0]).toMatchObject({ ms: 12 * M, state: 'running' });
    expect(timerLeft(doc.data.timers[0]!, T0 + 20 * M)).toBe(M);
    doc.apply(resetTimer(doc.data, 't_1'), 'Cancelled');
    expect(addTimerTime(doc.data, 't_1', M, T0 + 20 * M)).toBeNull();
  });

  it('restarts from the full length', () => {
    const doc = withTimer();
    doc.apply(restartTimer(doc.data, 't_1', T0 + 3 * M), 'Restarted');
    expect(timerLeft(doc.data.timers[0]!, T0 + 3 * M)).toBe(10 * M);
  });

  it('edits the label without touching the time, and a new length starts over', () => {
    const doc = withTimer();
    doc.apply(editTimer(doc.data, 't_1', '  Rice  ', 10 * M, T0 + M), 'Edited');
    expect(doc.data.timers[0]).toMatchObject({ label: 'Rice', endsAt: new Date(T0 + 10 * M).toISOString() });
    doc.apply(editTimer(doc.data, 't_1', 'Rice', 5 * M, T0 + M), 'Edited');
    expect(timerLeft(doc.data.timers[0]!, T0 + M)).toBe(5 * M);
  });

  it('pauses all running timers that have not finished', () => {
    const doc = withTimer();
    doc.apply(addTimer(doc.data, { id: 't_2', ms: M, label: '' }, T0), 'Started');
    doc.apply(pauseAllTimers(doc.data, T0 + 2 * M), 'Paused all');
    expect(doc.data.timers.map((t) => t.state)).toEqual(['paused', 'running']);
  });
});

describe('presets', () => {
  it('adds, renames and deletes', () => {
    const doc = new ClockDoc(emptyData());
    doc.apply(addPreset(doc.data, { id: 'p_1', ms: 4 * M, label: 'Tea' }), 'Saved preset');
    doc.apply(renamePreset(doc.data, 'p_1', 'Green tea'), 'Renamed');
    expect(doc.data.presets[0]?.label).toBe('Green tea');
    doc.apply(deletePreset(doc.data, 'p_1'), 'Deleted');
    expect(doc.data.presets).toEqual([]);
  });
});

describe('stopwatch', () => {
  it('starts, laps, stops and resets', () => {
    const doc = new ClockDoc(emptyData());
    doc.apply(toggleStopwatch(doc.data, T0), 'Started');
    doc.apply(lapStopwatch(doc.data, T0 + 61_234), 'Lap');
    expect(currentLap(doc.data.stopwatch, T0 + 70_000)).toBe(70_000 - 61_234);
    doc.apply(toggleStopwatch(doc.data, T0 + 90_000), 'Stopped');
    expect(stopwatchElapsed(doc.data.stopwatch, T0 + 999_999)).toBe(90_000);
    expect(lapStopwatch(doc.data, T0 + 95_000)).toBeNull();
    checkInvariants(doc.data);
    doc.apply(resetStopwatch(doc.data), 'Reset');
    expect(doc.data.stopwatch).toMatchObject({ state: 'idle', elapsedMs: 0, laps: [] });
    expect(resetStopwatch(doc.data)).toBeNull();
    doc.undo();
    expect(doc.data.stopwatch.laps).toEqual([61_234]);
  });

  it('keeps counting from where it stopped', () => {
    const doc = new ClockDoc(emptyData());
    doc.apply(toggleStopwatch(doc.data, T0), 'Started');
    doc.apply(toggleStopwatch(doc.data, T0 + 1000), 'Stopped');
    doc.apply(toggleStopwatch(doc.data, T0 + 5000), 'Started');
    expect(stopwatchElapsed(doc.data.stopwatch, T0 + 6000)).toBe(2000);
  });

  it('marks fastest and slowest laps from three laps', () => {
    expect(lapMarks([5, 3])).toEqual({ fastest: -1, slowest: -1 });
    expect(lapMarks([5, 3, 9])).toEqual({ fastest: 1, slowest: 2 });
    expect(lapMarks([4, 4, 4])).toEqual({ fastest: -1, slowest: -1 });
  });
});

describe('ringing', () => {
  it('finds finished timers not yet rung, and the next due time', () => {
    const doc = withTimer();
    expect(dueNow(doc.data, T0 + 5 * M, new Set())).toEqual([]);
    expect(nextDueAt(doc.data, T0)).toBe(T0 + 10 * M);
    const due = dueNow(doc.data, T0 + 10 * M, new Set());
    expect(due.map((d) => d.label)).toEqual(['Pasta']);
    expect(dueNow(doc.data, T0 + 10 * M, new Set([due[0]!.key]))).toEqual([]);
    expect(nextDueAt(doc.data, T0 + 10 * M)).toBeNull();
  });

  it('rings again after a restart, because the key changes', () => {
    const doc = withTimer();
    const before = timerKey(doc.data.timers[0]!);
    doc.apply(restartTimer(doc.data, 't_1', T0 + 11 * M), 'Restarted');
    expect(timerKey(doc.data.timers[0]!)).not.toBe(before);
  });

  it('rings what is under 10 minutes late, and only notes older', () => {
    const due = {
      key: 'k',
      kind: 'timer' as const,
      id: 't',
      label: '',
      at: T0,
      sound: 'chimes',
      snooze: false,
    };
    expect(shouldRing(due, T0 + 10 * M)).toBe(true);
    expect(shouldRing(due, T0 + 10 * M + 1)).toBe(false);
  });

  it('ramps the volume from 20% over 30 s', () => {
    expect(rampVolume(0.8, 0)).toBeCloseTo(0.16);
    expect(rampVolume(0.8, 15_000)).toBeCloseTo(0.48);
    expect(rampVolume(0.8, 60_000)).toBeCloseTo(0.8);
  });
});

describe('ClockDoc', () => {
  it('records nothing for an edit that changes nothing', () => {
    const doc = withTimer();
    expect(doc.apply(editTimer(doc.data, 't_1', 'Pasta', 10 * M, T0), 'Edited')).toBe(false);
    const noChange = null;
    expect(doc.apply(noChange, 'Nothing')).toBe(false);
    expect(doc.undoLabel).toBe('Started timer');
  });

  it('keeps 100 undo steps', () => {
    const doc = new ClockDoc(emptyData());
    for (let i = 0; i < MAX_HISTORY + 5; i++) doc.apply(toggleStopwatch(doc.data, T0 + i), 'Toggled');
    let n = 0;
    while (doc.undo()) n++;
    expect(n).toBe(MAX_HISTORY);
  });

  it('saves settings in the file without an undo step', () => {
    const doc = new ClockDoc(emptyData());
    expect(doc.applySetting(setSnoozeMinutes(doc.data, 5), 'Snooze')).toBe(true);
    expect(doc.data.settings.snoozeMinutes).toBe(5);
    expect(doc.canUndo).toBe(false);
    expect(setSnoozeMinutes(doc.data, 0)).toBeNull();
  });

  it('tells listeners about every change', () => {
    const doc = withTimer();
    const kinds: string[] = [];
    doc.onChange((c) => kinds.push(c.kind));
    doc.undo();
    doc.redo();
    doc.replace(emptyData());
    expect(kinds).toEqual(['undo', 'redo', 'replace']);
    expect(doc.canUndo).toBe(false);
  });
});

type TimerEdit = (data: ClockData, id: string, now: number) => Op[] | null;

interface State {
  doc: ClockDoc;
  now: number;
  start: ClockData;
  next: number;
}

describe('random edits', () => {
  it(
    'random edits keep the invariants, round-trip through the file, and undo back to the start',
    async () => {
      await runRandomOps<State>({
        setup: () => {
          const start = emptyData('UTC');
          return { doc: new ClockDoc(start), now: T0, start, next: 1 };
        },
        ops: [
          {
            name: 'wait',
            weight: 3,
            run: (s, r) => {
              const ms = r.pick([10, 999, M, 7 * M, 2 * 3_600_000]);
              s.now += ms;
              return `${ms}`;
            },
          },
          {
            name: 'add timer',
            run: (s, r) => {
              const ms = r.pick([1000, M, 5 * M, 3_600_000]);
              s.doc.apply(
                addTimer(s.doc.data, { id: `t_${s.next++}`, ms, label: r.text(8) }, s.now),
                'Started',
              );
            },
          },
          ...(
            [
              ['start', (d, id, now) => startTimer(d, id, now)],
              ['pause', (d, id, now) => pauseTimer(d, id, now)],
              ['toggle', (d, id, now) => toggleTimer(d, id, now)],
              ['reset', (d, id) => resetTimer(d, id)],
              ['restart', (d, id, now) => restartTimer(d, id, now)],
              ['add a minute', (d, id, now) => addTimerTime(d, id, M, now)],
              ['delete', (d, id) => deleteTimer(d, id)],
              ['edit', (d, id, now) => editTimer(d, id, 'x'.repeat(120), M, now)],
            ] as const satisfies readonly (readonly [string, TimerEdit])[]
          ).map(([name, edit]) => ({
            name: `${name} timer`,
            when: (s: State) => s.doc.data.timers.length > 0,
            run: (s: State, r: { pick<T>(items: readonly T[]): T }) => {
              const id = r.pick(s.doc.data.timers).id;
              s.doc.apply(edit(s.doc.data, id, s.now), name);
              return id;
            },
          })),
          {
            name: 'pause all',
            run: (s) => void s.doc.apply(pauseAllTimers(s.doc.data, s.now), 'Paused all'),
          },
          {
            name: 'add preset',
            run: (s, r) =>
              void s.doc.apply(
                addPreset(s.doc.data, { id: `p_${s.next++}`, ms: M, label: r.text(6) }),
                'Saved',
              ),
          },
          {
            name: 'delete preset',
            when: (s) => s.doc.data.presets.length > 0,
            run: (s, r) =>
              void s.doc.apply(deletePreset(s.doc.data, r.pick(s.doc.data.presets).id), 'Deleted'),
          },
          {
            name: 'stopwatch',
            weight: 2,
            run: (s) => void s.doc.apply(toggleStopwatch(s.doc.data, s.now), 'Toggled'),
          },
          { name: 'lap', weight: 2, run: (s) => void s.doc.apply(lapStopwatch(s.doc.data, s.now), 'Lap') },
          { name: 'reset stopwatch', run: (s) => void s.doc.apply(resetStopwatch(s.doc.data), 'Reset') },
          { name: 'undo', weight: 2, run: (s) => void s.doc.undo() },
          { name: 'redo', run: (s) => void s.doc.redo() },
        ],
        check: (s) => {
          checkInvariants(s.doc.data);
          const back = classifyFile(serialize(s.doc.data));
          expect(back.kind === 'ok' && back.skipped).toBe(0);
          if (back.kind === 'ok') expect(back.data).toEqual(s.doc.data);
        },
        finish: (s) => {
          // A run is shorter than the 100-step history, so undoing everything gives back the start.
          while (s.doc.undo());
          expect(serialize(s.doc.data)).toBe(serialize(s.start));
        },
      });
    },
    RANDOM_TIMEOUT,
  );
});
