/** Export and import clock.json, and Open Folder in the browser (PRD §3.7). */
import { importOps, serialize } from '@alarmony/core';
import {
  BrowserStore,
  after,
  folderStore,
  pickFolder,
  rememberFolder,
  type ClockSession,
} from '@alarmony/ui';
import type { AppController } from './controller.ts';

/** The text Export saves: the clock as it is now, or the stored file as it is when a newer Alarmony wrote it. */
export async function exportText(app: AppController): Promise<string> {
  if (app.session.readOnly.peek()) {
    const stored = await app.session.store.load();
    if (stored.text !== null) return stored.text;
  }
  return serialize(app.data.peek());
}

/** Saves a copy of clock.json to the Downloads folder. */
export async function exportClock(app: AppController): Promise<void> {
  const url = URL.createObjectURL(new Blob([await exportText(app)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'clock.json';
  a.click();
  after(1000, () => URL.revokeObjectURL(url));
  app.say('Exported clock.json.');
}

/** Replaces the clock with a file's, as one change Undo takes back. */
export function importText(app: AppController, text: string): boolean {
  const read = importOps(app.data.peek(), text);
  if (read.kind === 'error') {
    app.say(read.message, { tone: 'error' });
    return false;
  }
  if (read.ops.length === 0) {
    app.say('That file is the same as the clock here.');
    return false;
  }
  return app.edit(read.ops, 'Import', 'Imported clock.json.');
}

/** Asks for a clock.json and imports it. */
export function importClock(app: AppController): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    file.text().then(
      (text) => void importText(app, text),
      (e: unknown) => app.say(`Couldn't read ${file.name}: ${String(e)}`, { tone: 'error' }),
    );
  });
  input.click();
}

/**
 * Open Folder in the browser: the clock moves to clock.json in a folder the person picks. A folder with no
 * clock.json gets this one's; a folder that has one is opened as it is. The page then reloads from it.
 */
export async function openBrowserFolder(session: ClockSession, reload: () => void): Promise<void> {
  const folder = await pickFolder();
  if (!folder) return;
  await session.flush();
  const there = folderStore(folder);
  if ((await there.load()).text === null) {
    const here = (await session.store.load()).text;
    if (here !== null) await there.save(here, null);
  }
  await rememberFolder(folder);
  reload();
}

/** Whether the clock is in a folder picked in this browser. */
export function inPickedFolder(session: ClockSession): boolean {
  return session.store instanceof BrowserStore && session.store.inFolder;
}

/** Back to the browser's own storage, with the folder's clock copied in so nothing is lost. */
export async function leaveFolder(session: ClockSession, reload: () => void): Promise<void> {
  await session.flush();
  const text = (await session.store.load()).text;
  const browser = new BrowserStore();
  if (text !== null) await browser.save(text, (await browser.load()).version);
  await rememberFolder(null);
  reload();
}
