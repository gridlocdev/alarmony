import type { NativeMenuItem } from '../commands/index.ts';
import { ConflictError, type ClockStore, type StoredFile } from './clockStore.ts';

/**
 * The data half of the desktop app's `window.alarmonyNative` bridge (PRD §15). Results come back as values,
 * not thrown errors, because errors lose their type crossing IPC.
 */
export interface NativeData {
  /** The file, its version, and the folder it is in. */
  load(): Promise<{ text: string | null; version: string | null; folder: string }>;
  save(
    text: string,
    expected: string | null,
  ): Promise<{ ok: true; version: string } | { ok: false; reason: 'conflict' }>;
  /** Keeps an unreadable file's text beside it; returns the copy's file name. */
  saveCopy(text: string): Promise<string>;
}

/** What the menu bar (tray) icon shows (PRD §15); the page sends it whenever it changes. */
export interface TrayState {
  /** The soonest running timer's time left ("9:41"), or '' for none. */
  readonly title: string;
  /** Something rings: the menu offers Stop. */
  readonly ringing: boolean;
  /** A ringing alarm can snooze. */
  readonly canSnooze: boolean;
  /** "Next: Wake up, 7:00 AM", or null when no alarm is on. */
  readonly next: string | null;
  /** One line per running timer: "Bread, 9:41 left". */
  readonly timers: readonly string[];
  /** An alarm is on or a timer runs: quitting asks first, and the app stays awake enough to ring. */
  readonly armed: boolean;
}

/** The whole `window.alarmonyNative` bridge: the data calls plus the window's. */
export interface AlarmonyNative extends NativeData {
  readonly version: string;
  /** 'unified': the window has no title bar and the page draws the toolbar row (macOS). */
  readonly chrome: 'unified' | 'native';
  /** Replaces the menu bar. */
  setMenu(items: readonly NativeMenuItem[]): void;
  /** A menu bar item was chosen. */
  onCommand(fn: (id: string) => void): void;
  /** The window wants to close: finish saving, then call `closeReady`. */
  onCloseRequested(fn: () => void): void;
  closeReady(): void;
  /** Shows a system notification; clicking it brings the window forward (PRD §9.2). */
  notify(title: string): void;
  /** The window entered or left full screen. */
  onFullScreen(fn: (full: boolean) => void): void;
  /** Updates the menu bar icon and its menu. */
  setTray(state: TrayState): void;
  /** Turns opening at login on or off (PRD §15). */
  setOpenAtLogin(on: boolean): void;
  /** Asks for another folder; when one is chosen the window reloads from it (PRD §3.7). */
  openFolder(): Promise<void>;
  /** The computer woke from sleep. */
  onWake(fn: () => void): void;
}

export class NativeStore implements ClockStore {
  readonly kind = 'native';
  readonly #bridge: NativeData;
  #folder = '';

  constructor(bridge: NativeData) {
    this.#bridge = bridge;
  }

  async load(): Promise<StoredFile> {
    const r = await this.#bridge.load();
    this.#folder = r.folder;
    return { text: r.text, version: r.version };
  }

  async save(text: string, expected: string | null): Promise<string> {
    const r = await this.#bridge.save(text, expected);
    if (!r.ok) throw new ConflictError();
    return r.version;
  }

  saveCopy(text: string): Promise<string> {
    return this.#bridge.saveCopy(text);
  }

  location(): string {
    return this.#folder;
  }
}
