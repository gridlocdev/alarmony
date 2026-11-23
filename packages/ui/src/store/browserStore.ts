import { DATA_FILE, unreadableName } from '@alarmony/core';
import { ConflictError, sha256Hex, type ClockStore, type StoredFile } from './clockStore.ts';

/** The parts of a File System Access directory handle the store uses (OPFS in the browser, a fake in tests). */
export interface DirHandle {
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike>;
}
export interface FileHandleLike {
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
  createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void> }>;
}

/** The part of the Web Locks API the store uses (`navigator.locks`). */
export interface LockManagerLike {
  request<T>(name: string, task: () => Promise<T>): Promise<T>;
}

function defaultLocks(): LockManagerLike | null {
  return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null;
}

function isNotFound(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'NotFoundError';
}

/**
 * clock.json in the origin's private file system (PRD §3.7). Every tab shares it, so a save holds a Web Lock
 * while it checks the version and writes: a second tab can't pass the same check and overwrite it (PRD §3.4).
 */
const BROWSER_PLACE = 'Stored in this browser';

export class BrowserStore implements ClockStore {
  readonly kind = 'browser';
  readonly readOnly = false;
  readonly #root: () => Promise<DirHandle>;
  readonly #locks: LockManagerLike | null;
  readonly #place: string;
  #queue: Promise<unknown> = Promise.resolve();

  /**
   * `root` defaults to `navigator.storage.getDirectory()`, `locks` to `navigator.locks`. `place` is what
   * `location()` says: a picked folder's name, else "Stored in this browser".
   */
  constructor(
    root?: () => Promise<DirHandle>,
    locks: LockManagerLike | null = defaultLocks(),
    place = BROWSER_PLACE,
  ) {
    this.#root = root ?? (() => navigator.storage.getDirectory() as Promise<unknown> as Promise<DirHandle>);
    this.#locks = locks;
    this.#place = place;
  }

  /** Is there a private file system here? (Not in old browsers or some private windows.) */
  static available(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
  }

  async #read(name: string): Promise<string | null> {
    try {
      const handle = await (await this.#root()).getFileHandle(name);
      return new TextDecoder().decode(await (await handle.getFile()).arrayBuffer());
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async #write(name: string, text: string): Promise<void> {
    const handle = await (await this.#root()).getFileHandle(name, { create: true });
    const w = await handle.createWritable();
    await w.write(new TextEncoder().encode(text));
    await w.close();
  }

  /** One operation at a time in this tab, and across tabs while one holds the lock. */
  #serial<T>(task: () => Promise<T>): Promise<T> {
    const locks = this.#locks;
    const locked = locks ? () => locks.request('alarmony-clock-file', task) : task;
    // Runs after the one before it either way; that one's failure went to its own caller.
    const run = this.#queue.then(locked, locked);
    this.#queue = run;
    return run;
  }

  async load(): Promise<StoredFile> {
    const text = await this.#read(DATA_FILE);
    return { text, version: text === null ? null : await sha256Hex(text) };
  }

  save(text: string, expected: string | null): Promise<string> {
    return this.#serial(async () => {
      const current = await this.load();
      if (current.version !== expected) throw new ConflictError();
      // createWritable writes to a swap file and swaps it in on close(), so a failed write leaves the old file.
      await this.#write(DATA_FILE, text);
      return sha256Hex(text);
    });
  }

  saveCopy(text: string): Promise<string> {
    return this.#serial(async () => {
      const now = new Date();
      let n = 1;
      while ((await this.#read(unreadableName(now, n))) !== null) n++;
      const name = unreadableName(now, n);
      await this.#write(name, text);
      return name;
    });
  }

  location(): string {
    return this.#place;
  }

  /** Whether this is a folder someone picked, not the browser's own storage. */
  get inFolder(): boolean {
    return this.#place !== BROWSER_PLACE;
  }
}
