// What each device keeps in page storage, with a fake storage the test can look into.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localRecovery, rungLog, type SlotLocks } from '../src/index.ts';

const NOW = Date.parse('2026-11-19T18:00:00.000Z');

function fakeStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
    key: (i: number) => [...items.keys()][i] ?? null,
    get length() {
      return items.size;
    },
  };
}

let storage: ReturnType<typeof fakeStorage>;
beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the rung log', () => {
  it('keeps what every open tab rang, not only the last one to write', () => {
    const tabA = rungLog(NOW);
    const tabB = rungLog(NOW);
    tabA.add('timer:t_1:2026-11-19T18:00:00.000Z', NOW);
    tabB.add('timer:t_2:2026-11-19T18:00:00.000Z', NOW);
    const reloaded = rungLog(NOW + 1000);
    expect([...reloaded.keys()].sort()).toEqual([
      'timer:t_1:2026-11-19T18:00:00.000Z',
      'timer:t_2:2026-11-19T18:00:00.000Z',
    ]);
  });

  it('forgets keys after three days', () => {
    rungLog(NOW).add('old', NOW);
    expect(rungLog(NOW + 3 * 24 * 3_600_000).has('old')).toBe(false);
  });
});

describe('the recovery slots', () => {
  /** Locks shared by the windows of one browser; `close` lets one go, like a closed tab. */
  function fakeLocks() {
    const held = new Set<string>();
    const locks: SlotLocks = { hold: (name) => void held.add(name), held: () => Promise.resolve([...held]) };
    return { locks, close: (name: string) => held.delete(name) };
  }

  it('offers what a closed window left, never an open window’s, newest first', async () => {
    const { locks, close } = fakeLocks();
    const a = localRecovery('u', locks, 'u_a');
    const b = localRecovery('u', locks, 'u_b');
    a.set(JSON.stringify({ at: 1 }));
    b.set(JSON.stringify({ at: 2 }));
    const c = localRecovery('u', locks, 'u_c');
    expect(await c.leftover()).toBeNull();
    close('u_a');
    close('u_b');
    expect(await c.leftover()).toBe(JSON.stringify({ at: 2 }));
    c.dropLeftover();
    expect(storage.items.has('u_b')).toBe(false);
    expect(await c.leftover()).toBe(JSON.stringify({ at: 1 }));
  });

  it('offers the one slot an older Alarmony kept, and empties its own when saved', async () => {
    const { locks } = fakeLocks();
    storage.setItem('u', 'old');
    const r = localRecovery('u', locks, 'u_me');
    expect(await r.leftover()).toBe('old');
    r.set('mine');
    expect(storage.items.get('u_me')).toBe('mine');
    r.clear();
    expect(storage.items.has('u_me')).toBe(false);
  });
});
