import { describe, expect, it } from 'vitest';
import {
  addTimer,
  classifyFile,
  editTimer,
  emptyData,
  serialize,
  toggleStopwatch,
  type ClockData,
} from '@alarmony/core';
import { ClockSession, MemoryStore, OUTSIDE_LABEL, countChanged, memoryRecovery } from '../src/index.ts';
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

function listen(session: ClockSession): string[] {
  const notices: string[] = [];
  session.onNotice = (text) => notices.push(text);
  return notices;
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
    const store = new MemoryStore(
      JSON.stringify({ format: 1, clocks: [], alarms: [], presets: [], timers: [{ id: 'bad' }] }),
    );
    expect((await open(store)).notice).toBe("Skipped 1 item Alarmony couldn't read.");
  });

  it('shows a file from a newer Alarmony read-only, never writing it (PRD §3.3)', async () => {
    const newer = (presets: unknown[]) =>
      JSON.stringify({ format: 9, clocks: [], alarms: [], timers: [], presets, hologram: true });
    const text = newer([{ id: 'p_1', label: 'Egg', ms: 360_000 }]);
    const recovery = memoryRecovery('left by another window');
    const { session, store, notice } = await open(new MemoryStore(text), recovery);
    expect(notice).toBeNull();
    expect(session.readOnly.value).toBe(true);
    expect(session.doc.data.presets.map((p) => p.label)).toEqual(['Egg']);
    expect(addOne(session)).toBe(false);
    expect(session.doc.undo()).toBeNull();
    await session.flush();
    expect(store.text).toBe(text);
    // What another window left waits for a version that can write the file.
    expect(session.recoverable.value).toBeNull();
    expect(recovery.left).toBe('left by another window');

    // It follows the file while it stays newer...
    store.text = newer([{ id: 'p_2', label: 'Tea', ms: 180_000 }]);
    expect(await session.refresh()).toBeNull();
    expect(session.doc.data.presets.map((p) => p.label)).toEqual(['Tea']);
    expect(session.readOnly.value).toBe(true);
    // ...and opens for editing once the file is one this version writes.
    const notices = listen(session);
    store.text = serialize(emptyData('UTC'));
    await session.refresh();
    expect(session.readOnly.value).toBe(false);
    expect(notices).toEqual(['clock.json can be changed again.']);
    expect(addOne(session)).toBe(true);
    await session.flush();
    expect(fileData(store).timers.map((x) => x.id)).toEqual(['t_1']);
  });

  it('keeps showing a read-only file when it goes missing or unreadable', async () => {
    const text = JSON.stringify({ format: 9, clocks: [], alarms: [], timers: [], presets: [] });
    const { session, store } = await open(new MemoryStore(text));
    store.text = '{ broken';
    await session.refresh();
    store.text = null;
    await session.refresh();
    expect(session.readOnly.value).toBe(true);
    expect(store.text).toBeNull();
  });

  it('takes a change made elsewhere as one undo step when nothing here is unsaved', async () => {
    const { session, store } = await open();
    store.text = serialize({
      ...fileData(store),
      presets: [{ id: 'p_1', label: 'Egg', ms: 360_000, extra: {} }],
    });
    expect(await session.refresh()).toBe(1);
    expect(session.doc.data.presets[0]?.label).toBe('Egg');
    expect(session.doc.undoLabel).toBe(OUTSIDE_LABEL);
    expect(await session.refresh()).toBeNull();
    session.doc.undo();
    await session.flush();
    expect(fileData(store).presets).toEqual([]);
  });

  it('merges unsaved changes with a change made elsewhere', async () => {
    const { session, store } = await open();
    const notices = listen(session);
    store.text = serialize({
      ...fileData(store),
      presets: [{ id: 'p_1', label: 'Egg', ms: 360_000, extra: {} }],
    });
    addOne(session);
    await session.flush();
    expect(session.status.value).toBe('saved');
    expect(fileData(store).presets.map((p) => p.label)).toEqual(['Egg']);
    expect(fileData(store).timers.map((t) => t.label)).toEqual(['Tea']);
    expect(notices).toEqual(['Merged with changes made elsewhere.']);
    // The edit made here is still one undo step.
    session.doc.undo();
    await session.flush();
    expect(fileData(store).timers).toEqual([]);
    expect(fileData(store).presets).toHaveLength(1);
  });

  it('writes a file deleted elsewhere again', async () => {
    const { session, store } = await open();
    const notices = listen(session);
    store.text = null;
    addOne(session);
    await session.flush();
    expect(fileData(store).timers).toHaveLength(1);
    expect(notices).toEqual(['clock.json was missing, so it was saved again.']);
  });

  it('keeps an unreadable file aside before writing over it', async () => {
    const { session, store } = await open();
    const notices = listen(session);
    store.text = '{ half a file';
    addOne(session);
    await session.flush();
    expect(session.status.value).toBe('saved');
    expect([...store.copies.values()]).toEqual(['{ half a file']);
    expect(notices[0]).toMatch(/^clock\.json couldn't be read\. It was kept as clock unreadable .*\.json\.$/);
    expect(fileData(store).timers).toHaveLength(1);
  });

  /** A saved timer, renamed here to Rice and elsewhere to Pasta, plus a timer added while the dialog is up. */
  async function clash() {
    const opened = await open();
    const { session, store } = opened;
    addOne(session);
    await session.flush();
    const there = fileData(store);
    store.text = serialize({ ...there, timers: there.timers.map((t) => ({ ...t, label: 'Pasta' })) });
    session.doc.apply(editTimer(session.doc.data, 't_1', 'Rice', 60_000, T0), 'Renamed');
    await session.flush();
    expect(session.status.value).toBe('conflict');
    expect(session.conflict.value?.items).toEqual(['Rice']);
    addOne(session, 't_2');
    await session.flush();
    expect(session.status.value).toBe('conflict');
    return opened;
  }

  it('asks when both sides changed the same thing; Keep Mine keeps this window’s', async () => {
    const { session, store } = await clash();
    await session.keepMine();
    expect(session.status.value).toBe('saved');
    expect(fileData(store).timers.map((t) => t.label)).toEqual(['Rice', 'Tea']);
    expect(session.doc.canUndo).toBe(true);
  });

  it('Use Theirs takes theirs where both changed, and keeps this window’s other changes', async () => {
    const { session, store } = await clash();
    await session.useTheirs();
    expect(session.status.value).toBe('saved');
    expect(fileData(store).timers.map((t) => t.label)).toEqual(['Pasta', 'Tea']);
    expect(session.doc.data).toEqual(fileData(store));
    // The dropped rename no longer fits the history.
    expect(session.doc.canUndo).toBe(false);
  });

  it('keeps an unreadable file aside before Keep Mine writes over it', async () => {
    const { session, store } = await clash();
    store.text = '{ half a file';
    const notice = await session.keepMine();
    expect([...store.copies.values()]).toEqual(['{ half a file']);
    expect(notice).toMatch(/^clock\.json couldn't be read\. It was kept as clock unreadable .*\.json\.$/);
    expect(fileData(store).timers.map((t) => t.label)).toEqual(['Rice', 'Tea']);
  });

  it('restores what a crashed window left, replayed onto changes made since', async () => {
    const { session: crashed, store, recovery: slot } = await open();
    store.failSaves = 3;
    addOne(crashed);
    await crashed.flush();
    expect(crashed.status.value).toBe('failed');
    store.text = serialize({
      ...fileData(store),
      presets: [{ id: 'p_1', label: 'Egg', ms: 360_000, extra: {} }],
    });
    const recovery = memoryRecovery(slot.text);
    const { session } = await open(store, recovery);
    expect(session.recoverable.value).not.toBeNull();
    session.restoreRecovered();
    expect(recovery.left).toBeNull();
    await session.flush();
    expect(fileData(store).presets.map((p) => p.label)).toEqual(['Egg']);
    expect(fileData(store).timers.map((t) => t.label)).toEqual(['Tea']);
  });

  it('restores a whole file kept by an older Alarmony, and offers nothing the file already has', async () => {
    const { store } = await open();
    const left = serialize({
      ...fileData(store),
      presets: [{ id: 'p_9', label: 'Kept', ms: 1000, extra: {} }],
    });
    const { session } = await open(store, memoryRecovery(left));
    session.restoreRecovered();
    await session.flush();
    expect(fileData(store).presets[0]?.label).toBe('Kept');
    const same = memoryRecovery(store.text);
    const again = await open(store, same);
    expect(again.session.recoverable.value).toBeNull();
    expect(same.left).toBeNull();
  });

  it('Discard forgets what the other window left', async () => {
    const { store } = await open();
    const left = serialize({
      ...fileData(store),
      presets: [{ id: 'p_9', label: 'Kept', ms: 1000, extra: {} }],
    });
    const recovery = memoryRecovery(left);
    const { session } = await open(store, recovery);
    session.discardRecovered();
    expect(recovery.left).toBeNull();
    expect(session.recoverable.value).toBeNull();
    expect(fileData(store).presets).toEqual([]);
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
