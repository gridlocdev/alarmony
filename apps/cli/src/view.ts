/** How items read in the terminal and in --json replies. Every function takes "now" and the zone. */
import {
  alarmIsOn,
  clockName,
  compareToHere,
  describeIn,
  describeRepeat,
  durationInput,
  formatCountdown,
  formatStopwatch,
  isFinished,
  nextDue,
  offsetAt,
  offsetText,
  soundFor,
  stopwatchElapsed,
  timerLeft,
  wallAt,
  type Alarm,
  type Preset,
  type Stopwatch,
  type Timer,
  type WorldClock,
} from '@alarmony/core';

const pad = (n: number) => String(n).padStart(2, '0');

/** `HH:MM` on the wall clock in `zone`. */
export function hhmm(at: number, zone: string): string {
  const w = wallAt(at, zone);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** "Fri 07:00", or "07:00" when it's today. */
function dayAndTime(at: number, now: number, zone: string): string {
  const w = wallAt(at, zone);
  const today = wallAt(now, zone);
  const same = w.year === today.year && w.month === today.month && w.day === today.day;
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: zone }).format(at);
  return same ? hhmm(at, zone) : `${day} ${hhmm(at, zone)}`;
}

/** Rows as aligned columns, two spaces apart. */
export function table(rows: readonly (readonly string[])[]): string {
  const widths: number[] = [];
  for (const row of rows) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, cell.length)));
  return rows
    .map((row) =>
      row
        .map((cell, i) => cell.padEnd(widths[i] ?? 0))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

export function clockView(c: WorldClock, now: number, here: string) {
  return {
    id: c.id,
    name: clockName(c),
    zone: c.zone,
    label: c.label,
    time: hhmm(now, c.zone),
    offset: offsetText(offsetAt(now, c.zone)),
    day: compareToHere(now, c.zone, here),
  };
}

export function clockLine(c: WorldClock, now: number, here: string): string[] {
  const v = clockView(c, now, here);
  return [v.id, v.time, v.name, v.day, v.zone];
}

export function alarmView(a: Alarm, now: number, zone: string) {
  const due = nextDue(a, now, zone);
  return {
    id: a.id,
    time: a.time,
    days: a.days,
    repeat: describeRepeat(a, now, zone),
    label: a.label,
    sound: soundFor(a.sound).id,
    snooze: a.snooze,
    on: alarmIsOn(a, now, zone),
    nextDue: due === null ? null : new Date(due).toISOString(),
  };
}

export function alarmLine(a: Alarm, now: number, zone: string): string[] {
  const v = alarmView(a, now, zone);
  const due = nextDue(a, now, zone);
  return [
    a.id,
    a.time,
    v.on ? 'on' : 'off',
    v.repeat,
    a.label,
    due === null ? '' : `next ${dayAndTime(due, now, zone)}, ${describeIn(due - now)}`,
  ];
}

export function timerView(t: Timer, now: number) {
  const left = timerLeft(t, now);
  return {
    id: t.id,
    label: t.label,
    ms: t.ms,
    length: formatCountdown(t.ms),
    state: t.state,
    done: isFinished(t, now),
    leftMs: Math.max(0, Math.round(left)),
    left: formatCountdown(left),
    endsAt: t.endsAt,
  };
}

export function timerLine(t: Timer, now: number, zone: string): string[] {
  const v = timerView(t, now);
  const state = v.done ? 'done' : t.state;
  const ends = t.state === 'running' && !v.done && t.endsAt ? `ends ${hhmm(Date.parse(t.endsAt), zone)}` : '';
  return [t.id, t.state === 'idle' ? v.length : v.left, state, t.label, ends];
}

export function presetView(p: Preset) {
  return { id: p.id, label: p.label, ms: p.ms, length: formatCountdown(p.ms), duration: durationInput(p.ms) };
}

export function stopwatchView(sw: Stopwatch, now: number) {
  const elapsed = stopwatchElapsed(sw, now);
  return {
    state: sw.state,
    elapsedMs: Math.round(elapsed),
    elapsed: formatStopwatch(elapsed),
    laps: sw.laps.map((ms, i) => ({ lap: i + 1, ms, time: formatStopwatch(ms) })),
  };
}

export function stopwatchText(sw: Stopwatch, now: number): string {
  const v = stopwatchView(sw, now);
  const head = `${v.elapsed}  ${sw.state === 'running' ? 'running' : sw.state === 'paused' ? 'stopped' : 'idle'}`;
  const laps = [...v.laps].reverse().map((l) => [`Lap ${l.lap}`, l.time]);
  return laps.length ? `${head}\n${table(laps)}` : head;
}
