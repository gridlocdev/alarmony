import { versionOf } from '@alarmony/node-files';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BrowserStore,
  ConflictError,
  MemoryStore,
  NativeStore,
  sha256Hex,
  type ClockStore,
  type DirHandle,
  type LockManagerLike,
} from '../src/index.ts';
import { fakeFolder } from './fakeFileSystem.ts';
import { fakeNativeBridge } from './fakeNativeBridge.ts';

let dir: string;
let n = 0;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'alarmony-contract-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const stores: Record<string, () => ClockStore> = {
  memory: () => new MemoryStore(),
  browser: () => {
    const { root } = fakeFolder('opfs');
    return new BrowserStore(() => Promise.resolve(root as unknown as DirHandle));
  },
  native: () => new NativeStore(fakeNativeBridge(path.join(dir, `native-${++n}`, 'clock.json'))),
};

describe.each(Object.entries(stores))('the %s store', (_name, make) => {
  it('starts with no file, creates one, and reads it back with its version', async () => {
    const store = make();
    expect(await store.load()).toEqual({ text: null, version: null });
    const v1 = await store.save('{"a":1}', null);
    expect(v1).toBe(versionOf('{"a":1}'));
    expect(v1).toBe(await sha256Hex('{"a":1}'));
    expect(await store.load()).toEqual({ text: '{"a":1}', version: v1 });
  });

  it('saves only from the version it last saw', async () => {
    const store = make();
    const v1 = await store.save('{"a":1}', null);
    await expect(store.save('{"a":2}', null)).rejects.toBeInstanceOf(ConflictError);
    const v2 = await store.save('{"a":2}', v1);
    await expect(store.save('{"a":3}', v1)).rejects.toBeInstanceOf(ConflictError);
    expect((await store.load()).version).toBe(v2);
  });

  it('keeps an unreadable copy beside the file without touching it', async () => {
    const store = make();
    await store.save('{"a":1}', null);
    const a = await store.saveCopy('{bad');
    const b = await store.saveCopy('{bad again');
    expect(a).toMatch(/^clock unreadable \d{4}-\d\d-\d\d-\d{6}\.json$/);
    expect(b).not.toBe(a);
    expect((await store.load()).text).toBe('{"a":1}');
  });
});

/** Web Locks in one page: each name runs its holders one after another. */
function fakeLocks(): LockManagerLike {
  const held = new Map<string, Promise<unknown>>();
  return {
    request<T>(name: string, task: () => Promise<T>): Promise<T> {
      const run = (held.get(name) ?? Promise.resolve()).catch(() => undefined).then(task);
      held.set(name, run);
      return run;
    },
  };
}

describe('the browser store in two tabs', () => {
  it('lets only one of two tabs that saw the same version save', async () => {
    const { root } = fakeFolder('opfs');
    const locks = fakeLocks();
    const tab = () => new BrowserStore(() => Promise.resolve(root as unknown as DirHandle), locks);
    const v1 = await tab().save('{"a":1}', null);
    const results = await Promise.allSettled([tab().save('{"tab":1}', v1), tab().save('{"tab":2}', v1)]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect((await tab().load()).text).toBe('{"tab":1}');
  });
});

describe('the native store', () => {
  it('says which folder the file is in', async () => {
    const file = path.join(dir, 'Alarmony', 'clock.json');
    const store = new NativeStore(fakeNativeBridge(file));
    await store.load();
    expect(store.location()).toBe(path.dirname(file));
  });
});
