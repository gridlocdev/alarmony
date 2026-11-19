/** The bridge the desktop app's preload script puts on `window.alarmonyNative` (PRD §15). */
import type { AlarmonyNative } from '@alarmony/ui';

export function nativeBridge(): AlarmonyNative | null {
  return (globalThis as { alarmonyNative?: AlarmonyNative }).alarmonyNative ?? null;
}
