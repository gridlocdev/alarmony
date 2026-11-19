// Alarms in the app: the editor's commands, ringing on this device's clock, snooze and missed alarms (PRD §7, §9).
import { describe, expect, it } from 'vitest';
import {
  addAlarm,
  applyOps,
  editAlarm,
  emptyData,
  serialize,
  toggleAlarm,
  type AlarmFields,
} from '@alarmony/core';
import { deviceMemory, rungLog } from '@alarmony/ui';
import { NOW, makeApp } from './helpers.ts';

/** NOW is a Tuesday at noon, local time. */
const at = (hour: number, minute = 0, dayOffset = 0) =>
  new Date(2026, 2, 10 + dayOffset, hour, minute).getTime();

const fields = (over: Partial<AlarmFields> = {}): AlarmFields => ({
  time: '12:30',
  days: [],
  label: 'Lunch',
  sound: 'bells',
  snooze: true,
  ...over,
});

async function withAlarm(over: Partial<AlarmFields> = {}, opts: Parameters<typeof makeApp>[1] = {}) {
  const made = await makeApp(null, opts);
  made.app.edit(addAlarm(made.app.data.peek(), 'a_1', fields(over), NOW, made.app.zone), 'New alarm');
  return made;
}

describe('alarms ringing', () => {
  it('rings alarms in a file from a newer Alarmony, which stays read-only (PRD §3.3)', async () => {
    const daily = fields({ days: [1, 2, 3, 4, 5, 6, 7] });
    const data = applyOps(emptyData(null), addAlarm(emptyData(null), 'a_1', daily, NOW, 'UTC'));
    const text = serialize(data).replace('"format": 1', '"format": 9');
    const { app, clock, catalog, store } = await makeApp(text);
    expect(app.notice.value).toMatchObject({ text: expect.stringMatching(/newer Alarmony/), sticky: true });
    clock.at = at(12, 30);
    app.tick();
    expect(app.ringing.value.map((r) => r.label)).toEqual(['Lunch']);
    catalog.run('ringing.stop');
    expect(app.edit(toggleAlarm(app.data.peek(), 'a_1', NOW, app.zone), 'Turn off')).toBe(false);
    expect(app.data.value.alarms).toHaveLength(1);
    expect(store.text).toBe(text);
  });

  it('rings at its time with its own sound, says so, and notifies', async () => {
    const { app, clock, sound, notified } = await withAlarm();
    clock.at = at(12, 29);
    app.tick();
    expect(app.ringing.value).toEqual([]);
    clock.at = at(12, 30);
    app.tick();
    expect(app.ringing.value.map((r) => r.label)).toEqual(['Lunch']);
    expect(sound.calls).toContain('ring bells');
    expect(notified).toEqual([expect.stringMatching(/^Lunch · 12:30/)]);
  });

  it('snoozes for the file’s snooze length, then rings again', async () => {
    const { app, clock, catalog } = await withAlarm();
    clock.at = at(12, 30);
    app.tick();
    catalog.run('ringing.snooze');
    expect(app.ringing.value).toEqual([]);
    expect(app.notice.value?.text).toMatch(/^Snoozed “Lunch” until 12:39/);
    clock.at = at(12, 38);
    app.tick();
    expect(app.ringing.value).toEqual([]);
    clock.at = at(12, 39);
    app.tick();
    expect(app.ringing.value.map((r) => r.label)).toEqual(['Lunch']);
  });

  it('doesn’t ring at once when an alarm is moved to a time just gone', async () => {
    const { app, clock } = await withAlarm({ days: [1, 2, 3, 4, 5, 6, 7] });
    clock.at = at(12, 10);
    app.tick();
    app.edit(editAlarm(app.data.peek(), 'a_1', { time: '12:05' }, clock.at, app.zone), 'Edit');
    app.tick();
    expect(app.ringing.value).toEqual([]);
  });

  it('stops ringing when the alarm is turned off', async () => {
    const { app, clock } = await withAlarm();
    clock.at = at(12, 30);
    app.tick();
    app.stopAll();
    app.showTab('alarms');
    app.selected.value = 'a_1';
    // Ring a fresh one: a daily copy.
    app.edit(editAlarm(app.data.peek(), 'a_1', { days: [1, 2, 3, 4, 5, 6, 7] }, clock.at, app.zone), 'Edit');
    clock.at = at(12, 30, 1);
    app.tick();
    expect(app.ringing.value).toHaveLength(1);
    // The ringing sheet holds the keys, so it is turned off from elsewhere: another window, or the menu bar.
    app.edit(toggleAlarm(app.data.peek(), 'a_1', clock.at, app.zone), 'Turn off');
    expect(app.ringing.value).toEqual([]);
    expect(app.data.value.alarms[0]!.enabled).toBe(false);
  });

  it('on start, rings what came due in the last 10 minutes and lists older ones as missed', async () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let data = emptyData();
    data = applyOps(
      data,
      addAlarm(data, 'a_1', fields({ time: '11:00', label: 'Stand up', days: [2] }), at(10), zone)!,
    );
    data = applyOps(
      data,
      addAlarm(data, 'a_2', fields({ time: '11:55', label: 'Tea', days: [2] }), at(10), zone)!,
    );
    const memory = deviceMemory(false);
    memory.setSeen(at(10));
    const { app } = await makeApp(serialize(data), { memory, rung: rungLog(NOW, false) });
    app.tick();
    expect(app.ringing.value.map((r) => r.label)).toEqual(['Tea']);
    expect(app.notice.value?.text).toMatch(/^Missed: Stand up at 11:00/);
  });
});

describe('alarm commands', () => {
  it('N opens New Alarm on the Alarms tab and New Timer elsewhere', async () => {
    const { app, catalog } = await makeApp();
    app.showTab('alarms');
    catalog.run('item.new');
    expect(app.dialog.value).toEqual({ kind: 'newAlarm' });
    app.close();
    app.showTab('timers');
    catalog.run('item.new');
    expect(app.dialog.value).toEqual({ kind: 'newTimer' });
  });

  it('duplicates and deletes the selected alarm, with Undo', async () => {
    const { app, catalog } = await withAlarm();
    app.showTab('alarms');
    app.selected.value = 'a_1';
    catalog.run('alarm.duplicate');
    expect(app.data.value.alarms).toHaveLength(2);
    catalog.run('alarm.delete');
    expect(app.data.value.alarms).toHaveLength(1);
    expect(app.notice.value?.text).toBe('Deleted “Lunch”.');
    catalog.run('edit.undo');
    expect(app.data.value.alarms).toHaveLength(2);
  });

  it('closes the editor of an alarm that went', async () => {
    const { app } = await withAlarm();
    app.open({ kind: 'editAlarm', id: 'a_1' });
    app.undo();
    expect(app.dialog.value).toBeNull();
  });
});
