// A headless run reports an error nobody caught and exits, instead of showing Electron's error dialog.
import { describe, expect, it } from 'vitest';
import { isHeadless, quitOnError } from '../src/headlessErrors.ts';

describe('headless errors', () => {
  it('go to stderr with their stack, and end the process with 1', () => {
    const lines: string[] = [];
    const codes: number[] = [];
    quitOnError(
      'uncaught exception',
      new Error('boom'),
      (t) => lines.push(t),
      (c) => codes.push(c),
    );
    expect(lines[0]).toMatch(/^Alarmony \(headless\): uncaught exception: Error: boom/);
    expect(codes).toEqual([1]);
  });

  it('apply only to a headless run', () => {
    expect(isHeadless({ ALARMONY_HEADLESS: '1' }, [])).toBe(true);
    expect(isHeadless({}, ['electron', 'out/main.js', '--headless'])).toBe(true);
    expect(isHeadless({}, ['electron', 'out/main.js'])).toBe(false);
  });
});
