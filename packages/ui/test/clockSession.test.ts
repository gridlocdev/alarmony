import { describe, expect, it } from 'vitest';
import {
  addTimer,
  classifyFile,
  emptyData,
  serialize,
  toggleStopwatch,
  type ClockData,
} from '@alarmony/core';
import { ClockSession, MemoryStore, countChanged, memoryRecovery } from '../src/index.ts';
import { RANDOM_TIMEOUT, runRandomOps } from './support/randomOps.ts';

const T0 = Date.parse('2026-11-19T18:00:00.000Z');
const noWait = () => Promise.resolve();

function fileData(store: MemoryStore): ClockData {
  const r = classifyFile(store.text ?? '');
  if (r.kind !== 'ok') throw new Error(r.kind);
  return r.data;
}

async function open(store = new MemoryStore(), recovery = memoryRecovery()) {
  const { session, notice } = await ClockSession.open(store, {
    wait: noWait,
    recovery,
    zone: 'Europe/Paris',
  });
  await session.flush();
  return { session, notice, store, recovery };
}

const addOne = (session: ClockSession, id = 't_1') =>
  session.doc.apply(addTimer(session.doc.data, { id, ms: 60_000, label: 'Tea' }, T0), 'Started timer');

describe('ClockSession', () => {
  it('writes a new file with one clock for this zone on first start', async () => {
    const { store, notice } = await open();
    expect(notice).toBeNull();
    expect(fileData(store).clocks.map((c) => c.zone)).toEqual(['Europe/Paris']);
  });

  it('saves every edit at once and clears the recovery slot when saved', async () => {
    const { session, store, recovery } = await open();
    addOne(session);
    expect(session.status.value).toBe('saving');
    expect(recovery.text).not.toBeNull();
    await session.flush();
    expect(session.status.value).toBe('saved');
    expect(fileData(store).timers.map((t) => t.label)).toEqual(['Tea']);
    expect(recovery.text).toBeNull();
  });

  it('retries a failed save twice, then waits for Try Again', async () => {
    const { session, store } = await open();
    store.failSaves = 2;
    addOne(session);
    await session.flush();
    expect(session.status.value).toBe('saved');
    store.failSaves = 3;
    session.doc.apply(toggleStopwatch(session.doc.data, T0), 'Started');
    await session.flush();
    expect(session.status.value).toBe('failed');
    session.retry();
    await session.flush();
    expect(session.status.value).toBe('saved');
    expect(fileData(store).stopwatch.state).toBe('running');
  });

  it('keeps an unreadable file aside and starts a new one', async () => {
    const store = new MemoryStore('{not json');
    const { notice } = await open(store);
    expect(notice).toMatch(/kept as clock unreadable .*\.json/);
    expect([...store.copies.values()]).toEqual(['{not json']);
    expect(classifyFile(store.text ?? '').kind).toBe('ok');
  });

  it('says how many items it skipped', async () => {
    const store = new MemoryStore(JSON.stringify({ format: 1, timers: [{ id: 'bad' }] }));
    expect((await open(store)).notice).toBe("Skipped 1 item Alarmony couldn't read.");
  });

  it('refuses a file from a newer Alarmony', async () => {
    await expect(open(new MemoryStore('{"format": 9}'))).rejects.toThrow(/newer Alarmony/);
  });

  it('takes a change made elsewhere when nothing here is unsaved', async () => {
    const { session, store } = await open();
    const other = emptyData('UTC');
    store.text = serialize({ ...other, presets: [{ id: 'p_1', label: 'Egg', ms: 360_000, extra: {} }] });
    expect(await session.refresh()).toBeGreaterThan(0);
    expect(session.doc.data.presets[0]?.label).toBe('Egg');
    expect(await session.refresh()).toBeNull();
  });

  it('asks on a conflict; Keep Mine writes this window, Use Theirs takes the file', async () => {
    const { session, store } = await open();
    const theirs = serialize(emptyData('Asia/Tokyo'));
    store.text = theirs;
    addOne(session);
    await session.flush();
    expect(session.status.value).toBe('conflict');
    expect(session.conflict.value?.changed).toBeGreaterThan(0);
    await session.keepMine();
    expect(session.status.value).toBe('saved');
    expect(fileData(store).timers).toHaveLength(1);

    store.text = theirs;
    addOne(session, 't_2');
    await session.flush();
    expect(session.status.value).toBe('conflict');
    await session.useTheirs();
    expect(session.status.value).toBe('saved');
    expect(session.doc.data.clocks[0]?.zone).toBe('Asia/Tokyo');
    expect(session.doc.data.timers).toEqual([]);
  });

  it('offers last time’s unsaved data, and restores it', async () => {
    const { store } = await open();
    const recovery = memoryRecovery();
    const mine = emptyData('Europe/Paris');
    recovery.text = serialize({ ...mine, presets: [{ id: 'p_9', label: 'Kept', ms: 1000, extra: {} }] });
    const { session } = await open(store, recovery);
    expect(session.recoverable.value).not.toBeNull();
    session.restoreRecovered();
    await session.flush();
    expect(fileData(store).presets[0]?.label).toBe('Kept');
  });

  it('counts changed items and the stopwatch', () => {
    const a = emptyData('UTC');
    expect(countChanged(a, a)).toBe(0);
    expect(countChanged(a, emptyData('Asia/Tokyo'))).toBe(1);
  });
});

interface State {
  session: ClockSession;
  store: MemoryStore;
  next: number;
  /** Refreshes run alongside the other steps; finish waits for them. */
  reads: Promise<unknown>[];
}

describe('random session use', () => {
  it(
    'random edits, failures and outside changes never lose a saved edit',
    async () => {
      await runRandomOps<State>({
        setup: async () => {
          const { session, store } = await open();
          return { session, store, next: 1, reads: [] };
        },
        ops: [
          { name: 'edit', weight: 4, run: (s) => void addOne(s.session, `t_${s.next++}`) },
          { name: 'undo', run: (s) => void s.session.doc.undo() },
          { name: 'fail next save', run: (s) => void (s.store.failSaves = 3) },
          { name: 'flush', weight: 3, run: (s) => s.session.flush() },
          { name: 'retry', when: (s) => s.session.status.value === 'failed', run: (s) => s.session.retry() },
          {
            name: 'change elsewhere',
            run: (s) => void (s.store.text = serialize(emptyData(`Zone/${s.next++}`))),
          },
          { name: 'refresh', run: (s) => void s.reads.push(s.session.refresh()) },
          {
            name: 'keep mine',
            when: (s) => s.session.state === 'conflict',
            run: (s) => s.session.keepMine(),
          },
          {
            name: 'use theirs',
            when: (s) => s.session.state === 'conflict',
            run: async (s) => void (await s.session.useTheirs()),
          },
        ],
        check: () => undefined,
        finish: async (s) => {
          s.store.failSaves = 0;
          await Promise.all(s.reads);
          // Settle: a retry can meet a change made elsewhere, so it may take a Try Again then a Keep Mine.
          for (let i = 0; i < 3; i++) {
            await s.session.flush();
            if (s.session.state === 'failed') s.session.retry();
            else if (s.session.state === 'conflict') await s.session.keepMine();
          }
          await s.session.flush();
          // A change made elsewhere after the last save is picked up, not written over.
          await s.session.refresh();
          expect(s.session.status.value).toBe('saved');
          expect(s.store.text).toBe(serialize(s.session.doc.data));
        },
      });
    },
    RANDOM_TIMEOUT,
  );
});
