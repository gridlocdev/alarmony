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
} as const;

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
