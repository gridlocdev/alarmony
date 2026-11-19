// Every system dialog the desktop app shows goes through here (PRD §3.7, §15). A headless run never puts one on
// the screen: it takes the default answer and notes the question in `skippedDialogs`, which checks read from the
// main process.
import { dialog, type BrowserWindow, type MessageBoxOptions } from 'electron';

export interface Answer {
  readonly response: number;
  readonly checkboxChecked: boolean;
}

export interface Dialogs {
  /** A question or a note; in a headless run, its default button. */
  ask(parent: BrowserWindow | null, options: MessageBoxOptions): Promise<Answer>;
  /** The folder picker; null when cancelled, and always in a headless run. */
  pickFolder(
    parent: BrowserWindow | null,
    options: { title: string; buttonLabel: string; defaultPath?: string },
  ): Promise<string | null>;
}

/** The questions a headless run skipped, newest last: what checks look at. */
export const skippedDialogs: string[] = [];
Object.assign(globalThis, { alarmonySkippedDialogs: skippedDialogs });

export function systemDialogs(headless: boolean): Dialogs {
  return {
    async ask(parent, options) {
      if (headless) {
        skippedDialogs.push(options.message);
        return { response: options.defaultId ?? 0, checkboxChecked: false };
      }
      const r = await (parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options));
      return { response: r.response, checkboxChecked: r.checkboxChecked };
    },
    async pickFolder(parent, options) {
      if (headless) {
        skippedDialogs.push(options.title);
        return null;
      }
      const opts = { ...options, properties: ['openDirectory' as const, 'createDirectory' as const] };
      const r = await (parent ? dialog.showOpenDialog(parent, opts) : dialog.showOpenDialog(opts));
      return r.canceled ? null : (r.filePaths[0] ?? null);
    },
  };
}
