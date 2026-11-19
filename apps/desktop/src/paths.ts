/** Where the desktop app keeps its files (PRD §12). No Electron imports, so the tests run it in Node. */
import path from 'node:path';

export interface DataPaths {
  /** Overrides Electron's user-data folder (window place), or null for the default. */
  readonly userData: string | null;
  /** The folder clock.json is in. */
  readonly folder: string;
}

/**
 * ALARMONY_FOLDER names the folder clock.json is in; without it, the file is in Documents/Alarmony (PRD §3.1).
 * ALARMONY_USER_DATA moves the window place to a throwaway folder for checks, and the clock with it unless
 * ALARMONY_FOLDER says otherwise, so a check never touches the owner's Documents.
 */
export function dataPaths(env: NodeJS.ProcessEnv, documents: string): DataPaths {
  const userData = env.ALARMONY_USER_DATA ? path.resolve(env.ALARMONY_USER_DATA) : null;
  const folder = env.ALARMONY_FOLDER
    ? path.resolve(env.ALARMONY_FOLDER)
    : path.join(userData ?? documents, 'Alarmony');
  return { userData, folder };
}

/** Only our own page may use the bridge or be navigated to. */
export function isAppUrl(url: string | undefined | null): boolean {
  return typeof url === 'string' && url.startsWith('app://alarmony/');
}

/** The file under `root` that an app:// path names, or null when it would leave `root`. */
export function appFile(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const file = path.normalize(path.join(root, decoded === '/' ? '/index.html' : decoded));
  return file.startsWith(root + path.sep) ? file : null;
}
