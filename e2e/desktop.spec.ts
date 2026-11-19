// Desktop smoke test: the built Electron app starts headless (no window, Dock icon or system dialog) on a throwaway
// folder, shows the timers in it and saves there. `just e2e-desktop` builds it first. The temp folder matters: the
// app must never open the owner's real clock.json.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';
import { expect, test, watchErrors } from './fixtures.ts';

const DESKTOP = fileURLToPath(new URL('../apps/desktop', import.meta.url));

const CLOCK = {
  format: 1,
  clocks: [],
  alarms: [],
  presets: [],
  timers: [{ id: 't-desk', label: 'Bread', ms: 600_000, state: 'idle', endsAt: null, leftMs: null }],
  stopwatch: { state: 'idle', startedAt: null, elapsedMs: 0, laps: [] },
};

test.describe('Keeping your data', () => {
  test('the desktop app opens clock.json in its folder and saves there', async () => {
    // realpath: macOS's temp folder is behind a symlink, and the app reports the real path.
    const userData = realpathSync(mkdtempSync(path.join(tmpdir(), 'alarmony-e2e-')));
    const folder = path.join(userData, 'clock');
    mkdirSync(folder);
    writeFileSync(path.join(folder, 'clock.json'), `${JSON.stringify(CLOCK, null, 2)}\n`);
    const app = await electron.launch({
      cwd: DESKTOP,
      // The main script by name (the built one package.json points at), so nothing else is read as an argument.
      args: ['out/main.js'],
      env: { ...process.env, ALARMONY_HEADLESS: '1', ALARMONY_USER_DATA: userData, ALARMONY_FOLDER: folder },
    });
    try {
      expect(await app.evaluate(({ app }) => app.getPath('userData')), 'the throwaway data folder').toBe(
        userData,
      );
      const window = await app.firstWindow();
      const errors = watchErrors(window);
      const timer = window.getByRole('listitem', { name: /^Bread, 10 minutes$/ });
      await expect(timer).toBeVisible();
      await timer.getByRole('button', { name: 'Start' }).click();
      await expect(window.getByRole('listitem', { name: /^Bread, .* left$/ })).toBeVisible();
      await expect
        .poll(() => JSON.parse(readFileSync(path.join(folder, 'clock.json'), 'utf8')).timers[0].state)
        .toBe('running');
      expect(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isVisible())),
        'no window shows on the screen',
      ).toBe(false);
      expect(errors).toEqual([]);
    } finally {
      const electronProcess = app.process();
      await app.close();
      rmSync(userData, { recursive: true, force: true });
      // No Electron process outlives the test: one left running could show itself later.
      await expect.poll(() => electronProcess.exitCode ?? electronProcess.signalCode).not.toBeNull();
    }
  });
});
