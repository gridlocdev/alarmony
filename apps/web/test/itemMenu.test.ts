// The right-click menus on clocks, alarms, timers, presets and laps, and the commands only they run.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addClock, addPreset, addTimer, lapStopwatch, toggleStopwatch } from '@alarmony/core';
import { menuMove } from '@alarmony/ui';
import { MENUS, type MenuKind } from '../src/app/itemMenu.ts';
import { NOW, makeApp } from './helpers.ts';

const MIN = 60_000;

function openOn(app: Awaited<ReturnType<typeof makeApp>>['app'], kind: MenuKind, id: string) {
  app.itemMenu.show({ kind, id, x: 10, y: 10, from: null });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('item menus', () => {
  it('hold only commands the catalog has', async () => {
    const { catalog } = await makeApp();
    const missing = Object.values(MENUS)
      .flat()
      .filter((id) => id !== '|' && !catalog.get(id));
    expect(missing).toEqual([]);
  });

  it('move with the arrows, wrapping at the ends', () => {
    expect(menuMove('ArrowDown', 2, 3)).toBe(0);
    expect(menuMove('ArrowUp', 0, 3)).toBe(2);
    expect(menuMove('ArrowUp', -1, 3)).toBe(1);
    expect(menuMove('End', 0, 3)).toBe(2);
    expect(menuMove('Home', 2, 3)).toBe(0);
    expect(menuMove('x', 0, 3)).toBeUndefined();
  });

  it('opens on the selected item with Shift+F10', async () => {
    const { app, catalog } = await makeApp();
    app.showTab('world');
    app.edit(addClock(app.data.peek(), 'c1', 'Asia/Tokyo'), 'Add');
    const press = { key: 'F10', code: 'F10', shiftKey: true, metaKey: false, ctrlKey: false, altKey: false };
    expect(catalog.forEvent(press, 'list')).toBeNull();
    app.selected.value = 'c1';
    expect(catalog.forEvent(press, 'list')).toMatchObject({ kind: 'run', command: { id: 'item.menu' } });
  });
});

describe('preset menu', () => {
  async function withPreset() {
    const made = await makeApp();
    made.app.edit(addPreset(made.app.data.peek(), { id: 'p1', ms: 3 * MIN, label: 'Tea' }), 'Add');
    openOn(made.app, 'preset', 'p1');
    made.app.itemMenu.close();
    return made;
  }

  it('starts a timer from the preset', async () => {
    const { app, catalog } = await withPreset();
    expect(catalog.run('preset.start')).toBe(true);
    expect(app.data.value.timers).toMatchObject([{ label: 'Tea', ms: 3 * MIN, state: 'running' }]);
  });

  it('opens Rename Preset, and deletes with an Undo', async () => {
    const { app, catalog } = await withPreset();
    catalog.run('preset.rename');
    expect(app.dialog.value).toEqual({ kind: 'renamePreset', id: 'p1' });
    app.close();
    catalog.run('preset.delete');
    expect(app.data.value.presets).toEqual([]);
    expect(app.notice.value).toMatchObject({ text: 'Deleted preset “Tea”.', action: { label: 'Undo' } });
  });

  it('closes Rename Preset when the preset goes', async () => {
    const { app, catalog } = await withPreset();
    catalog.run('preset.rename');
    app.edit(addTimer(app.data.peek(), { id: 't1', ms: MIN, label: '' }, NOW), 'New timer');
    expect(app.dialog.value).not.toBeNull();
    app.undo();
    app.undo();
    expect(app.dialog.value).toBeNull();
  });

  it('does nothing once its preset is gone', async () => {
    const { app, catalog } = await withPreset();
    app.undo();
    expect(catalog.run('preset.start')).toBe(false);
    expect(catalog.run('preset.delete')).toBe(false);
  });
});

describe('lap menu', () => {
  it('copies the lap time', async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { app, catalog } = await makeApp();
    app.edit(toggleStopwatch(app.data.peek(), NOW), 'Start');
    app.edit(lapStopwatch(app.data.peek(), NOW + 12_340), 'Lap');
    app.edit(lapStopwatch(app.data.peek(), NOW + 20_000), 'Lap');
    openOn(app, 'lap', '1');
    expect(catalog.run('lap.copy')).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('00:07.66');
    expect(app.notice.value?.text).toBe('Copied Lap 2, 00:07.66.');
  });

  it('is off for a lap that isn’t there', async () => {
    const { app, catalog } = await makeApp();
    openOn(app, 'lap', '0');
    expect(catalog.run('lap.copy')).toBe(false);
  });
});
