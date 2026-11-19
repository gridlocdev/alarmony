import { describe, expect, it } from 'vitest';
import {
  NEWER_FILE_MESSAGE,
  classifyFile,
  emptyData,
  applyOps,
  serialize,
  toggleStopwatch,
  unreadableName,
  type ClockData,
} from '../src/index.ts';
import { checkInvariants } from './support/invariants.ts';

const ok = (text: string): ClockData => {
  const r = classifyFile(text);
  if (r.kind !== 'ok') throw new Error(`expected ok, got ${r.kind}`);
  return r.data;
};

const SAMPLE = `{
  "format": 1,
  "settings": { "snoozeMinutes": 9 },
  "clocks": [{ "id": "c_x1", "zone": "Asia/Tokyo", "label": "" }],
  "alarms": [
    { "id": "a_x2", "time": "07:00", "days": [1, 2, 3, 4, 5], "label": "Wake up", "sound": "chimes", "snooze": true, "enabled": true, "once": null }
  ],
  "presets": [{ "id": "p_x3", "label": "Tea", "ms": 240000 }],
  "timers": [
    { "id": "t_x4", "label": "Pasta", "ms": 600000, "state": "running", "endsAt": "2026-11-19T18:20:00.000Z", "leftMs": null }
  ],
  "stopwatch": { "state": "running", "startedAt": "2026-11-19T18:00:00.000Z", "elapsedMs": 0, "laps": [61234, 59877] }
}`;

describe('classifyFile', () => {
  it('reads the PRD sample and writes it back with the same content', () => {
    const data = ok(SAMPLE);
    checkInvariants(data);
    expect(data.timers[0]?.label).toBe('Pasta');
    expect(JSON.parse(serialize(data))).toEqual(JSON.parse(SAMPLE));
  });

  it('round-trips: serialize then read gives the same data', () => {
    const data = ok(SAMPLE);
    expect(ok(serialize(data))).toEqual(data);
  });

  it('writes two-space JSON with a trailing newline', () => {
    const text = serialize(emptyData('Europe/London'));
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "format": 1,');
  });

  it('strips a byte-order mark', () => {
    expect(classifyFile(`\uFEFF${SAMPLE}`).kind).toBe('ok');
  });

  it('keeps unknown keys at the top and in items', () => {
    const raw = JSON.parse(SAMPLE);
    raw.colour = 'teal';
    raw.timers[0].sound = 'harp';
    raw.stopwatch.note = 'run';
    raw.settings.later = 1;
    const back = JSON.parse(serialize(ok(JSON.stringify(raw))));
    expect(back.colour).toBe('teal');
    expect(back.timers[0].sound).toBe('harp');
    expect(back.stopwatch.note).toBe('run');
    expect(back.settings.later).toBe(1);
  });

  it('keeps bad items as they were and counts them', () => {
    const raw = JSON.parse(SAMPLE);
    raw.alarms.push({ id: 'a_bad', time: '25:00' });
    raw.timers.push({ id: 't_bad', state: 'running', ms: 1000 });
    const r = classifyFile(JSON.stringify(raw));
    if (r.kind !== 'ok') throw new Error(r.kind);
    expect(r.skipped).toBe(2);
    expect(r.data.alarms).toHaveLength(1);
    const back = JSON.parse(serialize(r.data));
    expect(back.alarms[1]).toEqual({ id: 'a_bad', time: '25:00' });
    expect(back.timers[1]).toEqual({ id: 't_bad', state: 'running', ms: 1000 });
  });

  it.each([
    ['a bad start time', { state: 'running', startedAt: 'soon', elapsedMs: 5000, laps: [1000] }],
    ['a lap that is not whole', { state: 'paused', startedAt: null, elapsedMs: 5000, laps: [1000, 2.5] }],
    ['a state from a newer version', { state: 'frozen', startedAt: null, elapsedMs: 5000, laps: [] }],
    ['too many laps', { state: 'paused', startedAt: null, elapsedMs: 5000, laps: Array(1000).fill(5) }],
  ])('keeps a stopwatch with %s as it was until it is used', (_, stopwatch) => {
    const raw = { ...JSON.parse(SAMPLE), stopwatch, settings: { snoozeMinutes: 90 } };
    const r = classifyFile(JSON.stringify(raw));
    if (r.kind !== 'ok') throw new Error(r.kind);
    expect(r.skipped).toBe(2);
    expect(r.data.stopwatch.state).toBe('idle');
    const back = JSON.parse(serialize(r.data));
    expect(back.stopwatch).toEqual(stopwatch);
    expect(back.settings).toEqual({ snoozeMinutes: 90 });
    const started = applyOps(r.data, toggleStopwatch(r.data, Date.parse('2026-11-19T18:00:00Z')));
    expect(JSON.parse(serialize(started)).stopwatch).toMatchObject({
      state: 'running',
      elapsedMs: 0,
      laps: [],
    });
  });

  it('keeps a second item with a taken id as unread', () => {
    const raw = JSON.parse(SAMPLE);
    raw.presets.push({ id: 'p_x3', label: 'Again', ms: 1000 });
    const r = classifyFile(JSON.stringify(raw));
    expect(r.kind === 'ok' && r.skipped).toBe(1);
  });

  it.each([
    ['not JSON', '{'],
    ['null', 'null'],
    ['a list', '[]'],
    ['no format', '{"clocks": []}'],
    ['a list that is not a list', '{"format": 1, "clocks": [], "alarms": [], "presets": [], "timers": {}}'],
    ['a missing list', '{"format": 1, "clocks": [], "alarms": [], "presets": []}'],
    ['only a format', '{"format": 1}'],
  ])('calls %s corrupt', (_, text) => {
    expect(classifyFile(text).kind).toBe('corrupt');
  });

  it('calls a higher format newer', () => {
    expect(classifyFile('{"format": 2}')).toEqual({ kind: 'newer', format: 2 });
    expect(NEWER_FILE_MESSAGE).toMatch(/newer Alarmony/);
  });

  it('reads a missing stopwatch or settings as the defaults', () => {
    const data = ok('{"format": 1, "clocks": [], "alarms": [], "presets": [], "timers": []}');
    expect(data.stopwatch.state).toBe('idle');
    expect(data.settings.snoozeMinutes).toBe(9);
    checkInvariants(data);
  });

  it('starts a new file with one clock for the given zone', () => {
    const data = emptyData('America/New_York');
    expect(data.clocks.map((c) => c.zone)).toEqual(['America/New_York']);
    expect(data.alarms).toEqual([]);
    checkInvariants(data);
  });
});

describe('unreadableName', () => {
  it('dates the copy and numbers a second one', () => {
    const at = new Date(2026, 10, 19, 9, 5, 7);
    expect(unreadableName(at)).toBe('clock unreadable 2026-11-19-090507.json');
    expect(unreadableName(at, 2)).toBe('clock unreadable 2026-11-19-090507 2.json');
  });
});
