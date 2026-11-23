// Import and Export clock.json in the browser (PRD §3.7).
import { describe, expect, it } from 'vitest';
import { addAlarm, addClock, applyOps, deleteAlarm, emptyData, serialize } from '@alarmony/core';
import { SnapshotStore, clockFileIn, readOnlyFolderMessage, type ClockStore } from '@alarmony/ui';
import { exportText, importText, openFolderCopy } from '../src/app/transfer.ts';
import { NOW, makeApp } from './helpers.ts';

describe('import', () => {
  it('replaces the clock as one change Undo takes back', async () => {
    const { app } = await makeApp();
    const before = app.data.peek();
    const file = serialize(applyOps(before, addClock(before, 'c9', 'Asia/Tokyo') ?? []));
    expect(importText(app, file)).toBe(true);
    expect(app.data.value.clocks.map((c) => c.zone)).toContain('Asia/Tokyo');
    expect(app.notice.value).toMatchObject({ text: 'Imported clock.json.', action: { label: 'Undo' } });
    app.undo();
    expect(app.data.value).toEqual(before);
  });

  it('says so when the file is the same, and refuses one it can’t read', async () => {
    const { app } = await makeApp();
    expect(importText(app, serialize(app.data.peek()))).toBe(false);
    expect(app.notice.value?.text).toBe('That file is the same as the clock here.');
    expect(importText(app, '{')).toBe(false);
    expect(app.notice.value?.tone).toBe('error');
  });
});

describe('export', () => {
  it('saves the clock as it is now', async () => {
    const { app } = await makeApp();
    expect(await exportText(app)).toBe(serialize(app.data.peek()));
  });
});

/** A file the folder input hands over: its path starts with the picked folder's name. */
function picked(path: string, text: string): File {
  const file = new File([text], path.split('/').pop() ?? path);
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}

describe('a folder opened read-only (Firefox and Safari)', () => {
  const clockText = () => {
    const data = emptyData('Asia/Tokyo');
    const wake = { time: '07:00', days: [1, 2, 3, 4, 5], label: 'Wake', sound: 'bells', snooze: true };
    return serialize(applyOps(data, addAlarm(data, 'a1', wake, NOW, 'Asia/Tokyo')));
  };

  it('finds clock.json at the top of the folder only', () => {
    const top = picked('Alarmony/clock.json', '{}');
    const found = clockFileIn([
      picked('Alarmony/old/clock.json', '{}'),
      top,
      picked('Alarmony/.DS_Store', ''),
    ]);
    expect(found).toEqual({ name: 'Alarmony', file: top });
    expect(clockFileIn([picked('Music/song.mp3', '')])).toEqual({ name: 'Music', file: null });
  });

  it('shows the folder’s clock, turns off every command that writes and says why', async () => {
    const store = new SnapshotStore({ name: 'Alarmony', text: clockText() });
    const { app, catalog, session } = await makeApp(null, { store });
    const why = readOnlyFolderMessage('Alarmony');
    expect(session.readOnly.value).toBe(true);
    expect(app.notice.value).toMatchObject({ text: why, sticky: true });
    expect(app.data.value.alarms.map((a) => a.label)).toEqual(['Wake']);

    app.showTab('alarms');
    app.selected.value = 'a1';
    const writes = catalog.all.filter((c) => c.writes === true);
    expect(writes.length).toBeGreaterThan(20);
    for (const c of writes) {
      expect(catalog.isEnabled(c), c.id).toBe(false);
      expect(catalog.whyDisabled(c), c.id).toBe(why);
    }
    // What only reads still runs: export, the tabs, the command menu, settings.
    for (const id of ['file.export', 'file.useBrowser', 'view.world', 'view.commandMenu', 'app.settings'])
      expect(catalog.isEnabled(catalog.get(id)!), id).toBe(true);
    expect(catalog.whyDisabled(catalog.get('file.export')!)).toBeNull();

    expect(catalog.run('alarm.toggle')).toBe(false);
    expect(app.edit(deleteAlarm(app.data.peek(), 'a1'), 'Delete')).toBe(false);
    expect(app.notice.value?.text).toBe(why);
    expect(await session.refresh()).toBeNull();
    expect(session.readOnly.value).toBe(true);
    expect(await exportText(app)).toBe(clockText());
    const anyStore: ClockStore = store;
    await expect(anyStore.save('{}', null)).rejects.toThrow(why);
  });

  it('opens the picked folder’s clock.json, and refuses a folder without one', async () => {
    const { app } = await makeApp();
    let reloads = 0;
    const reload = () => void reloads++;
    await openFolderCopy(app, reload, async () => [picked('Photos/a.jpg', '')]);
    expect(reloads).toBe(0);
    expect(app.notice.value).toMatchObject({ tone: 'error' });
    expect(app.notice.value?.text).toContain('“Photos” has no clock.json');

    await openFolderCopy(app, reload, async () => null);
    expect(reloads).toBe(0);
    expect(app.notice.value).toBeNull();

    await openFolderCopy(app, reload, async () => [picked('Alarmony/clock.json', '{ broken')]);
    expect(app.notice.value?.text).toBe('clock.json in “Alarmony” couldn’t be read.');
    expect(reloads).toBe(0);
  });
});
