// What each device keeps in page storage, with a fake storage the test can look into.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rungLog } from '../src/index.ts';

const NOW = Date.parse('2026-11-19T18:00:00.000Z');

function fakeStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
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
