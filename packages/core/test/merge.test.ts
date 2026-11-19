import { describe, expect, it } from 'vitest';
import {
  LISTS,
  addAlarm,
  addClock,
  addTimer,
  applyOps,
  deleteAlarm,
  deleteClock,
  diffOps,
  editAlarm,
  emptyData,
  findClashes,
  moveClock,
  pauseTimer,
  renameClock,
  replay,
  setSnoozeMinutes,
  toggleAlarm,
  toggleStopwatch,
  type ClockData,
  type Op,
} from '../src/index.ts';
import { checkInvariants } from './support/invariants.ts';
import { RANDOM_TIMEOUT, runRandomOps, type Random } from './support/randomOps.ts';

const T0 = Date.parse('2026-11-19T18:00:00.000Z');
const Z = 'UTC';
const FIELDS = { days: [], label: 'Wake', sound: 'chime', snooze: true };

function base(): ClockData {
  let d = emptyData(Z);
  d = applyOps(d, addAlarm(d, 'a1', { ...FIELDS, time: '07:00' }, T0, Z));
  d = applyOps(d, addAlarm(d, 'a2', { ...FIELDS, time: '08:00', label: '' }, T0, Z));
  d = applyOps(d, addClock(d, 'c1', 'Europe/Paris') ?? []);
  d = applyOps(d, addClock(d, 'c2', 'Asia/Tokyo') ?? []);
  return d;
}

/** The parts of the file the app shows and edits. */
const shown = (d: ClockData) => ({
  ...Object.fromEntries(LISTS.map((l) => [l, d[l]])),
  stopwatch: d.stopwatch,
  settings: d.settings,
});

describe('changes made elsewhere', () => {
  it('keeps both sides when they changed different fields of one alarm', () => {
    const b = base();
    const theirs = applyOps(b, editAlarm(b, 'a1', { label: 'Gym' }, T0, Z) ?? []);
    const mine = editAlarm(b, 'a1', { time: '06:30' }, T0, Z) ?? [];
    expect(findClashes(b, theirs, mine)).toEqual([]);
    const a = replay(b, theirs, mine, 'mine').data.alarms.find((x) => x.id === 'a1');
    expect(a).toMatchObject({ label: 'Gym', time: '06:30' });
  });

  it('names what both sides changed, and Keep Mine and Use Theirs pick a side', () => {
    const b = base();
    let theirs = applyOps(b, editAlarm(b, 'a1', { time: '05:00' }, T0, Z) ?? []);
    theirs = applyOps(theirs, setSnoozeMinutes(theirs, 5) ?? []);
    const mine = [
      ...(editAlarm(b, 'a1', { time: '06:00' }, T0, Z) ?? []),
      ...(setSnoozeMinutes(b, 15) ?? []),
      ...(renameClock(b, 'c1', 'Office') ?? []),
    ];
    expect(findClashes(b, theirs, mine).map((c) => c.name)).toEqual(['Wake', 'Snooze length']);
    const kept = replay(b, theirs, mine, 'mine');
    expect(kept.dropped).toBe(false);
    expect(kept.data.alarms[0]?.time).toBe('06:00');
    expect(kept.data.settings.snoozeMinutes).toBe(15);
    const used = replay(b, theirs, mine, 'theirs');
    expect(used.dropped).toBe(true);
    expect(used.data.alarms[0]?.time).toBe('05:00');
    expect(used.data.settings.snoozeMinutes).toBe(5);
    expect(used.data.clocks.find((c) => c.id === 'c1')?.label).toBe('Office');
  });

  it('brings back an alarm deleted elsewhere only when Keep Mine is chosen', () => {
    const b = base();
    const theirs = applyOps(b, deleteAlarm(b, 'a2') ?? []);
    const mine = toggleAlarm(b, 'a2', T0, Z) ?? [];
    expect(findClashes(b, theirs, mine).map((c) => c.name)).toEqual(['08:00']);
    expect(replay(b, theirs, mine, 'mine').data.alarms.map((a) => [a.id, a.enabled])).toEqual([
      ['a1', true],
      ['a2', false],
    ]);
    expect(replay(b, theirs, mine, 'theirs').data.alarms.map((a) => a.id)).toEqual(['a1']);
  });

  it('a deletion here of an alarm edited elsewhere clashes; deleting on both sides does not', () => {
    const b = base();
    const theirs = applyOps(b, editAlarm(b, 'a1', { label: 'Gym' }, T0, Z) ?? []);
    expect(findClashes(b, theirs, deleteAlarm(b, 'a1') ?? []).map((c) => c.name)).toEqual(['Wake']);
    const gone = applyOps(b, deleteAlarm(b, 'a1') ?? []);
    expect(findClashes(b, gone, deleteAlarm(b, 'a1') ?? [])).toEqual([]);
  });

  it('an edit undone here takes nothing back from the other copy', () => {
    const b = base();
    const theirs = applyOps(b, toggleAlarm(b, 'a1', T0, Z) ?? []);
    const off = toggleAlarm(b, 'a1', T0, Z) ?? [];
    const mine = [...off, ...(toggleAlarm(applyOps(b, off), 'a1', T0, Z) ?? [])];
    expect(replay(b, theirs, mine, 'mine').data.alarms[0]?.enabled).toBe(false);
  });

  it('the same change on both sides is no clash', () => {
    const b = base();
    const mine = editAlarm(b, 'a1', { time: '06:00' }, T0, Z) ?? [];
    expect(findClashes(b, applyOps(b, mine), mine)).toEqual([]);
  });

  it('the stopwatch clashes when both sides changed it differently', () => {
    const b = base();
    const theirs = applyOps(b, toggleStopwatch(b, T0));
    expect(findClashes(b, theirs, toggleStopwatch(b, T0 + 5))).toEqual([
      { key: 'stopwatch', name: 'Stopwatch' },
    ]);
  });

  it('a running timer paused here keeps its paused fields together', () => {
    let b = emptyData(Z);
    b = applyOps(b, addTimer(b, { id: 't', ms: 60_000, label: '' }, T0) ?? []);
    const theirs = applyOps(b, pauseTimer(b, 't', T0 + 1000) ?? []);
    const mine = pauseTimer(b, 't', T0 + 2000) ?? [];
    expect(findClashes(b, theirs, mine).map((c) => c.name)).toEqual(['Timer']);
    expect(replay(b, theirs, mine, 'mine').data.timers[0]).toMatchObject({ state: 'paused', leftMs: 58_000 });
  });

  it('turns a picked-up change into operations', () => {
    const b = base();
    let to = applyOps(b, moveClock(b, 'c2', -1) ?? []);
    to = applyOps(to, deleteClock(to, 'c1') ?? []);
    to = applyOps(to, addClock(to, 'c3', 'America/Lima') ?? []);
    to = applyOps(to, editAlarm(to, 'a1', { label: 'Run' }, T0, Z) ?? []);
    to = applyOps(to, toggleStopwatch(to, T0));
    expect(shown(applyOps(b, diffOps(b, to)))).toEqual(shown(to));
    expect(diffOps(b, b)).toEqual([]);
  });
});

/** One random edit, or null when it changes nothing. */
function randomEdit(d: ClockData, r: Random, id: () => string): Op[] | null {
  const alarm = () => r.pick(d.alarms).id;
  const clock = () => r.pick(d.clocks).id;
  switch (r.int(9)) {
    case 0:
      return addAlarm(
        d,
        id(),
        { ...FIELDS, time: r.pick(['06:00', '07:15', '23:59']), label: r.text(4) },
        T0,
        Z,
      );
    case 1:
      return d.alarms.length ? editAlarm(d, alarm(), { label: r.text(4) }, T0, Z) : null;
    case 2:
      return d.alarms.length ? editAlarm(d, alarm(), { time: r.pick(['05:00', '09:30']) }, T0, Z) : null;
    case 3:
      return d.alarms.length ? toggleAlarm(d, alarm(), T0, Z) : null;
    case 4:
      return d.alarms.length ? deleteAlarm(d, alarm()) : null;
    case 5:
      return addClock(d, id(), r.pick(['Europe/Oslo', 'Asia/Dubai', 'America/Lima', 'Africa/Cairo']));
    case 6:
      return d.clocks.length ? renameClock(d, clock(), r.text(4)) : null;
    case 7:
      return d.clocks.length ? moveClock(d, clock(), r.pick([-1, 1] as const)) : null;
    default:
      return r.chance(0.5) ? toggleStopwatch(d, T0 + r.int(9)) : setSnoozeMinutes(d, r.pick([5, 10, 15]));
  }
}

interface Sides {
  base: ClockData;
  theirs: ClockData;
  mine: Op[];
  next: number;
}

describe('random merges', () => {
  it(
    'random edits on two sides replay with the invariants kept and every unclashing change on both sides',
    async () => {
      await runRandomOps<Sides>({
        steps: 30,
        setup: () => ({ base: base(), theirs: base(), mine: [], next: 1 }),
        ops: [
          {
            name: 'edit theirs',
            run: (s, r) => {
              s.theirs = applyOps(s.theirs, randomEdit(s.theirs, r, () => `t${s.next++}`) ?? []);
            },
          },
          {
            name: 'edit mine',
            run: (s, r) => {
              s.mine.push(...(randomEdit(applyOps(s.base, s.mine), r, () => `m${s.next++}`) ?? []));
            },
          },
        ],
        check: (s) => {
          const clashes = new Set(findClashes(s.base, s.theirs, s.mine).map((c) => c.key));
          const ours = applyOps(s.base, s.mine);
          for (const mode of ['mine', 'theirs'] as const) {
            const { data } = replay(s.base, s.theirs, s.mine, mode);
            checkInvariants(data);
            for (const list of LISTS)
              for (const item of data[list]) {
                if (clashes.has(`${list}:${item.id}`)) continue;
                const was = s.base[list].find((i) => i.id === item.id);
                const mineNow = ours[list].find((i) => i.id === item.id);
                const theirsNow = s.theirs[list].find((i) => i.id === item.id);
                // An unclashing item holds each side's changed fields.
                for (const side of [mineNow, theirsNow])
                  if (side && was)
                    for (const [k, v] of Object.entries(side))
                      if (
                        JSON.stringify(v) !== JSON.stringify((was as unknown as Record<string, unknown>)[k])
                      )
                        expect((item as unknown as Record<string, unknown>)[k]).toEqual(v);
              }
          }
          if (!clashes.size)
            expect(shown(replay(s.base, s.theirs, s.mine, 'mine').data)).toEqual(
              shown(replay(s.base, s.theirs, s.mine, 'theirs').data),
            );
          expect(shown(applyOps(s.theirs, diffOps(s.theirs, ours)))).toEqual(shown(ours));
        },
      });
    },
    RANDOM_TIMEOUT,
  );
});
