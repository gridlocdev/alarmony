// Running in the background (PRD §15): the menu bar icon's menu, and what the app remembers about the questions
// it asks when the window closes or the app quits. No Electron values, so the tests run it in Node.
import { readFile } from 'node:fs/promises';
import type { MenuItemConstructorOptions } from 'electron';
import { writeAtomic } from '@alarmony/node-files';
import type { TrayState } from './bridge.ts';

/** What the tray's menu items do. */
export interface TrayActions {
  /** Runs a command in the page, as the menu bar does. */
  command(id: string): void;
  show(): void;
  quit(): void;
}

/**
 * Stop and Snooze while something rings, the next alarm, running timers with their time left, then Show Alarmony,
 * Pause All Timers, Settings… and Quit Alarmony. The alarm and timer lines are information, not buttons.
 */
export function trayMenu(state: TrayState, act: TrayActions): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];
  if (state.ringing) {
    items.push({ label: 'Stop', click: () => act.command('ringing.stop') });
    if (state.canSnooze) items.push({ label: 'Snooze', click: () => act.command('ringing.snooze') });
    items.push({ type: 'separator' });
  }
  if (state.next) items.push({ label: state.next, enabled: false });
  for (const t of state.timers) items.push({ label: t, enabled: false });
  if (state.next || state.timers.length) items.push({ type: 'separator' });
  items.push(
    { label: 'Show Alarmony', click: () => act.show() },
    {
      label: 'Pause All Timers',
      enabled: state.timers.length > 0,
      click: () => act.command('timer.pauseAll'),
    },
    {
      label: 'Settings…',
      click: () => {
        act.show();
        act.command('app.settings');
      },
    },
    { type: 'separator' },
    { label: 'Quit Alarmony', click: () => act.quit() },
  );
  return items;
}

export const EMPTY_TRAY: TrayState = {
  title: '',
  ringing: false,
  canSnooze: false,
  next: null,
  timers: [],
  armed: false,
};

/** The page's tray state as it crossed IPC, or null when it isn't one. Lines are cut short. */
export function parseTrayState(raw: unknown): TrayState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, 120) : null);
  const title = text(r.title);
  if (title === null || !Array.isArray(r.timers)) return null;
  return {
    title,
    ringing: r.ringing === true,
    canSnooze: r.canSnooze === true,
    next: text(r.next),
    timers: r.timers
      .map(text)
      .filter((t): t is string => t !== null)
      .slice(0, 20),
    armed: r.armed === true,
  };
}

/** The questions the app may stop asking. */
export interface BackgroundPrefs {
  /** Closing the window first says that Alarmony keeps running. */
  readonly closeNote: boolean;
  /** Quitting while something would ring asks first. */
  readonly askBeforeQuit: boolean;
}

export const DEFAULT_PREFS: BackgroundPrefs = { closeNote: true, askBeforeQuit: true };

export function parsePrefs(raw: unknown): BackgroundPrefs {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    closeNote: typeof r.closeNote === 'boolean' ? r.closeNote : DEFAULT_PREFS.closeNote,
    askBeforeQuit: typeof r.askBeforeQuit === 'boolean' ? r.askBeforeQuit : DEFAULT_PREFS.askBeforeQuit,
  };
}

/** A small JSON file in the app's data folder, or null when it is missing or unreadable. */
export async function readJsonFile(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

export async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await writeAtomic(file, JSON.stringify(value) + '\n');
}
