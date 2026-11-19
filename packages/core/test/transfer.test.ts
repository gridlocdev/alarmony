// Import clock.json: the file's clock replaces this one as operations, so Undo takes it back (PRD §3.7).
import { describe, expect, it } from 'vitest';
import { addClock, applyOps, emptyData, importOps, serialize } from '../src/index.ts';

const here = emptyData('Europe/London');
const there = applyOps(here, addClock(here, 'c2', 'Asia/Tokyo') ?? []);

describe('importOps', () => {
  it('turns this clock into the file’s', () => {
    const read = importOps(here, serialize(there));
    expect(read.kind).toBe('ok');
    if (read.kind !== 'ok') return;
    expect(applyOps(here, read.ops).clocks.map((c) => c.zone)).toEqual(['Europe/London', 'Asia/Tokyo']);
  });

  it('changes nothing for the same file', () => {
    expect(importOps(here, serialize(here))).toEqual({ kind: 'ok', ops: [] });
  });

  it('refuses a file from a newer Alarmony, and one it can’t read', () => {
    const newer = JSON.stringify({ ...JSON.parse(serialize(here)), format: 99 });
    expect(importOps(here, newer)).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('newer'),
    });
    expect(importOps(here, 'not json')).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('Alarmony can read'),
    });
  });
});
