// Sandboxed preload: CommonJS, and it may only require('electron'), so the channel names from
// bridge.ts are repeated here. Keep them in step. It exposes exactly one object, `alarmonyNative`.
import type { NativeMenuItem } from './bridge.ts';

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports
const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '';
const version = arg('alarmony-version');
const chrome = arg('alarmony-chrome') === 'unified' ? 'unified' : 'native';

contextBridge.exposeInMainWorld('alarmonyNative', {
  version,
  chrome,
  load: () => ipcRenderer.invoke('alarmony:load'),
  save: (text: string, expected: string | null) => ipcRenderer.invoke('alarmony:save', text, expected),
  saveCopy: (text: string) => ipcRenderer.invoke('alarmony:save-copy', text),
  setMenu: (items: readonly NativeMenuItem[]) => ipcRenderer.send('alarmony:set-menu', items),
  onCommand: (fn: (id: string) => void) => ipcRenderer.on('alarmony:command', (_e, id: string) => fn(id)),
  onCloseRequested: (fn: () => void) => ipcRenderer.on('alarmony:close-requested', () => fn()),
  closeReady: () => ipcRenderer.send('alarmony:close-ready'),
  onFullScreen: (fn: (full: boolean) => void) =>
    ipcRenderer.on('alarmony:full-screen', (_e, full: boolean) => fn(full)),
});
