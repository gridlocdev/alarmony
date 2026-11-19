import { describe, expect, it } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { EMPTY_TRAY, parsePrefs, parseTrayState, reloadAfterCrash, trayMenu } from '../src/background.ts';
import type { TrayState } from '../src/bridge.ts';

function menu(state: TrayState) {
  const ran: string[] = [];
  const items = trayMenu(state, {
    command: (id) => ran.push(id),
    show: () => ran.push('show'),
    quit: () => ran.push('quit'),
  });
  const labels = items.map((i) => (i.type === 'separator' ? '—' : i.label));
  const click = (label: string) => {
    const item = items.find((i) => i.label === label) as MenuItemConstructorOptions;
    (item.click as () => void)();
  };
  return { items, labels, click, ran };
}

describe('the menu bar menu', () => {
  it('offers Show, Pause All Timers, Settings and Quit when nothing is on', () => {
    const m = menu(EMPTY_TRAY);
    expect(m.labels).toEqual(['Show Alarmony', 'Pause All Timers', 'Settings…', '—', 'Quit Alarmony']);
    expect(m.items.find((i) => i.label === 'Pause All Timers')?.enabled).toBe(false);
    m.click('Settings…');
    m.click('Quit Alarmony');
    expect(m.ran).toEqual(['show', 'app.settings', 'quit']);
  });

  it('puts Stop and Snooze first while ringing, then the next alarm and running timers', () => {
    const m = menu({
      title: '9:41',
      ringing: true,
      canSnooze: true,
      next: 'Next: Wake up, 7:00 AM',
      timers: ['Bread, 9:41 left'],
      armed: true,
    });
    expect(m.labels).toEqual([
      'Stop',
      'Snooze',
      '—',
      'Next: Wake up, 7:00 AM',
      'Bread, 9:41 left',
      '—',
      'Show Alarmony',
      'Pause All Timers',
      'Settings…',
      '—',
      'Quit Alarmony',
    ]);
    m.click('Stop');
    m.click('Snooze');
    m.click('Pause All Timers');
    expect(m.ran).toEqual(['ringing.stop', 'ringing.snooze', 'timer.pauseAll']);
  });

  it('leaves Snooze out when what rings can’t snooze', () => {
    expect(menu({ ...EMPTY_TRAY, ringing: true }).labels.slice(0, 2)).toEqual(['Stop', '—']);
  });
});

describe('what crosses from the page', () => {
  it('keeps a well-formed tray state and refuses anything else', () => {
    const state = { ...EMPTY_TRAY, title: '1:00', timers: ['Tea, 1:00 left', 3], armed: true };
    expect(parseTrayState(state)).toEqual({
      ...EMPTY_TRAY,
      title: '1:00',
      timers: ['Tea, 1:00 left'],
      armed: true,
    });
    expect(parseTrayState({ title: 5, timers: [] })).toBeNull();
    expect(parseTrayState('nope')).toBeNull();
    expect(parseTrayState({ ...EMPTY_TRAY, title: 'x'.repeat(500) })?.title).toHaveLength(120);
  });

  it('remembers the questions you turned off, and asks by default', () => {
    expect(parsePrefs(null)).toEqual({ closeNote: true, askBeforeQuit: true });
    expect(parsePrefs({ closeNote: false, askBeforeQuit: 'no' })).toEqual({
      closeNote: false,
      askBeforeQuit: true,
    });
  });
});

describe('after the page crashes', () => {
  it('reloads it, but not more than three times a minute', () => {
    const crashes: number[] = [];
    expect([0, 1000, 2000, 3000].map((t) => reloadAfterCrash(crashes, t))).toEqual([true, true, true, false]);
    expect(reloadAfterCrash(crashes, 70_000)).toBe(true);
  });
});
