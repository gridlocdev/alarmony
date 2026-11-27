// The app's commands, notices and ringing, run against a file in memory with a clock the test moves.
import { describe, expect, it } from 'vitest';
import { addPreset, addTimer, deleteTimer, serialize } from '@alarmony/core';
import { dynamicEntries, startPreset } from '../src/app/timerCommands.ts';
import { placeLabel } from '../src/app/StatusBar.tsx';
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

  it('selects the timer beside a deleted one, so Delete goes on from there', async () => {
    const { app, catalog, id } = await withTimer();
    const second = app.newId('t');
    app.edit(addTimer(app.data.peek(), { id: second, ms: MIN, label: 'Tea' }, NOW), 'New timer');
    app.selected.value = id;
    catalog.run('timer.delete');
    expect(app.selected.value).toBe(second);
    catalog.run('timer.delete');
    expect(app.data.value.timers).toEqual([]);
    expect(app.selected.value).toBeNull();
  });

  it('runs no single-key command behind a dialog', async () => {
    const { app, catalog } = await withTimer();
    app.open({ kind: 'settings' });
    expect(catalog.run('timer.toggle')).toBe(false);
    expect(catalog.run('view.commandMenu')).toBe(true);
  });

  it('keeps a half-filled form when ⌘K is pressed over it, and opens ⌘K only where its commands can run', async () => {
    const { app, catalog } = await withTimer();
    app.open({ kind: 'newAlarm' });
    expect(catalog.run('view.commandMenu')).toBe(false);
    expect(app.dialog.value).toEqual({ kind: 'newAlarm' });
    app.close();
    app.open({ kind: 'shortcuts' });
    expect(catalog.run('view.commandMenu')).toBe(true);
    expect(app.dialog.value?.kind).toBe('menu');
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

describe('notices', () => {
  it('are spoken again when the same words come twice in a row', async () => {
    const { app } = await makeApp();
    app.say('Deleted timer.');
    const first = app.announcement.value;
    app.say('Deleted timer.');
    expect(app.announcement.value).not.toBe(first);
    expect(app.announcement.value.trim()).toBe('Deleted timer.');
    app.say('Deleted timer.');
    expect(app.announcement.value).toBe(first);
  });

  it('keeps a failed-save notice under other notices until saving works', async () => {
    const { app, catalog, later } = await withTimer();
    app.saveStatusChanged('failed');
    const failed = app.notice.value;
    expect(failed?.action?.label).toBe('Try Again');
    catalog.run('timer.toggle');
    expect(app.notice.value?.action?.label, 'an edit leaves Try Again alone').toBe('Try Again');
    app.sayUndoable('Deleted “Pasta”.');
    expect(app.notice.value?.text).toBe('Deleted “Pasta”.');
    later.run();
    expect(app.notice.value).toBe(failed);
    app.say('Undid delete.');
    app.saveStatusChanged('saved');
    later.run();
    expect(app.notice.value).toBeNull();
  });
});

describe('changes made elsewhere', () => {
  it('looks every 15 s while shown, every minute while hidden, and never behind a dialog', async () => {
    const { app, store, clock } = await withTimer();
    await app.session.flush();
    const elsewhere = (label: string) => {
      const data = JSON.parse(store.text!) as { timers: { label: string }[] };
      data.timers[0]!.label = label;
      store.text = `${JSON.stringify(data, null, 2)}\n`;
    };
    elsewhere('Rice');
    expect(await app.refreshFromFile(false)).toBe(1);
    expect(app.data.value.timers[0]!.label).toBe('Rice');
    expect(app.notice.value?.text).toBe('Updated with changes made elsewhere.');
    app.notice.value?.action?.run();
    expect(app.data.value.timers[0]!.label).toBe('Pasta');
    expect(app.notice.value?.text).toBe('Undid changes made elsewhere.');
    await app.session.flush();
    expect((JSON.parse(store.text!) as { timers: { label: string }[] }).timers[0]!.label).toBe('Pasta');
    elsewhere('Soup');
    clock.at += 15_000;
    expect(await app.refreshFromFile(true), 'hidden, too soon').toBeNull();
    clock.at += 45_000;
    expect(await app.refreshFromFile(true)).toBe(1);
    elsewhere('Stew');
    app.open({ kind: 'settings' });
    expect(await app.refreshFromFile(false)).toBeNull();
  });

  it('tries a failed save again on the next look', async () => {
    const { app, catalog, store, session } = await withTimer();
    await session.flush();
    store.failSaves = 3;
    catalog.run('timer.toggle');
    await session.flush();
    expect(session.status.value).toBe('failed');
    await app.refreshFromFile(false);
    await session.flush();
    expect(session.status.value).toBe('saved');
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
    expect(app.done(clock.at).map((t) => t.id)).toEqual([id]);
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
    expect(catalog.run('timer.dismiss')).toBe(false);
    app.edit(deleteTimer(app.data.peek(), app.selected.value!), 'Dismiss');
    expect(app.ringing.value).toEqual([]);
  });

  it('dismisses a done timer by removing it, with Undo, and only cancels one that is still going', async () => {
    const { app, catalog, clock, id } = await withTimer(1);
    expect(catalog.isEnabled(catalog.get('timer.dismiss')!)).toBe(false);
    clock.at = NOW + MIN;
    app.tick();
    catalog.run('ringing.stop');
    expect(catalog.isEnabled(catalog.get('timer.cancel')!)).toBe(false);
    expect(catalog.run('timer.dismiss')).toBe(true);
    expect(app.data.value.timers).toEqual([]);
    expect(app.notice.value?.text).toBe('Dismissed “Pasta”.');
    app.notice.value!.action!.run();
    expect(app.data.value.timers.map((t) => t.id)).toEqual([id]);
  });

  it('gives a done timer another minute, and it rings again when that is up', async () => {
    const { app, catalog, clock } = await withTimer(1);
    clock.at = NOW + MIN;
    app.tick();
    catalog.run('ringing.stop');
    expect(catalog.run('timer.addMinute')).toBe(true);
    expect(app.done(clock.at)).toEqual([]);
    clock.at += MIN;
    app.tick();
    expect(app.ringing.value).toHaveLength(1);
  });

  it('gives a sticky Missed notice for one that finished over 10 minutes ago', async () => {
    const { app, clock } = await withTimer(1);
    clock.at = NOW + 20 * MIN;
    app.tick();
    expect(app.ringing.value).toEqual([]);
    expect(app.notice.value).toMatchObject({ text: 'Missed: Pasta finished.', sticky: true });
  });

  it('names every missed timer in one notice, and stays quiet about ones over a day old', async () => {
    const { app, clock } = await withTimer(1);
    app.edit(addTimer(app.data.peek(), { id: app.newId('t'), ms: 2 * MIN, label: 'Tea' }, NOW), 'New timer');
    app.edit(addTimer(app.data.peek(), { id: app.newId('t'), ms: 3 * MIN, label: '' }, NOW), 'New timer');
    clock.at = NOW + 20 * MIN;
    app.tick();
    expect(app.notice.value).toMatchObject({
      text: 'Missed: Pasta, Tea and 3 min timer finished.',
      sticky: true,
    });
    clock.at += 15 * MIN;
    app.edit(
      addTimer(app.data.peek(), { id: app.newId('t'), ms: MIN, label: 'Eggs' }, clock.at),
      'New timer',
    );
    clock.at += 20 * MIN;
    app.tick();
    expect(app.notice.value?.text).toBe('Missed: Pasta, Tea, 3 min timer and Eggs finished.');

    const old = await withTimer(1, 'Old');
    old.clock.at = NOW + 2 * 24 * 60 * MIN;
    old.app.tick();
    expect(old.app.notice.value).toBeNull();
    expect(old.app.ringing.value).toEqual([]);
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

describe('where the file is', () => {
  it('names a folder by its last part, and says the rest as it is (PRD §3.7)', () => {
    expect(placeLabel('native', '/Users/me/Documents/Alarmony')).toBe('Folder: Alarmony');
    expect(placeLabel('native', '/Users/me/Dropbox/Clocks/')).toBe('Folder: Clocks');
    expect(placeLabel('native', 'C:\\Users\\me\\Alarmony')).toBe('Folder: Alarmony');
    expect(placeLabel('native', '/')).toBe('Folder: /');
    expect(placeLabel('browser', 'Stored in this browser')).toBe('Stored in this browser');
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

describe('timer names', () => {
  it('names a preset without a label the way the cards do, in ⌘K', async () => {
    const { app } = await makeApp();
    app.edit(addPreset(app.data.peek(), { id: 'p1', ms: 25 * MIN, label: '' }), 'Add');
    app.edit(addPreset(app.data.peek(), { id: 'p2', ms: 3 * MIN, label: 'Tea' }), 'Add');
    expect(dynamicEntries(app).map((e) => e.title)).toEqual(['Start 25 min timer', 'Start Tea (3 minutes)']);
  });
});
