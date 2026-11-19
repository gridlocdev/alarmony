/** Clock times as the user's settings show them (PRD §13). */
import type { TimeFormat } from '@alarmony/ui';

/** `6:20 PM` or `18:20`, in this device's zone. */
export function clockTime(ms: number, format: TimeFormat): string {
  const hour12 = format === 'system' ? undefined : format === '12';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12 }).format(ms);
}
