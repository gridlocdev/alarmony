/** `folder.json` in the desktop app's data folder: which folder clock.json is in (PRD §3.7, §12). */
import path from 'node:path';

/** The file's name in the app's data folder. */
export const FOLDER_FILE = 'folder.json';

/** The folder folder.json names, or null when it is missing or doesn't name one. */
export function parseFolderFile(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const folder = (raw as Record<string, unknown>).folder;
  return typeof folder === 'string' && path.isAbsolute(folder) ? folder : null;
}

/**
 * The desktop app's data folder, where Electron puts it for an app named Alarmony, so the CLI finds folder.json
 * without Electron: ~/Library/Application Support on macOS, %APPDATA% on Windows, $XDG_CONFIG_HOME or ~/.config
 * elsewhere.
 */
export function appDataFolder(
  platform: string,
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): string {
  const base =
    platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support')
      : platform === 'win32'
        ? (env.APPDATA ?? path.join(home, 'AppData', 'Roaming'))
        : (env.XDG_CONFIG_HOME ?? path.join(home, '.config'));
  return path.join(base, 'Alarmony');
}
