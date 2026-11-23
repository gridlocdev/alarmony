/**
 * Where clock.json lives. Every platform (desktop, browser, tests) has one adapter with the same contract,
 * checked by `test/storeContract.test.ts`: versions are the SHA-256 of the file text (PRD §3.4).
 */

export interface StoredFile {
  /** The file's text, or null when there is no file yet. */
  readonly text: string | null;
  /** The version to send with the next save; null when there is no file (the save then creates it). */
  readonly version: string | null;
}

export interface ClockStore {
  readonly kind: 'memory' | 'browser' | 'native';
  /** True when nothing can be written here: a folder picked with the file input in Firefox or Safari (PRD §3.7). */
  readonly readOnly: boolean;
  load(): Promise<StoredFile>;
  /** Saves `text` if the file still has version `expected`, and returns the new version. Throws ConflictError if not. */
  save(text: string, expected: string | null): Promise<string>;
  /** Keeps an unreadable file's text as `clock unreadable <date>.json` beside it (PRD §3.3); returns the name. */
  saveCopy(text: string): Promise<string>;
  /** Where the file is, for people: a folder path, or a description. */
  location(): string;
}

/** The file changed since it was read; nothing was written. */
export class ConflictError extends Error {
  constructor() {
    super('clock.json changed since it was read.');
    this.name = 'ConflictError';
  }
}

/** SHA-256 of the text's UTF-8 bytes, in hex: the same versions the Node side computes. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
