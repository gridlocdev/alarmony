// The World Clock tab's commands: add, rename, move, delete with Undo, and the cards-or-list view (PRD §6).
import { describe, expect, it } from 'vitest';
import { addClock } from '@alarmony/core';
import { makeApp } from './helpers.ts';

async function withClocks(...zones: string[]) {
  const made = await makeApp();
  zones.forEach((zone, i) => made.app.edit(addClock(made.app.data.peek(), `c_${i}`, zone), 'Add clock'));
  made.app.showTab('world');
  return made;
}

const zones = (app: Awaited<ReturnType<typeof makeApp>>['app']) => app.data.value.clocks.map((c) => c.zone);

describe('world clocks', () => {
  it('opens on the World Clock tab, where N adds a clock and the + button says so', async () => {
    const { app, catalog } = await makeApp();
    expect(app.tab.value).toBe('world');
    catalog.run('item.new');
    expect(app.dialog.value).toEqual({ kind: 'addClock' });
  });

  it('renames, moves and deletes the selected clock, and Undo brings it back', async () => {
    const { app, catalog } = await withClocks('Asia/Tokyo', 'Europe/Paris', 'America/New_York');
    app.selected.value = 'c_1';
    catalog.run('clock.rename');
    expect(app.dialog.value).toEqual({ kind: 'renameClock', id: 'c_1' });
    app.close();

    expect(catalog.get('clock.moveUp')?.enabled?.()).toBe(true);
    catalog.run('clock.moveUp');
    expect(zones(app)).toEqual(['Europe/Paris', 'Asia/Tokyo', 'America/New_York']);
    expect(catalog.get('clock.moveUp')?.enabled?.()).toBe(false);
    catalog.run('clock.moveDown');
    catalog.run('clock.moveDown');
    expect(zones(app)).toEqual(['Asia/Tokyo', 'America/New_York', 'Europe/Paris']);

    catalog.run('clock.delete');
    expect(zones(app)).toEqual(['Asia/Tokyo', 'America/New_York']);
    expect(app.notice.value?.text).toBe('Deleted Paris.');
    app.undo();
    expect(zones(app)).toEqual(['Asia/Tokyo', 'America/New_York', 'Europe/Paris']);
  });

  it('keeps clock keys to the World Clock tab', async () => {
    const { app, catalog } = await withClocks('Asia/Tokyo');
    app.selected.value = 'c_0';
    app.showTab('alarms');
    expect(catalog.get('clock.delete')?.enabled?.()).toBe(false);
  });

  it('⌘L switches between cards and a list, and shows the tab', async () => {
    const { app, catalog } = await makeApp();
    app.showTab('timers');
    catalog.run('view.worldList');
    expect(app.tab.value).toBe('world');
    expect(app.settings.value.worldView).toBe('list');
    catalog.run('view.worldList');
    expect(app.settings.value.worldView).toBe('cards');
  });

  it('closes the rename dialog when its clock goes', async () => {
    const { app } = await withClocks('Asia/Tokyo');
    app.open({ kind: 'renameClock', id: 'c_0' });
    app.undo();
    expect(app.dialog.value).toBeNull();
  });
});
