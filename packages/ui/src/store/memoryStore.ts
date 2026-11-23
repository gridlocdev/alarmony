import { unreadableName } from '@alarmony/core';
import { ConflictError, sha256Hex, type ClockStore, type StoredFile } from './clockStore.ts';

/** A store in memory, for tests and demos. `copies` holds the saved copies by name. */
export class MemoryStore implements ClockStore {
  readonly kind = 'memory';
  readonly readOnly = false;
  text: string | null;
  readonly copies = new Map<string, string>();
  /** Set to make the next saves fail, like a full disk. */
  failSaves = 0;

  constructor(text: string | null = null) {
    this.text = text;
  }

  async load(): Promise<StoredFile> {
    return { text: this.text, version: this.text === null ? null : await sha256Hex(this.text) };
  }

  async save(text: string, expected: string | null): Promise<string> {
    if (this.failSaves > 0) {
      this.failSaves--;
      throw new Error('disk full');
    }
    const current = this.text === null ? null : await sha256Hex(this.text);
    if (current !== expected) throw new ConflictError();
    this.text = text;
    return sha256Hex(text);
  }

  saveCopy(text: string): Promise<string> {
    const now = new Date();
    let n = 1;
    while (this.copies.has(unreadableName(now, n))) n++;
    const name = unreadableName(now, n);
    this.copies.set(name, text);
    return Promise.resolve(name);
  }

  location(): string {
    return 'memory';
  }
}
