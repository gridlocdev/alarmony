// Alarm times, next due moments across daylight-saving changes, and the alarm edits (PRD §7).
import { describe, expect, it } from 'vitest';
import {
  stepAlarmTime,
  ClockDoc,
  SOUNDS,
  addAlarm,
  alarmIsOn,
  describeIn,
  describeRepeat,
  dueBetween,
  dueNow,
  editAlarm,
  emptyData,
  instantOf,
  nextAlarm,
  nextDue,
  nextDueAt,
  parseAlarmTime,
  toggleAlarm,
  type Alarm,
  type AlarmFields,
} from '../src/index.ts';
import { checkInvariants } from './support/invariants.ts';

const NY = 'America/New_York';
const M = 60_000;
const H = 60 * M;

const alarm = (over: Partial<Alarm> = {}): Alarm => ({
  id: 'a_1',
  time: '07:00',
  days: [],
  label: '',
  sound: 'chimes',
  snooze: true,
  enabled: true,
  once: null,
  extra: {},
  ...over,
});

const fields = (over: Partial<AlarmFields> = {}): AlarmFields => ({
  time: '07:00',
  days: [],
  label: 'Wake up',
  sound: 'chimes',
  snooze: true,
  ...over,
});

describe('stepAlarmTime', () => {
  it('moves hours and minutes round the clock', () => {
    expect(stepAlarmTime('07:30', 'hour', 1)).toBe('08:30');
    expect(stepAlarmTime('23:30', 'hour', 1)).toBe('00:30');
    expect(stepAlarmTime('00:00', 'minute', -1)).toBe('23:59');
    expect(stepAlarmTime('07:59', 'minute', 1)).toBe('08:00');
  });
});

describe('typed alarm times', () => {
  it.each([
    ['7', '07:00'],
    ['7:30', '07:30'],
    ['730', '07:30'],
    ['0730', '07:30'],
    ['7:30 pm', '19:30'],
    ['7pm', '19:00'],
    ['12 am', '00:00'],
    ['12:15pm', '12:15'],
    ['19:30', '19:30'],
    ['23:59', '23:59'],
  ])('reads %s as %s', (text, time) => {
    expect(parseAlarmTime(text)).toBe(time);
  });

  it.each(['', '24:00', '7:60', '13pm', 'seven', '7:3'])('refuses %j', (text) => {
    expect(parseAlarmTime(text)).toBeNull();
  });
});

describe('when an alarm is next due', () => {
  // Monday 2026-11-16, 12:00 in New York (UTC−5).
  const MON_NOON = Date.parse('2026-11-16T17:00:00Z');

  it('rings a weekday alarm on the next weekday at its time', () => {
    const a = alarm({ days: [1, 2, 3, 4, 5] });
    expect(new Date(nextDue(a, MON_NOON, NY)!).toISOString()).toBe('2026-11-17T12:00:00.000Z');
  });

  it('skips to Monday from Friday evening for a weekday alarm', () => {
    const friEvening = Date.parse('2026-11-20T23:00:00Z');
    expect(new Date(nextDue(alarm({ days: [1, 2, 3, 4, 5] }), friEvening, NY)!).toISOString()).toBe(
      '2026-11-23T12:00:00.000Z',
    );
  });

  it('rings once at the first minute after a spring-forward gap', () => {
    // 2027-03-14: New York's clocks go from 02:00 straight to 03:00.
    const a = alarm({ time: '02:30', days: [7] });
    const sat = Date.parse('2027-03-13T12:00:00Z');
    expect(new Date(nextDue(a, sat, NY)!).toISOString()).toBe('2027-03-14T07:00:00.000Z');
  });

  it('rings once, the first time, when clocks go back', () => {
    // 2026-11-01: 01:30 happens twice in New York; the first is 05:30 UTC.
    const a = alarm({ time: '01:30', days: [7] });
    const sat = Date.parse('2026-10-31T12:00:00Z');
    const first = nextDue(a, sat, NY)!;
    expect(new Date(first).toISOString()).toBe('2026-11-01T05:30:00.000Z');
    expect(new Date(nextDue(a, first, NY)!).toISOString()).toBe('2026-11-08T06:30:00.000Z');
  });

  it('turns a typed time into an instant in the zone', () => {
    expect(instantOf({ year: 2026, month: 7, day: 1, hour: 9, minute: 0 }, 'Asia/Tokyo')).toBe(
      Date.parse('2026-07-01T00:00:00Z'),
    );
  });

  it('lists each due moment in a span, at most one a day', () => {
    const a = alarm({ days: [1, 2, 3, 4, 5, 6, 7] });
    expect(dueBetween(a, MON_NOON - 24 * H, MON_NOON, NY)).toEqual([Date.parse('2026-11-16T12:00:00Z')]);
    expect(dueBetween(alarm({ enabled: false, days: [1] }), MON_NOON - 48 * H, MON_NOON, NY)).toEqual([]);
  });
});

describe('alarm edits', () => {
  const MON_NOON = Date.parse('2026-11-16T17:00:00Z');

  it('gives a new one-off alarm the next time its time comes, and it reads as on until then', () => {
    const doc = new ClockDoc(emptyData());
    doc.apply(addAlarm(doc.data, 'a_1', fields(), MON_NOON, NY), 'New alarm');
    const a = doc.data.alarms[0]!;
    expect(a.once).toBe('2026-11-17T07:00');
    expect(describeRepeat(a, MON_NOON, NY)).toBe('Tomorrow');
    expect(alarmIsOn(a, MON_NOON, NY)).toBe(true);
    expect(alarmIsOn(a, Date.parse('2026-11-17T12:00:01Z'), NY)).toBe(false);
    checkInvariants(doc.data);
  });

  it('switches a passed one-off back on for its next time', () => {
    const doc = new ClockDoc(emptyData());
    doc.apply(addAlarm(doc.data, 'a_1', fields(), MON_NOON, NY), 'New alarm');
    const later = Date.parse('2026-11-18T17:00:00Z');
    doc.apply(toggleAlarm(doc.data, 'a_1', later, NY), 'Turn on');
    expect(doc.data.alarms[0]!.once).toBe('2026-11-19T07:00');
    doc.apply(toggleAlarm(doc.data, 'a_1', later, NY), 'Turn off');
    expect(doc.data.alarms[0]).toMatchObject({ enabled: false, once: null });
    checkInvariants(doc.data);
  });

  it('moves once with the time, and drops it when the alarm repeats', () => {
    const doc = new ClockDoc(emptyData());
    doc.apply(addAlarm(doc.data, 'a_1', fields({ time: '18:00' }), MON_NOON, NY), 'New alarm');
    expect(doc.data.alarms[0]!.once).toBe('2026-11-16T18:00');
    doc.apply(editAlarm(doc.data, 'a_1', { time: '09:00' }, MON_NOON, NY), 'Edit');
    expect(doc.data.alarms[0]!.once).toBe('2026-11-17T09:00');
    doc.apply(editAlarm(doc.data, 'a_1', { days: [3, 1, 1] }, MON_NOON, NY), 'Edit');
    expect(doc.data.alarms[0]).toMatchObject({ days: [1, 3], once: null });
    expect(describeRepeat(doc.data.alarms[0]!, MON_NOON, NY)).toBe('Mon, Wed');
    checkInvariants(doc.data);
  });

  it('finds the next alarm and says how far off it is', () => {
    const a = alarm({ days: [2], label: 'Tue' });
    const b = alarm({ id: 'a_2', time: '13:00', days: [1], label: 'Mon' });
    expect(nextAlarm([a, b], MON_NOON, NY)?.alarm.label).toBe('Mon');
    expect(describeIn(H + 12 * M)).toBe('in 1 hr 12 min');
    expect(describeIn(30_000)).toBe('in less than a minute');
  });
});

describe('ringing alarms', () => {
  const at = Date.parse('2026-11-17T12:00:00Z');
  const data = { ...emptyData(), alarms: [alarm({ days: [2], label: 'Wake up', sound: 'bells' })] };
  const window = { zone: NY, since: () => at - H, snoozes: [] };

  it('rings an alarm due since it was last looked at, once', () => {
    const due = dueNow(data, at + M, new Set(), window);
    expect(due).toEqual([
      expect.objectContaining({ kind: 'alarm', label: 'Wake up', at, sound: 'bells', snooze: true }),
    ]);
    expect(dueNow(data, at + M, new Set([due[0]!.key]), window)).toEqual([]);
    expect(dueNow(data, at + M, new Set(), { ...window, since: () => at })).toEqual([]);
  });

  it('rings a snooze when it comes, and plans for it', () => {
    const snoozes = [{ id: 'a_1', label: 'Wake up', sound: 'bells', at: at + 9 * M }];
    expect(nextDueAt(data, at, { ...window, snoozes })).toBe(at + 9 * M);
    expect(dueNow(data, at + 9 * M, new Set(), { ...window, since: () => at, snoozes })).toEqual([
      expect.objectContaining({ key: `snooze:a_1:2026-11-17T12:09:00.000Z`, snooze: true }),
    ]);
  });
});

describe('sounds', () => {
  it('has the eight sounds, each with notes', () => {
    expect(SOUNDS.map((s) => s.name)).toEqual([
      'Chimes',
      'Bells',
      'Marimba',
      'Digital',
      'Rising',
      'Harp',
      'Radar',
      'Gentle',
    ]);
    for (const s of SOUNDS) expect(s.notes.length).toBeGreaterThan(0);
  });
});
