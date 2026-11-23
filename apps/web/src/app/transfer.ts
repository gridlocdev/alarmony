/** Export and import clock.json, and Open Folder in the browser (PRD §3.7). */
import { classifyFile, importOps, serialize } from '@alarmony/core';
import {
  BrowserStore,
  SnapshotStore,
  after,
  clockFileIn,
  folderStore,
  forgetFolderCopy,
  keepFolderCopy,
  pickFolder,
  rememberFolder,
  type ClockSession,
} from '@alarmony/ui';
import type { AppController } from './controller.ts';
import { pickFolderFiles } from './folderInput.ts';

/** What Open Folder says in a browser that can't pick a folder at all (PRD §3.7). */
export const NO_FOLDER_MESSAGE =
  'This browser can’t open a folder. The Alarmony desktop app can; here, Export and Import clock.json… keep a copy.';

/** Shown from the click until the folder's files arrive: a big folder takes the browser a while to read. */
const WAITING = 'Waiting for the folder…';

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

/**
 * Open Folder in Firefox and Safari: the browser hands over a copy of the folder's files, so its clock.json opens
 * read-only for as long as this tab is open (PRD §3.7). The browser's own clock is left as it is.
 */
export async function openFolderCopy(
  app: AppController,
  reload: () => void,
  pick: () => Promise<File[] | null> = pickFolderFiles,
): Promise<void> {
  app.say(WAITING);
  const files = await pick();
  if (app.notice.peek()?.text === WAITING) app.dismissNotice();
  if (!files) return;
  const { name, file } = clockFileIn(files);
  if (!file) {
    app.say(`“${name}” has no clock.json, and this browser can’t write one there.`, { tone: 'error' });
    return;
  }
  const text = await file.text();
  if (classifyFile(text).kind === 'corrupt') {
    app.say(`clock.json in “${name}” couldn’t be read.`, { tone: 'error' });
    return;
  }
  await app.session.flush();
  keepFolderCopy({ name, text });
  reload();
}

/** Whether the clock is in a folder picked in this browser, read-only or not. */
export function inPickedFolder(session: ClockSession): boolean {
  return (
    session.store instanceof SnapshotStore ||
    (session.store instanceof BrowserStore && session.store.inFolder)
  );
}

/**
 * Back to the browser's own storage. A folder Alarmony could write has its clock copied in so nothing is lost; a
 * read-only one changed nothing, so the browser's own clock comes back as it was.
 */
export async function leaveFolder(session: ClockSession, reload: () => void): Promise<void> {
  if (session.store instanceof SnapshotStore) {
    forgetFolderCopy();
    reload();
    return;
  }
  await session.flush();
  const text = (await session.store.load()).text;
  const browser = new BrowserStore();
  if (text !== null) await browser.save(text, (await browser.load()).version);
  await rememberFolder(null);
  reload();
}
