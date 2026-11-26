import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PROBE_IDLE_MS,
  probeMenuCommand,
  startKeyProbe,
  type ProbeHandlers,
  type ShortcutEvent,
} from '../src/index.ts';

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

/**
 * A window stand-in that runs capture listeners, then the app's own, the way a key reaches the page, and lets a
 * listener's error escape so a test can see it (a real EventTarget only reports it).
 */
class FakeWindow {
  readonly capture: EventListener[] = [];
  readonly app: KeyEvent[] = [];
  addEventListener(_type: string, l: EventListener, capture?: boolean) {
    if (capture) this.capture.push(l);
  }
  removeEventListener(_type: string, l: EventListener, capture?: boolean) {
    if (capture) this.capture.splice(this.capture.indexOf(l) >>> 0, 1);
  }
  dispatchEvent(e: KeyEvent): boolean {
    let stopped = false;
    const stop = e.stopImmediatePropagation.bind(e);
    e.stopImmediatePropagation = () => {
      stopped = true;
      stop();
    };
    for (const l of [...this.capture]) {
      l(e);
      if (stopped) return !e.defaultPrevented;
    }
    this.app.push(e);
    return !e.defaultPrevented;
  }
}

function probe(handlers: Partial<ProbeHandlers> = {}) {
  const win = new FakeWindow();
  const seen: string[] = [];
  let left = 0;
  const stop = startKeyProbe(win as unknown as EventTarget, {
    onKey: (e) => seen.push(e.key),
    onMenuCommand: (id) => seen.push(`menu ${id}`),
    onLeave: () => left++,
    ...handlers,
  });
  return { win, seen, stop, left: () => left };
}

describe('press a shortcut', () => {
  it('reports a key and keeps it from the app', () => {
    const { win, seen, stop } = probe();
    const e = keydown('n');
    win.dispatchEvent(e);
    expect(seen).toEqual(['n']);
    expect(e.defaultPrevented).toBe(true);
    expect(win.app).toEqual([]);
    stop();
  });

  it('lets modifier keys and IME composition through without reporting them', () => {
    const { win, seen, stop } = probe();
    win.dispatchEvent(keydown('Shift', { shiftKey: true }));
    win.dispatchEvent(Object.assign(keydown('a'), { isComposing: true }));
    expect(seen).toEqual([]);
    expect(win.app).toHaveLength(2);
    stop();
  });

  it('leaves on Escape and lets Escape reach the app', () => {
    const { win, seen, left } = probe();
    const esc = keydown('Escape');
    win.dispatchEvent(esc);
    expect(left()).toBe(1);
    expect(esc.defaultPrevented).toBe(false);
    expect(win.app).toEqual([esc]);
    expect(win.capture).toEqual([]);
    win.dispatchEvent(keydown('n'));
    expect(seen).toEqual([]);
    expect(win.app).toHaveLength(2);
  });

  it('removes its listener when stopped, and stopping twice leaves once', () => {
    const { win, stop, left } = probe();
    stop();
    stop();
    expect(left()).toBe(1);
    expect(win.capture).toEqual([]);
    expect(probeMenuCommand('help.shortcuts')).toBe(false);
  });

  it('ends the mode when its handler throws, so the next key reaches the app', () => {
    const { win, left } = probe({
      onKey: () => {
        throw new Error('boom');
      },
    });
    expect(() => win.dispatchEvent(keydown('n'))).toThrow('boom');
    expect(left()).toBe(1);
    expect(win.capture).toEqual([]);
    const next = keydown('n');
    win.dispatchEvent(next);
    expect(win.app).toEqual([next]);
    expect(next.defaultPrevented).toBe(false);
    expect(probeMenuCommand('item.new')).toBe(false);
  });

  it('takes menu bar commands while on, and ends the mode if that handler throws', () => {
    const { seen, stop } = probe();
    expect(probeMenuCommand('item.new')).toBe(true);
    expect(seen).toEqual(['menu item.new']);
    stop();
    expect(probeMenuCommand('item.new')).toBe(false);

    const bad = probe({
      onMenuCommand: () => {
        throw new Error('boom');
      },
    });
    expect(() => probeMenuCommand('item.new')).toThrow('boom');
    expect(bad.left()).toBe(1);
    expect(probeMenuCommand('item.new')).toBe(false);
  });

  describe('with no key pressed for a while', () => {
    afterEach(() => vi.useRealTimers());

    it('ends the mode by itself, and each key or menu shortcut starts the wait again', () => {
      vi.useFakeTimers();
      const { win, left } = probe();
      vi.advanceTimersByTime(PROBE_IDLE_MS - 1000);
      win.dispatchEvent(keydown('n'));
      vi.advanceTimersByTime(PROBE_IDLE_MS - 1000);
      probeMenuCommand('item.new');
      vi.advanceTimersByTime(PROBE_IDLE_MS - 1);
      expect(left()).toBe(0);
      vi.advanceTimersByTime(1);
      expect(left()).toBe(1);
      expect(win.capture).toEqual([]);
      const next = keydown('n');
      win.dispatchEvent(next);
      expect(win.app).toEqual([next]);
      expect(probeMenuCommand('item.new')).toBe(false);
    });

    it('leaves no wait behind once stopped', () => {
      vi.useFakeTimers();
      const { stop, left } = probe();
      stop();
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(PROBE_IDLE_MS);
      expect(left()).toBe(1);
    });
  });
});
