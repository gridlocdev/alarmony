/**
 * Every edit to the stopwatch, timers and presets, as pure functions from the data and "now" to operations
 * (PRD §8, §11). Null means the edit doesn't apply in the current state.
 */
import { alarmIsOn, onceFor } from './alarms.ts';
import {
  MAX_LABEL,
  MAX_LAPS,
  type Alarm,
  type ClockData,
  type Preset,
  type Stopwatch,
  type Timer,
  type WorldClock,
} from './format.ts';
import type { Op } from './ops.ts';
import { stopwatchElapsed } from './stopwatch.ts';
import { isDone, timerLeft } from './timers.ts';

const NO_EXTRA = Object.freeze({});
const iso = (ms: number) => new Date(ms).toISOString();
const clean = (label: string) => label.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);

function findTimer(data: ClockData, id: string): Timer | null {
  return data.timers.find((t) => t.id === id) ?? null;
}

function updateTimer(before: Timer, after: Timer): Op[] {
  return [{ kind: 'update', list: 'timers', before, after }];
}

// ── Timers ─────────────────────────────────────────────────────────────────

export interface NewTimer {
  readonly id: string;
  readonly ms: number;
  readonly label: string;
}

/** A new timer, running from `now` (PRD §8.2). It goes at the end of the list. */
export function addTimer(data: ClockData, timer: NewTimer, now: number): Op[] {
  const item: Timer = {
    id: timer.id,
    label: clean(timer.label),
    ms: timer.ms,
    state: 'running',
    endsAt: iso(now + timer.ms),
    leftMs: null,
    extra: NO_EXTRA,
  };
  return [{ kind: 'insert', list: 'timers', index: data.timers.length, item }];
}

/** Start an idle timer, or resume a paused one. */
export function startTimer(data: ClockData, id: string, now: number): Op[] | null {
  const t = findTimer(data, id);
  if (!t || t.state === 'running') return null;
  const left = t.state === 'paused' ? (t.leftMs ?? t.ms) : t.ms;
  return updateTimer(t, { ...t, state: 'running', endsAt: iso(now + left), leftMs: null });
}

/** Pause a running timer that hasn't finished. */
export function pauseTimer(data: ClockData, id: string, now: number): Op[] | null {
  const t = findTimer(data, id);
  if (!t || t.state !== 'running' || isDone(t, now)) return null;
  const leftMs = Math.min(t.ms, Math.max(1, Math.round(timerLeft(t, now))));
  return updateTimer(t, { ...t, state: 'paused', endsAt: null, leftMs });
}

/** Pause or resume: Space on a timer. A finished timer restarts. */
export function toggleTimer(data: ClockData, id: string, now: number): Op[] | null {
  const t = findTimer(data, id);
  if (!t) return null;
  if (t.state !== 'running') return startTimer(data, id, now);
  return isDone(t, now) ? restartTimer(data, id, now) : pauseTimer(data, id, now);
}

/** Back to idle with its length kept: Cancel, and Dismiss on a finished timer (PRD §8.2). */
export function resetTimer(data: ClockData, id: string): Op[] | null {
  const t = findTimer(data, id);
  if (!t || t.state === 'idle') return null;
  return updateTimer(t, { ...t, state: 'idle', endsAt: null, leftMs: null });
}

/** Run it again from its full length. */
export function restartTimer(data: ClockData, id: string, now: number): Op[] | null {
  const t = findTimer(data, id);
  if (!t) return null;
  return updateTimer(t, { ...t, state: 'running', endsAt: iso(now + t.ms), leftMs: null });
}

export function deleteTimer(data: ClockData, id: string): Op[] | null {
  const index = data.timers.findIndex((t) => t.id === id);
  const item = data.timers[index];
  return item ? [{ kind: 'remove', list: 'timers', index, item }] : null;
}

/** Change a timer's label and length. A running or paused timer keeps its time left unless its length changes. */
export function editTimer(data: ClockData, id: string, label: string, ms: number, now: number): Op[] | null {
  const t = findTimer(data, id);
  if (!t) return null;
  const relabelled = { ...t, label: clean(label) };
  if (ms === t.ms) return updateTimer(t, relabelled);
  const after: Timer =
    t.state === 'idle'
      ? { ...relabelled, ms }
      : t.state === 'paused'
        ? { ...relabelled, ms, leftMs: ms }
        : { ...relabelled, ms, endsAt: iso(now + ms) };
  return updateTimer(t, after);
}

/** Pause every running timer that hasn't finished (the menu bar's Pause All Timers, PRD §15). */
export function pauseAllTimers(data: ClockData, now: number): Op[] {
  return data.timers.flatMap((t) => pauseTimer(data, t.id, now) ?? []);
}

// ── Alarms ─────────────────────────────────────────────────────────────────

/** What the alarm editor sets (PRD §7.2). */
export interface AlarmFields {
  readonly time: string;
  readonly days: readonly number[];
  readonly label: string;
  readonly sound: string;
  readonly snooze: boolean;
}

const cleanDays = (days: readonly number[]) =>
  [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b);

/**
 * The alarm with `once` right for its state (PRD §7.2): a one-off alarm that is on rings at the next time its
 * `time` comes, set again when it is turned on or its time changes; any other alarm has none.
 */
function withOnce(before: Alarm | null, after: Alarm, now: number, zone: string): Alarm {
  if (!after.enabled || after.days.length > 0) return { ...after, once: null };
  const keep =
    before !== null &&
    before.time === after.time &&
    before.days.length === 0 &&
    after.once !== null &&
    alarmIsOn(before, now, zone);
  return keep ? after : { ...after, once: onceFor(after.time, now, zone) };
}

function findAlarm(data: ClockData, id: string): Alarm | null {
  return data.alarms.find((a) => a.id === id) ?? null;
}

function updateAlarm(before: Alarm, after: Alarm): Op[] {
  return [{ kind: 'update', list: 'alarms', before, after }];
}

/** A new alarm, turned on (Save in the New Alarm editor). */
export function addAlarm(data: ClockData, id: string, fields: AlarmFields, now: number, zone: string): Op[] {
  const item = withOnce(
    null,
    {
      id,
      time: fields.time,
      days: cleanDays(fields.days),
      label: clean(fields.label),
      sound: fields.sound,
      snooze: fields.snooze,
      enabled: true,
      once: null,
      extra: NO_EXTRA,
    },
    now,
    zone,
  );
  return [{ kind: 'insert', list: 'alarms', index: data.alarms.length, item }];
}

/** Change some of an alarm's fields; the editor of an existing alarm saves each change as it goes. */
export function editAlarm(
  data: ClockData,
  id: string,
  patch: Partial<AlarmFields>,
  now: number,
  zone: string,
): Op[] | null {
  const a = findAlarm(data, id);
  if (!a) return null;
  const next: Alarm = {
    ...a,
    ...patch,
    days: patch.days ? cleanDays(patch.days) : a.days,
    label: patch.label === undefined ? a.label : clean(patch.label),
  };
  return updateAlarm(a, withOnce(a, next, now, zone));
}

/** The switch: on as it reads becomes off, off becomes on (a passed one-off reads off, so it turns on again). */
export function toggleAlarm(data: ClockData, id: string, now: number, zone: string): Op[] | null {
  const a = findAlarm(data, id);
  if (!a) return null;
  const on = !alarmIsOn(a, now, zone);
  return updateAlarm(a, withOnce(on ? { ...a, enabled: false } : a, { ...a, enabled: on }, now, zone));
}

export function deleteAlarm(data: ClockData, id: string): Op[] | null {
  const index = data.alarms.findIndex((a) => a.id === id);
  const item = data.alarms[index];
  return item ? [{ kind: 'remove', list: 'alarms', index, item }] : null;
}

/** A copy with a new id, right after the original. */
export function duplicateAlarm(data: ClockData, id: string, newId: string): Op[] | null {
  const index = data.alarms.findIndex((a) => a.id === id);
  const item = data.alarms[index];
  return item ? [{ kind: 'insert', list: 'alarms', index: index + 1, item: { ...item, id: newId } }] : null;
}

// ── World clocks ───────────────────────────────────────────────────────────

/** A clock for `zone` at the end of the list; null when that zone already has one (PRD §6.1). */
export function addClock(data: ClockData, id: string, zone: string): Op[] | null {
  if (data.clocks.some((c) => c.zone === zone)) return null;
  const item: WorldClock = { id, zone, label: '', extra: NO_EXTRA };
  return [{ kind: 'insert', list: 'clocks', index: data.clocks.length, item }];
}

export function renameClock(data: ClockData, id: string, label: string): Op[] | null {
  const c = data.clocks.find((x) => x.id === id);
  if (!c || clean(label) === c.label) return null;
  return [{ kind: 'update', list: 'clocks', before: c, after: { ...c, label: clean(label) } }];
}

/** One place earlier (−1) or later (+1); null at either end. */
export function moveClock(data: ClockData, id: string, by: -1 | 1): Op[] | null {
  const from = data.clocks.findIndex((c) => c.id === id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= data.clocks.length) return null;
  return [{ kind: 'move', list: 'clocks', id, from, to }];
}

/** Moves a clock to just before (or after) another, as dragging one onto it does (PRD §6.1). */
export function moveClockBeside(data: ClockData, id: string, besideId: string, after: boolean): Op[] | null {
  const from = data.clocks.findIndex((c) => c.id === id);
  const beside = data.clocks.findIndex((c) => c.id === besideId);
  if (from < 0 || beside < 0) return null;
  // Where it goes in the list as it is, then in the list without it.
  const at = beside + (after ? 1 : 0);
  const to = at > from ? at - 1 : at;
  return to === from ? null : [{ kind: 'move', list: 'clocks', id, from, to }];
}

export function deleteClock(data: ClockData, id: string): Op[] | null {
  const index = data.clocks.findIndex((c) => c.id === id);
  const item = data.clocks[index];
  return item ? [{ kind: 'remove', list: 'clocks', index, item }] : null;
}

// ── Presets ────────────────────────────────────────────────────────────────

export function addPreset(data: ClockData, preset: NewTimer): Op[] {
  const item: Preset = { id: preset.id, label: clean(preset.label), ms: preset.ms, extra: NO_EXTRA };
  return [{ kind: 'insert', list: 'presets', index: data.presets.length, item }];
}

export function renamePreset(data: ClockData, id: string, label: string): Op[] | null {
  const p = data.presets.find((x) => x.id === id);
  return p ? [{ kind: 'update', list: 'presets', before: p, after: { ...p, label: clean(label) } }] : null;
}

export function deletePreset(data: ClockData, id: string): Op[] | null {
  const index = data.presets.findIndex((p) => p.id === id);
  const item = data.presets[index];
  return item ? [{ kind: 'remove', list: 'presets', index, item }] : null;
}

// ── Stopwatch ──────────────────────────────────────────────────────────────

function stopwatchOp(before: Stopwatch, after: Stopwatch): Op[] {
  return [{ kind: 'stopwatch', before, after }];
}

/** Start/Stop (Space, PRD §8.1). */
export function toggleStopwatch(data: ClockData, now: number): Op[] {
  const sw = data.stopwatch;
  if (sw.state === 'running')
    return stopwatchOp(sw, {
      ...sw,
      state: 'paused',
      startedAt: null,
      elapsedMs: Math.round(stopwatchElapsed(sw, now)),
    });
  return stopwatchOp(sw, { ...sw, state: 'running', startedAt: iso(now) });
}

export function canLap(sw: Stopwatch): boolean {
  return sw.state === 'running' && sw.laps.length < MAX_LAPS;
}

/** Lap (L, while running): the lap in progress becomes a finished lap. */
export function lapStopwatch(data: ClockData, now: number): Op[] | null {
  const sw = data.stopwatch;
  if (!canLap(sw)) return null;
  const done = sw.laps.reduce((a, b) => a + b, 0);
  const lap = Math.max(0, Math.round(stopwatchElapsed(sw, now)) - done);
  return stopwatchOp(sw, { ...sw, laps: [...sw.laps, lap] });
}

export function canReset(sw: Stopwatch): boolean {
  return sw.state === 'paused' || (sw.state === 'idle' && (sw.elapsedMs > 0 || sw.laps.length > 0));
}

/** Reset (R, while stopped and not zero). Undo brings it back. */
export function resetStopwatch(data: ClockData): Op[] | null {
  const sw = data.stopwatch;
  if (!canReset(sw)) return null;
  return stopwatchOp(sw, { state: 'idle', startedAt: null, elapsedMs: 0, laps: [], extra: sw.extra });
}

// ── Settings in the file ───────────────────────────────────────────────────

export function setSnoozeMinutes(data: ClockData, minutes: number): Op[] | null {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) return null;
  const before = data.settings;
  return [{ kind: 'settings', before, after: { ...before, snoozeMinutes: minutes } }];
}
