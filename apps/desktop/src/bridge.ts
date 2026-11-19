/**
 * The channels between the main process and the preload. The sandboxed preload can't import this file,
 * so it repeats the names: keep the two in step.
 */
export const Channels = {
  load: 'alarmony:load',
  save: 'alarmony:save',
  saveCopy: 'alarmony:save-copy',
  setMenu: 'alarmony:set-menu',
  closeReady: 'alarmony:close-ready',
  command: 'alarmony:command',
  closeRequested: 'alarmony:close-requested',
  fullScreen: 'alarmony:full-screen',
  notify: 'alarmony:notify',
  setTray: 'alarmony:set-tray',
  setOpenAtLogin: 'alarmony:set-open-at-login',
  openFolder: 'alarmony:open-folder',
  wake: 'alarmony:wake',
} as const;

/** What the menu bar icon shows, as `TrayState` in @alarmony/ui. */
export interface TrayState {
  readonly title: string;
  readonly ringing: boolean;
  readonly canSnooze: boolean;
  readonly next: string | null;
  readonly timers: readonly string[];
  readonly armed: boolean;
}

/** One item of the menu bar the page sends, as `NativeMenuItem` in @alarmony/ui. */
export interface NativeMenuItem {
  readonly type?: 'separator' | 'checkbox';
  readonly role?: string;
  readonly label?: string;
  readonly command?: string;
  readonly accelerator?: string;
  readonly enabled?: boolean;
  readonly checked?: boolean;
  readonly submenu?: readonly NativeMenuItem[];
}
