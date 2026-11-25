/**
 * "Press a shortcut" in the Keyboard Shortcuts window (PRD §14): while it's on, a key press shows what it does
 * instead of doing it. Escape always leaves and is never taken, so the window closes as usual, and the listener
 * comes off when the mode ends for any reason: Escape, the Stop button, the window closing, or a handler that
 * throws. No key press can stay swallowed.
 */
import { isComposingKey, type ShortcutEvent } from './shortcut.ts';

const MODIFIERS = new Set(['Shift', 'Meta', 'Control', 'Alt', 'AltGraph', 'CapsLock', 'Fn', 'OS']);

export interface ProbeHandlers {
  /** A key press, already kept from the app. */
  readonly onKey: (e: ShortcutEvent) => void;
  /** A menu bar shortcut on the desktop, which reaches the app as a command, not a key. */
  readonly onMenuCommand: (id: string) => void;
  /** The mode ended. */
  readonly onLeave: () => void;
}

let active: ((id: string) => void) | null = null;

/** Called with each menu bar command: true when the probe took it, and the command must not run. */
export function probeMenuCommand(id: string): boolean {
  if (!active) return false;
  active(id);
  return true;
}

/** Starts the mode on `target` (the window). Returns the function that ends it; calling it twice is fine. */
export function startKeyProbe(target: EventTarget, handlers: ProbeHandlers): () => void {
  let stopped = false;
  /** Runs a handler; if it throws, the mode ends before the error goes on. */
  const guard = (run: () => void) => {
    let ok = false;
    try {
      run();
      ok = true;
    } finally {
      if (!ok) stop();
    }
  };
  const listener = (event: Event) => {
    const e = event as Event & ShortcutEvent;
    if (e.key === 'Escape') return stop();
    if (MODIFIERS.has(e.key) || isComposingKey(e)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    guard(() => handlers.onKey(e));
  };
  const menu = (id: string) => guard(() => handlers.onMenuCommand(id));
  function stop(): void {
    if (stopped) return;
    stopped = true;
    target.removeEventListener('keydown', listener, true);
    if (active === menu) active = null;
    handlers.onLeave();
  }
  target.addEventListener('keydown', listener, true);
  active = menu;
  return stop;
}
