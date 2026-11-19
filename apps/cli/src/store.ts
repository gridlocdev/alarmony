/**
 * clock.json for the CLI (PRD §12): finding the folder, reading the file, and saving an edit through the same
 * operations, lock file and replay as the apps (§3.4, §3.5).
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  DATA_FILE,
  NEWER_FILE_MESSAGE,
  applyOps,
  classifyFile,
  emptyData,
  findClashes,
  replay,
  serialize,
  type ClockData,
  type Op,
} from '@alarmony/core';
import {
  FOLDER_FILE,
  appDataFolder,
  parseFolderFile,
  readDataFile,
  writeDataFile,
} from '@alarmony/node-files';
import type { Context } from './context.ts';
import { CliError, ConflictError } from './errors.ts';

const NO_FOLDER =
  'No clock folder. Pass --dir <folder>, set ALARMONY_DIR, or pick a folder in the Alarmony desktop app first.';

async function isFolder(dir: string): Promise<boolean> {
  return (await stat(dir).catch(() => null))?.isDirectory() ?? false;
}

/** --dir, else ALARMONY_DIR, else the folder the desktop app remembers in folder.json. Never made here. */
/** The parsed text, or null when it isn't JSON. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function clockFolder(ctx: Context): Promise<string> {
  const { io } = ctx;
  const given = ctx.dir ?? io.env.ALARMONY_DIR ?? null;
  let dir: string | null = given === null || given === '' ? null : path.resolve(given);
  if (dir === null) {
    const file = path.join(appDataFolder(io.platform, io.env, io.homeDir), FOLDER_FILE);
    const text = await readFile(file, 'utf8').catch(() => null);
    dir = parseFolderFile(text === null ? null : parseJson(text));
    if (dir === null) throw new CliError(NO_FOLDER);
  }
  if (!(await isFolder(dir))) throw new CliError(`The folder ${dir} isn't there.`);
  return dir;
}

/** What one read found. A folder with no clock.json yet reads as a new file (PRD §3.1). */
export interface Loaded {
  readonly file: string;
  readonly data: ClockData;
  /** Null when there is no file yet. */
  readonly version: string | null;
}

function readText(file: string, text: string): ClockData {
  const read = classifyFile(text);
  switch (read.kind) {
    case 'ok':
      return read.data;
    case 'newer':
      throw new CliError(NEWER_FILE_MESSAGE);
    case 'corrupt':
      throw new CliError(
        `${file} can't be read (${read.reason}). Open the folder in Alarmony, which keeps the file aside, or fix it by hand.`,
      );
  }
}

export async function load(ctx: Context): Promise<Loaded> {
  const file = path.join(await clockFolder(ctx), DATA_FILE);
  const read = await readDataFile(file);
  const data = read.text === null ? emptyData(ctx.io.zone) : readText(file, read.text);
  return { file, data, version: read.version };
}

export interface Saved {
  readonly data: ClockData;
  /** The file had changed since it was read, and this edit was replayed onto it. */
  readonly merged: boolean;
}

/**
 * Saves `ops` made on `loaded`. When the file changed meanwhile, the edit is replayed onto it field by field and
 * saved again, once. Both sides changing the same thing, or the file changing again, is a conflict: nothing is
 * written.
 */
export async function save(ctx: Context, loaded: Loaded, ops: readonly Op[]): Promise<Saved> {
  if (!ops.length) return { data: loaded.data, merged: false };
  let data = applyOps(loaded.data, ops);
  let expected = loaded.version;
  for (let attempt = 0; attempt < 2; attempt++) {
    await ctx.io.beforeWrite?.();
    const r = await writeDataFile(loaded.file, serialize(data), expected);
    if (r.ok) {
      if (attempt > 0 && !ctx.json) ctx.note('Merged with changes made elsewhere.');
      return { data, merged: attempt > 0 };
    }
    const now = await readDataFile(loaded.file);
    if (now.text === null) {
      // Deleted elsewhere: written again from what this command read, as the apps do (PRD §3.5).
      expected = null;
      continue;
    }
    const theirs = readText(loaded.file, now.text);
    const clashes = findClashes(loaded.data, theirs, ops);
    if (clashes.length) {
      const items = clashes.map((c) => c.name);
      throw new ConflictError(
        `clock.json changed somewhere else, and the change touches the same ${items.length === 1 ? 'item' : 'items'}: ${items.join(', ')}. Nothing was saved.`,
        items,
      );
    }
    data = replay(loaded.data, theirs, ops, 'mine').data;
    expected = now.version;
  }
  throw new ConflictError(
    'clock.json kept changing while this command saved. Nothing was saved; try again.',
    [],
  );
}
