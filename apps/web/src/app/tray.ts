/** What the desktop app's menu bar icon shows, worked out from the page's state (PRD §15). */
import {
  formatCountdown,
  isDone,
  nextAlarm,
  soonestTimer,
  timerLeft,
  timerName,
  type ClockData,
  type Due,
} from '@alarmony/core';
import type { TimeFormat, TrayState } from '@alarmony/ui';
import { clockTime } from './time.ts';

export interface TrayInput {
  readonly data: ClockData;
  readonly now: number;
  readonly zone: string;
  readonly format: TimeFormat;
  readonly ringing: readonly Due[];
  /** The "show countdown in the menu bar" setting. */
  readonly countdown: boolean;
}

export function trayState({ data, now, zone, format, ringing, countdown }: TrayInput): TrayState {
  const running = data.timers.filter((t) => t.state === 'running' && !isDone(t, now));
  const soonest = soonestTimer(data.timers, now);
  const next = nextAlarm(data.alarms, now, zone);
  return {
    title: countdown && soonest ? formatCountdown(timerLeft(soonest, now)) : '',
    ringing: ringing.length > 0,
    canSnooze: ringing.some((r) => r.snooze),
    next: next ? `Next: ${next.alarm.label || 'Alarm'}, ${clockTime(next.at, format)}` : null,
    timers: running.map((t) => `${timerName(t)}, ${formatCountdown(timerLeft(t, now))} left`),
    armed: next !== null || running.length > 0,
  };
}
