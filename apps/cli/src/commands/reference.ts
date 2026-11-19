/** `man` and `schema`: the whole reference, and the shapes of the --json replies. */
import { EXIT_OK } from '../errors.ts';
import { renderManual, type CommandSpec } from '../spec.ts';

const CLOCK = {
  id: 'c_…',
  name: 'Tokyo',
  zone: 'Asia/Tokyo',
  label: '',
  time: 'HH:MM',
  offset: 'UTC+9',
  day: 'Today, +9 hrs',
};
const ALARM = {
  id: 'a_…',
  time: 'HH:MM',
  days: '[1–7, Monday = 1; empty rings once]',
  repeat: 'Weekdays | Every day | Mon, Wed | Today | Tomorrow | Never',
  label: '',
  sound: 'chimes',
  snooze: true,
  on: true,
  nextDue: 'ISO time or null',
};
const TIMER = {
  id: 't_…',
  label: '',
  ms: 600000,
  length: '10:00',
  state: 'idle | running | paused',
  done: false,
  leftMs: 599000,
  left: '9:59',
  endsAt: 'ISO time or null',
};
const PRESET = { id: 'p_…', label: 'Tea', ms: 180000, length: '3:00', duration: '3m' };
const STOPWATCH = {
  state: 'idle | running | paused',
  elapsedMs: 0,
  elapsed: '00:00.00',
  laps: [{ lap: 1, ms: 61234, time: '01:01.23' }],
};

/** Every reply has `ok`; a reply to a change also has `merged` (it was replayed onto changes made elsewhere). */
export const SCHEMA = {
  error: { ok: false, error: 'message', exit: '1 (error) or 2 (conflict: nothing was saved)' },
  clocks: { ok: true, clocks: [CLOCK] },
  'clock add': { ok: true, clock: CLOCK, merged: false },
  'clock remove': { ok: true, deleted: CLOCK, merged: false },
  alarms: { ok: true, alarms: [ALARM] },
  'alarm add | alarm edit': { ok: true, alarm: ALARM, merged: false },
  'alarm on | alarm off': { ok: true, alarm: ALARM, changed: true, merged: false },
  'alarm delete': { ok: true, deleted: ALARM, merged: false },
  timers: { ok: true, timers: [TIMER] },
  'timer start': { ok: true, timer: TIMER, merged: false },
  'timer start --wait': { ok: true, timer: TIMER, finished: true, merged: false },
  'timer pause | resume | cancel': { ok: true, timer: TIMER, merged: false },
  'timer delete': { ok: true, deleted: TIMER, merged: false },
  presets: { ok: true, presets: [PRESET] },
  'preset add': { ok: true, preset: PRESET, merged: false },
  'preset delete': { ok: true, deleted: PRESET, merged: false },
  stopwatch: { ok: true, stopwatch: STOPWATCH },
  'stopwatch start | stop | lap | reset': { ok: true, stopwatch: STOPWATCH, changed: true, merged: false },
};

export function referenceCommands(): CommandSpec[] {
  return [
    {
      name: 'man',
      description: 'Print the whole reference: every command and option',
      run: async (_p, ctx) => {
        ctx.io.stdout(renderManual(ctx.root));
        return EXIT_OK;
      },
    },
    {
      name: 'schema',
      description: 'Print the shape of each --json reply',
      run: async (_p, ctx) => {
        ctx.io.stdout(JSON.stringify(SCHEMA, null, 2) + '\n');
        return EXIT_OK;
      },
    },
  ];
}
