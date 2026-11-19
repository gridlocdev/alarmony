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

/** Starts the built app headless on a throwaway profile, with clock.json in it. */
async function launch(clock: object = CLOCK) {
  // realpath: macOS's temp folder is behind a symlink, and the app reports the real path.
  const userData = realpathSync(mkdtempSync(path.join(tmpdir(), 'alarmony-e2e-')));
  const folder = path.join(userData, 'clock');
  mkdirSync(folder);
  writeFileSync(path.join(folder, 'clock.json'), `${JSON.stringify(clock, null, 2)}\n`);
  const app = await electron.launch({
    cwd: DESKTOP,
    // The main script by name (the built one package.json points at), so nothing else is read as an argument.
    args: ['out/main.js'],
    env: { ...process.env, ALARMONY_HEADLESS: '1', ALARMONY_USER_DATA: userData, ALARMONY_FOLDER: folder },
  });
  const close = async () => {
    const electronProcess = app.process();
    await app.close();
    rmSync(userData, { recursive: true, force: true });
    // No Electron process outlives the test: one left running could show itself later.
    await expect.poll(() => electronProcess.exitCode ?? electronProcess.signalCode).not.toBeNull();
  };
  return { app, userData, folder, close };
}

test.describe('Keeping your data', () => {
  test('the desktop app opens clock.json in its folder and saves there', async () => {
    const { app, userData, folder, close } = await launch();
    try {
      expect(await app.evaluate(({ app }) => app.getPath('userData')), 'the throwaway data folder').toBe(
        userData,
      );
      const window = await app.firstWindow();
      const errors = watchErrors(window);
      await window.getByRole('tab', { name: 'Timers' }).click();
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
      await close();
    }
  });
});

test.describe('Desktop in the background', () => {
  test('closing the window hides it and the page keeps running', async () => {
    const { app, folder, close } = await launch();
    try {
      const window = await app.firstWindow();
      const errors = watchErrors(window);
      await window.getByRole('tab', { name: 'Timers' }).click();
      await window
        .getByRole('listitem', { name: /^Bread, 10 minutes$/ })
        .getByRole('button', { name: 'Start' })
        .click();
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
      expect(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
        'still open',
      ).toBe(1);
      // The first close says Alarmony keeps running (skipped here, being headless); later closes don't.
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
      expect(
        await app.evaluate(
          () => (globalThis as { alarmonySkippedDialogs?: string[] }).alarmonySkippedDialogs,
        ),
      ).toEqual(['Alarmony keeps running in the menu bar so alarms ring.']);
      // The page still ticks: its title counts the timer down.
      const first = await window.title();
      await expect.poll(() => window.title(), { timeout: 3000 }).not.toBe(first);
      expect(first).toMatch(/^\d+:\d\d · Alarmony$/);
      // Waking from sleep checks at once and breaks nothing.
      await app.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'));
      await expect
        .poll(() => JSON.parse(readFileSync(path.join(folder, 'clock.json'), 'utf8')).timers[0].state)
        .toBe('running');
      // The desktop Settings has the two menu bar settings; the browser's doesn't.
      await window.keyboard.press('ControlOrMeta+Comma');
      await expect(window.getByRole('checkbox', { name: 'Open at login' })).not.toBeChecked();
      await expect(window.getByRole('checkbox', { name: 'Show countdown in the menu bar' })).toBeChecked();
      expect(errors).toEqual([]);
    } finally {
      await close();
    }
  });

  test('a page that crashes comes back by itself, so its timers still ring', async () => {
    const { app, close } = await launch();
    try {
      const window = await app.firstWindow();
      await window.getByRole('tab', { name: 'Timers' }).waitFor();
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer(),
      );
      // Playwright's handle on the page died with it, so the new page is asked through Electron.
      const drawn = () =>
        app.evaluate(async ({ BrowserWindow }) => {
          const page = BrowserWindow.getAllWindows()[0]?.webContents;
          if (!page || page.isCrashed()) return false;
          return page.executeJavaScript(`!!document.querySelector('[role="tablist"]')`).catch(() => false);
        });
      await expect.poll(drawn, { timeout: 5000 }).toBe(true);
    } finally {
      await close();
    }
  });
});
