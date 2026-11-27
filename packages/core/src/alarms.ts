/**
 * Alarms: typed times, when each one is next due on this device's clock, and how its repeat reads (PRD §7).
 * Every function takes "now" and the zone; none reads the clock.
 */
import type { Alarm } from './format.ts';
import { addDays, instantOf, wallAt, weekday, type Wall } from './zoneTime.ts';

export const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];
export const WEEKENDS: readonly number[] = [6, 7];
export const EVERY_DAY: readonly number[] = [1, 2, 3, 4, 5, 6, 7];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A typed time as `HH:MM`, or null: `7`, `7:30`, `730`, `0730`, `7:30 pm`, `7pm`, `19:30`, `12 am` (PRD §7.2).
 * A bare hour without am/pm is that hour of the 24-hour day.
 */
export function parseAlarmTime(text: string): string | null {
  const m = /^\s*(\d{1,2})(?:(?::|\.|h)?(\d{2}))?\s*([ap])?\.?\s*(?:m\.?)?\s*$/i.exec(text);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] === undefined ? 0 : Number(m[2]);
  const half = m[3]?.toLowerCase();
  if (minute > 59) return null;
  if (half) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (half === 'p' ? 12 : 0);
  } else if (hour > 23) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

/** `HH:MM` moved by `delta` hours or minutes, round the clock: the editor's arrow keys (PRD §7.2). */
export function stepAlarmTime(time: string, part: 'hour' | 'minute', delta: number): string {
  const { hour, minute } = alarmClock(time);
  const total = hour * 60 + minute + delta * (part === 'hour' ? 60 : 1);
  const day = 24 * 60;
  const t = ((total % day) + day) % day;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

/** `HH:MM` → hour and minute. */
export function alarmClock(time: string): { readonly hour: number; readonly minute: number } {
  const [h, m] = time.split(':').map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

function wallOfOnce(once: string): Wall | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(once);
  if (!m) return null;
  return { year: +m[1]!, month: +m[2]!, day: +m[3]!, hour: +m[4]!, minute: +m[5]! };
}

const onceText = (w: Wall) => `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;

/** The first moment after `after` that `time` comes on the wall clock: today's or tomorrow's (PRD §7.2). */
function nextAt(
  time: string,
  after: number,
  zone: string,
  days: readonly number[] = EVERY_DAY,
): number | null {
  const { hour, minute } = alarmClock(time);
  const today = wallAt(after, zone);
  // Eight days covers every weekday once after today's time has gone.
  for (let k = 0; k <= 7; k++) {
    const date = addDays(today, k);
    if (!days.includes(weekday(date))) continue;
    const at = instantOf({ ...date, hour, minute }, zone);
    if (at > after) return at;
  }
  return null;
}

/** A one-off alarm turned on now gets `once`: the next time its `time` comes on this device's clock. */
export function onceFor(time: string, now: number, zone: string): string {
  const at = nextAt(time, now, zone)!;
  const w = wallAt(at, zone);
  // A time inside a daylight-saving gap keeps the typed time; it rings at the first minute after the gap.
  return onceText({ ...w, ...alarmClock(time) });
}

/** When a one-off alarm rings, or null for any other alarm. */
export function onceAt(alarm: Alarm, zone: string): number | null {
  const w = alarm.once === null ? null : wallOfOnce(alarm.once);
  return w ? instantOf(w, zone) : null;
}

/** The next moment after `after` the alarm is due on this device's clock, or null (PRD §7.3). */
export function nextDue(alarm: Alarm, after: number, zone: string): number | null {
  if (!alarm.enabled) return null;
  if (alarm.days.length === 0) {
    const at = onceAt(alarm, zone);
    return at !== null && at > after ? at : null;
  }
  return nextAt(alarm.time, after, zone, alarm.days);
}

/** Every due moment in (`from`, `to`], oldest first: at most one a day, so a short list. */
export function dueBetween(alarm: Alarm, from: number, to: number, zone: string): number[] {
  const out: number[] = [];
  for (let at = nextDue(alarm, from, zone); at !== null && at <= to; at = nextDue(alarm, at, zone))
    out.push(at);
  return out;
}

/** On, as the switch shows it: a one-off alarm whose time has passed reads as off (PRD §7.3). */
export function alarmIsOn(alarm: Alarm, now: number, zone: string): boolean {
  if (!alarm.enabled) return false;
  if (alarm.days.length > 0) return true;
  const at = onceAt(alarm, zone);
  return at !== null && at > now;
}

const sameDays = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((d, i) => d === b[i]);

/** The repeat in words: "Weekdays", "Every day", "Mon, Wed, Fri", or "Today"/"Tomorrow"/"Once" for a one-off. */
export function describeRepeat(alarm: Alarm, now: number, zone: string): string {
  const days = alarm.days;
  if (days.length === 0) {
    const at = alarmIsOn(alarm, now, zone) ? onceAt(alarm, zone) : null;
    if (at === null) return 'Once';
    const today = wallAt(now, zone);
    const then = wallAt(at, zone);
    const same = then.day === today.day && then.month === today.month && then.year === today.year;
    return same ? 'Today' : 'Tomorrow';
  }
  if (sameDays(days, EVERY_DAY)) return 'Every day';
  if (sameDays(days, WEEKDAYS)) return 'Weekdays';
  if (sameDays(days, WEEKENDS)) return 'Weekends';
  return days.map((d) => DAY_NAMES[d - 1]).join(', ');
}

/** The list order: time of day, then label (PRD §7.1). */
export function sortAlarms(alarms: readonly Alarm[]): Alarm[] {
  return [...alarms].sort((a, b) => a.time.localeCompare(b.time) || a.label.localeCompare(b.label));
}

/** The next alarm to ring across the list, or null. */
export function nextAlarm(
  alarms: readonly Alarm[],
  now: number,
  zone: string,
): { readonly alarm: Alarm; readonly at: number } | null {
  let best: { alarm: Alarm; at: number } | null = null;
  for (const alarm of alarms) {
    const at = nextDue(alarm, now, zone);
    if (at !== null && (best === null || at < best.at)) best = { alarm, at };
  }
  return best;
}

/** "in 7 hr 12 min", "in 5 min", "in less than a minute". */
export function describeIn(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (ms < 60_000) return 'in less than a minute';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `in ${m} min`;
  return m === 0 ? `in ${h} hr` : `in ${h} hr ${m} min`;
}
