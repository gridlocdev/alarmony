/**
 * A folder picked with `<input type="file" webkitdirectory>`, the way Firefox and Safari open one (PRD §3.7). The
 * browser hands over a copy of the folder's files and no way to write back, so the store is read-only, and the
 * copy lasts only while this tab is open: the page keeps it in session storage across its own reloads.
 */
import { DATA_FILE } from '@alarmony/core';
import { sha256Hex, type ClockStore, type StoredFile } from './clockStore.ts';

/** The folder's name and its clock.json, as picked. */
export interface FolderCopy {
  readonly name: string;
  readonly text: string;
}

/** What a folder picked with the file input holds: its name, and its clock.json if it has one at the top. */
export function clockFileIn(files: readonly File[]): { readonly name: string; readonly file: File | null } {
  let name = '';
  let file: File | null = null;
  for (const f of files) {
    // "Alarmony/clock.json": the first part is the folder itself.
    const [top = '', ...rest] = f.webkitRelativePath.split('/');
    name ||= top;
    if (rest.length === 1 && rest[0] === DATA_FILE) file = f;
  }
  return { name: name || 'Folder', file };
}

/** The message every change gets while the folder is open read-only. */
export function readOnlyFolderMessage(name: string): string {
  return `“${name}” is read-only in this browser. The Alarmony desktop app can change it.`;
}

export class SnapshotStore implements ClockStore {
  readonly kind = 'browser';
  readonly readOnly = true;
  readonly name: string;
  readonly #text: string;

  constructor(copy: FolderCopy) {
    this.name = copy.name;
    this.#text = copy.text;
  }

  async load(): Promise<StoredFile> {
    return { text: this.#text, version: await sha256Hex(this.#text) };
  }

  save(): Promise<string> {
    return Promise.reject(new Error(readOnlyFolderMessage(this.name)));
  }

  saveCopy(): Promise<string> {
    return Promise.reject(new Error(readOnlyFolderMessage(this.name)));
  }

  location(): string {
    return `${this.name} (read-only)`;
  }
}

const KEY = 'alarmony.folderCopy';

function session(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Whether a picked folder's copy can be kept across the page's reload. */
export function canKeepFolderCopy(): boolean {
  return session() !== null;
}

/** Keeps the folder's copy for the reload that opens it. */
export function keepFolderCopy(copy: FolderCopy): void {
  const s = session();
  if (!s) throw new Error('This browser blocks storage for the site, so it can’t open the folder.');
  s.setItem(KEY, JSON.stringify(copy));
}

function readCopy(raw: string): FolderCopy | null {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object' || !('name' in v) || !('text' in v)) return null;
    const { name, text } = v;
    return typeof name === 'string' && typeof text === 'string' ? { name, text } : null;
  } catch {
    return null;
  }
}

/** The folder copy this tab opened, or null. One that can't be read is dropped, and the browser's clock opens. */
export function keptFolderCopy(): FolderCopy | null {
  const raw = session()?.getItem(KEY);
  if (!raw) return null;
  const copy = readCopy(raw);
  if (!copy) forgetFolderCopy();
  return copy;
}

/** Back to the browser's own storage on the next load. */
export function forgetFolderCopy(): void {
  session()?.removeItem(KEY);
}
