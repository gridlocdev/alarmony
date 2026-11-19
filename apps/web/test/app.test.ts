// The app's commands, notices and ringing, run against a file in memory with a clock the test moves.
import { describe, expect, it } from 'vitest';
import { addTimer, resetTimer, serialize } from '@alarmony/core';
import { startPreset } from '../src/app/commands.ts';
import { NOW, makeApp } from './helpers.ts';

const MIN = 60_000;

async function withTimer(minutes = 5, label = 'Pasta') {
  const made = await makeApp();
  const { app } = made;
  app.showTab('timers');
  const id = app.newId('t');
  app.edit(addTimer(app.data.peek(), { id, ms: minutes * MIN, label }, NOW), 'New timer');
  app.selected.value = id;
  return { ...made, id };
}

describe('stopwatch commands', () => {
  it('starts, laps, stops and resets, each one undo step', async () => {
    const { app, catalog, clock } = await makeApp();
    app.showTab('stopwatch');
    expect(catalog.run('stopwatch.toggle')).toBe(true);
    clock.at += 1500;
    expect(catalog.run('stopwatch.lap')).toBe(true);
    clock.at += 500;
    catalog.run('stopwatch.toggle');
    expect(app.data.value.stopwatch).toMatchObject({ state: 'paused', elapsedMs: 2000, laps: [1500] });
    expect(catalog.isEnabled(catalog.get('stopwatch.lap')!)).toBe(false);
    catalog.run('stopwatch.reset');
    expect(app.data.value.stopwatch).toMatchObject({ state: 'idle', elapsedMs: 0, laps: [] });
    expect(app.notice.value?.text).toBe('Reset the stopwatch.');
    app.notice.value!.action!.run();
    expect(app.data.value.stopwatch.laps).toEqual([1500]);
  });

  it('gives Space to the stopwatch only on its tab', async () => {
    const { app, catalog } = await makeApp();
    app.showTab('timers');
    expect(catalog.isEnabled(catalog.get('stopwatch.toggle')!)).toBe(false);
    app.showTab('stopwatch');
    expect(catalog.isEnabled(catalog.get('stopwatch.toggle')!)).toBe(true);
    expect(catalog.isEnabled(catalog.get('timer.toggle')!)).toBe(false);
  });
});

describe('timer commands', () => {
  it('draws an edit at the time it was made, not the last tick', async () => {
    const made = await makeApp();
    const { app, clock } = made;
    app.tick();
    clock.at += 800;
    app.edit(
      addTimer(app.data.peek(), { id: app.newId('t'), ms: 3 * MIN, label: '' }, clock.at),
      'New timer',
    );
    expect(app.clock.value).toBe(clock.at);
  });

  it('pauses, resumes, cancels and deletes the selected timer', async () => {
    const { app, catalog, clock, id } = await withTimer();
    clock.at += MIN;
    catalog.run('timer.toggle');
    expect(app.selectedTimer.value).toMatchObject({ state: 'paused', leftMs: 4 * MIN });
    catalog.run('timer.toggle');
    expect(app.selectedTimer.value?.state).toBe('running');
    catalog.run('timer.cancel');
    expect(app.selectedTimer.value).toMatchObject({ state: 'idle', endsAt: null });
    expect(app.notice.value?.text).toBe('Cancelled “Pasta”.');
    catalog.run('timer.delete');
    expect(app.data.value.timers).toEqual([]);
    expect(app.notice.value?.text).toBe('Deleted “Pasta”.');
    app.notice.value!.action!.run();
    expect(app.data.value.timers.map((t) => t.id)).toEqual([id]);
  });

  it('takes the Undo button away once another edit lands', async () => {
    const { app, catalog } = await withTimer();
    catalog.run('timer.cancel');
    expect(app.notice.value?.action?.label).toBe('Undo');
    catalog.run('timer.toggle');
    expect(app.notice.value).toBeNull();
  });

  it('saves a preset and starts timers from it', async () => {
    const { app, catalog } = await withTimer(25, 'Focus');
    catalog.run('timer.savePreset');
    const preset = app.data.value.presets[0]!;
    expect(preset).toMatchObject({ label: 'Focus', ms: 25 * MIN });
    startPreset(app, preset.id);
    expect(app.data.value.timers).toHaveLength(2);
    expect(app.selectedTimer.value).toMatchObject({ label: 'Focus', state: 'running' });
  });

  it('runs no single-key command behind a dialog', async () => {
    const { app, catalog } = await withTimer();
    app.open({ kind: 'settings' });
    expect(catalog.run('timer.toggle')).toBe(false);
    expect(catalog.run('view.commandMenu')).toBe(true);
  });

  it('closes the edit dialog when its timer goes away, so keys work again', async () => {
    const { app, catalog, id } = await withTimer();
    catalog.run('timer.edit');
    expect(app.dialog.value).toEqual({ kind: 'editTimer', id });
    app.undo();
    expect(app.dialog.value).toBeNull();
    expect(app.blocked()).toBe(false);
  });

  it('saves every edit to the file', async () => {
    const { app, catalog, session, store } = await withTimer();
    catalog.run('timer.toggle');
    await session.flush();
    expect(store.text).toBe(serialize(app.data.value));
  });
});

describe('ringing', () => {
  it('rings a finished timer once, and Stop leaves it showing Done', async () => {
    const { app, clock, sound, id } = await withTimer(1);
    app.tick();
    expect(app.ringing.value).toEqual([]);
    clock.at = NOW + MIN;
    app.tick();
    expect(app.ringing.value.map((r) => r.id)).toEqual([id]);
    expect(sound.calls).toEqual(['ring chimes']);
    app.stopAll();
    expect(sound.calls.at(-1)).toBe('stop');
    clock.at += 1000;
    app.tick();
    expect(app.ringing.value).toEqual([]);
    expect(app.finished(clock.at).map((t) => t.id)).toEqual([id]);
  });

  it('rings again after a restart, and stops when the timer is dismissed', async () => {
    const { app, catalog, clock } = await withTimer(1);
    clock.at = NOW + MIN;
    app.tick();
    catalog.run('ringing.stop');
    catalog.run('timer.restart');
    clock.at += MIN;
    app.tick();
    expect(app.ringing.value).toHaveLength(1);
    // The sheet is in front, so the card's Dismiss is the way here; it goes through the same edit.
    expect(catalog.run('timer.cancel')).toBe(false);
    app.edit(resetTimer(app.data.peek(), app.selected.value!), 'Cancel');
    expect(app.ringing.value).toEqual([]);
  });

  it('gives a sticky Missed notice for one that finished over 10 minutes ago', async () => {
    const { app, clock } = await withTimer(1);
    clock.at = NOW + 20 * MIN;
    app.tick();
    expect(app.ringing.value).toEqual([]);
    expect(app.notice.value).toMatchObject({ text: 'Missed: Pasta finished.', sticky: true });
  });

  it('stops by itself after 15 minutes', async () => {
    const { app, clock } = await withTimer(1);
    clock.at = NOW + MIN;
    app.tick();
    clock.at += 15 * MIN;
    app.tick();
    expect(app.ringing.value).toEqual([]);
    expect(app.notice.value?.text).toBe('Missed: Pasta finished.');
  });

  it('stays quiet with Ring on this device off', async () => {
    const { app, clock, sound } = await withTimer(1);
    app.setSettings({ ring: false });
    clock.at = NOW + MIN;
    app.tick();
    expect(app.ringing.value).toEqual([]);
    expect(sound.calls).toEqual([]);
  });

  it('waits for a click before sound in a browser that blocks it', async () => {
    const made = await makeApp(null, { soundAllowed: false });
    const { app, clock, sound } = made;
    app.edit(addTimer(app.data.peek(), { id: 't_1', ms: MIN, label: '' }, NOW), 'New timer');
    clock.at = NOW + MIN;
    app.tick();
    expect(app.soundWaiting.value).toBe(true);
    app.unlockSound();
    expect(app.soundWaiting.value).toBe(false);
    expect(sound.calls).toEqual(['ring chimes', 'unlock', 'stop', 'ring chimes']);
  });
});

describe('window title', () => {
  it('shows the soonest running timer', async () => {
    const { app, clock } = await withTimer(5);
    clock.at = NOW + 61_000;
    app.tick();
    expect(app.title.value).toBe('3:59 · Alarmony');
  });
});
