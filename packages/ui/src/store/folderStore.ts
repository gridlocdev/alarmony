/**
 * A folder picked in the browser through the File System Access API (PRD §3.7). clock.json in it is saved like
 * the one in the browser's own storage; the folder is remembered in IndexedDB for the next visit, and the browser
 * may ask again before Alarmony can open it.
 */
import { BrowserStore, type DirHandle } from './browserStore.ts';

type Access = 'granted' | 'denied' | 'prompt';

export interface PickedFolder extends DirHandle {
  readonly name: string;
  queryPermission(opts: { mode: 'readwrite' }): Promise<Access>;
  requestPermission(opts: { mode: 'readwrite' }): Promise<Access>;
}

type Picker = (opts: { id: string; mode: 'readwrite' }) => Promise<PickedFolder>;

function picker(): Picker | null {
  const p = (globalThis as { showDirectoryPicker?: Picker }).showDirectoryPicker;
  return typeof p === 'function' ? p : null;
}

/** Can this browser open a folder? (Chromium browsers; not Safari or Firefox.) */
export function canPickFolder(): boolean {
  return picker() !== null && typeof indexedDB !== 'undefined';
}

/** Asks which folder to use; null when the person cancels. */
export async function pickFolder(): Promise<PickedFolder | null> {
  const pick = picker();
  if (!pick) return null;
  try {
    return await pick({ id: 'alarmony', mode: 'readwrite' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

/** clock.json in the folder. */
export function folderStore(folder: PickedFolder): BrowserStore {
  return new BrowserStore(() => Promise.resolve(folder), undefined, folder.name);
}

/** Whether Alarmony may use the folder now; `ask` shows the browser's question (only after a click). */
export async function folderAccess(folder: PickedFolder, ask: boolean): Promise<Access> {
  try {
    const opts = { mode: 'readwrite' } as const;
    return await (ask ? folder.requestPermission(opts) : folder.queryPermission(opts));
  } catch {
    return 'denied';
  }
}

const DB = 'alarmony';
const TABLE = 'folder';
const KEY = 'clock';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(TABLE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB would not open.'));
  });
}

async function withTable<T>(mode: IDBTransactionMode, use: (t: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = use(db.transaction(TABLE, mode).objectStore(TABLE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB failed.'));
    });
  } finally {
    db.close();
  }
}

/** The folder picked last time, or null. */
export async function savedFolder(): Promise<PickedFolder | null> {
  if (!canPickFolder()) return null;
  const found: unknown = await withTable('readonly', (t) => t.get(KEY));
  return found && typeof found === 'object' && 'getFileHandle' in found ? (found as PickedFolder) : null;
}

/** Remembers the folder for the next visit; null forgets it. */
export async function rememberFolder(folder: PickedFolder | null): Promise<void> {
  if (folder) await withTable('readwrite', (t) => t.put(folder, KEY));
  else await withTable('readwrite', (t) => t.delete(KEY));
}
