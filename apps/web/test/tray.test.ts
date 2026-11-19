// The desktop menu bar icon's state, as the page works it out (PRD §15).
import { describe, expect, it } from 'vitest';
import { addAlarm, addTimer, toggleAlarm } from '@alarmony/core';
import { NOW, makeApp } from './helpers.ts';

describe('the menu bar icon', () => {
  it('is empty and not armed when nothing would ring', async () => {
    const { app } = await makeApp();
    expect(app.tray.value).toEqual({
      title: '',
      ringing: false,
      canSnooze: false,
      next: null,
      timers: [],
      armed: false,
    });
  });

  it('counts down the soonest timer and lists every running one', async () => {
    const { app, clock } = await makeApp();
    app.edit(addTimer(app.data.peek(), { id: 't1', label: 'Bread', ms: 600_000 }, NOW), 'New timer');
    app.edit(addTimer(app.data.peek(), { id: 't2', label: '', ms: 60_000 }, NOW), 'New timer');
    clock.at = NOW + 1000;
    app.tick();
    expect(app.tray.value.title).toBe('0:59');
    expect(app.tray.value.timers).toEqual(['Bread, 9:59 left', 'Timer, 0:59 left']);
    expect(app.tray.value.armed).toBe(true);
    app.setSettings({ menuBarCountdown: false });
    expect(app.tray.value.title).toBe('');
  });

  it('names the next alarm, and offers Stop and Snooze while it rings', async () => {
    const { app, clock } = await makeApp();
    app.setSettings({ timeFormat: '12' });
    const fields = { time: '12:30', days: [], label: 'Lunch', sound: 'bells', snooze: true };
    app.edit(addAlarm(app.data.peek(), 'a1', fields, NOW, app.zone), 'New alarm');
    expect(app.tray.value.next).toBe('Next: Lunch, 12:30 PM');
    expect(app.tray.value.armed).toBe(true);
    clock.at = NOW + 30 * 60_000;
    app.tick();
    expect(app.tray.value).toMatchObject({ ringing: true, canSnooze: true });
    app.stopAll();
    // A one-time alarm that has rung is off.
    expect(app.tray.value).toMatchObject({ ringing: false, next: null, armed: false });
    app.edit(toggleAlarm(app.data.peek(), 'a1', clock.at, app.zone)!, 'Turn on');
    expect(app.tray.value).toMatchObject({ next: 'Next: Lunch, 12:30 PM', armed: true });
  });
});
