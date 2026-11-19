/** Clock times as the user's settings show them (PRD §13). */
import type { TimeFormat } from '@alarmony/ui';

// hourCycle, not hour12: in some locales hour12:false picks h24 and shows midnight as 24:05.
const CYCLE: Record<TimeFormat, Intl.DateTimeFormatOptions['hourCycle']> = {
  system: undefined,
  '12': 'h12',
  '24': 'h23',
};
const formatters = new Map<TimeFormat, Intl.DateTimeFormat>();

/** `6:20 PM` or `18:20`, in this device's zone. The formatter is built once per format, not every tick. */
export function clockTime(ms: number, format: TimeFormat): string {
  let f = formatters.get(format);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hourCycle: CYCLE[format] });
    formatters.set(format, f);
  }
  return f.format(ms);
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

/** The time in another zone, as `clockTime` shows it, with seconds when asked (PRD §6.2, §13). */
export function zoneClockTime(ms: number, zone: string, format: TimeFormat, seconds: boolean): string {
  const key = `${zone}|${format}|${seconds}`;
  let f = zoneFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
      ...(seconds ? { second: '2-digit' } : {}),
      hourCycle: CYCLE[format],
    });
    zoneFormatters.set(key, f);
  }
  return f.format(ms);
}
