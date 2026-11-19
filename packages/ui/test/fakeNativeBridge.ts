import { readDataFile, writeCopy, writeDataFile } from '@alarmony/node-files';
import path from 'node:path';
import type { NativeData } from '../src/index.ts';

/** The desktop bridge's data calls, done the way the main process does them, on a real file. */
export function fakeNativeBridge(file: string): NativeData {
  return {
    async load() {
      return { ...(await readDataFile(file)), folder: path.dirname(file) };
    },
    async save(text, expected) {
      const r = await writeDataFile(file, text, expected);
      return r.ok ? { ok: true, version: r.version } : { ok: false, reason: 'conflict' };
    },
    async saveCopy(text) {
      return path.basename(await writeCopy(file, text));
    },
  };
}
