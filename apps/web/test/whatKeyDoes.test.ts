import { describe, expect, it } from 'vitest';
import type { ShortcutEvent } from '@alarmony/ui';
import { pressedLabel, shortcutGroups, whatKeyDoes } from '../src/app/shortcuts.ts';
import { makeApp } from './helpers.ts';

type KeyEvent = Event & ShortcutEvent;

function keydown(key: string, more: Partial<ShortcutEvent> = {}): KeyEvent {
  return Object.assign(new Event('keydown', { cancelable: true }), {
    key,
    code: '',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...more,
  });
}

describe('what a key does', () => {
  it('names a key press the way the window writes keys', () => {
    expect(pressedLabel(keydown('/', { metaKey: true }), true)).toBe('⌘/');
    expect(pressedLabel(keydown('K', { metaKey: true, shiftKey: true }), true)).toBe('⇧⌘K');
    expect(pressedLabel(keydown('k', { ctrlKey: true, shiftKey: true }), false)).toBe('Ctrl+Shift+K');
    expect(pressedLabel(keydown(' '), false)).toBe('Space');
    expect(pressedLabel(keydown('ArrowUp'), true)).toBe('↑');
  });

  it('writes every key in the Keyboard Shortcuts window in one notation', async () => {
    const { catalog } = await makeApp();
    const keys = (mac: boolean) =>
      shortcutGroups(catalog, mac).flatMap((g) => g.lines.flatMap((l) => l.keys.flat()));
    for (const k of keys(true)) expect(k).not.toMatch(/Enter|Up|Down|Left|Right|Shift|Tab/);
    expect(keys(true)).toEqual(expect.arrayContaining(['↩', '⌘↩', '↑', '⇧⇥']));
    expect(keys(false)).toEqual(expect.arrayContaining(['Enter', 'Ctrl+Enter', 'Up', 'Shift+Tab']));
  });

  it('finds the command for a key, enabled or not, and says when there is none', async () => {
    const { catalog } = await makeApp();
    expect(whatKeyDoes(catalog, keydown('/', { metaKey: true }), true)).toEqual({
      label: '⌘/',
      titles: ['Keyboard Shortcuts'],
    });
    expect(whatKeyDoes(catalog, keydown('/', { ctrlKey: true }), false).titles).toEqual([
      'Keyboard Shortcuts',
    ]);
    expect(whatKeyDoes(catalog, keydown(' '), true).titles).toContain('Turn Alarm On or Off');
    expect(whatKeyDoes(catalog, keydown('j', { metaKey: true, altKey: true }), true).titles).toEqual([]);
  });

  it('runs nothing while it looks', async () => {
    const { app, catalog } = await makeApp();
    const before = app.data.peek();
    whatKeyDoes(catalog, keydown('n', { metaKey: true }), true);
    expect(app.data.peek()).toBe(before);
  });
});
