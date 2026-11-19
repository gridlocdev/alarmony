// What a person does with Alarmony, in a real browser, one describe per feature in docs/features.md.
// The page's clock starts at NOW; `page.clock.runFor` moves it on, so a timer finishes without a wait.
import type { Page } from '@playwright/test';
import {
  expect,
  newTimer,
  openApp,
  readClock,
  runCommand,
  test,
  watchErrors,
  writeClock,
} from './fixtures.ts';

const card = (page: Page, name: RegExp) =>
  page.getByRole('list', { name: 'Timers' }).getByRole('listitem', { name });
const tab = (page: Page, name: string) => page.getByRole('tab', { name });

test.describe('Stopwatch', () => {
  test('starts, laps and stops from the keyboard', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await page.keyboard.press('ControlOrMeta+Digit3');
    await expect(tab(page, 'Stopwatch')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Space');
    await page.clock.runFor(3000);
    await page.keyboard.press('KeyL');
    await page.clock.runFor(2000);
    await page.keyboard.press('Space');
    await expect(page.getByText('Stopwatch stopped at 00:05')).toBeAttached();
    const laps = page.getByRole('list', { name: 'Laps' }).getByRole('listitem');
    await expect(laps).toHaveCount(2);
    await expect(laps.last()).toContainText('Lap 1');
    await page.keyboard.press('KeyR');
    await expect(page.getByText('Stopwatch stopped at 00:00')).toBeAttached();
    expect(errors).toEqual([]);
  });
});

test.describe('Timers', () => {
  test('a new timer counts down, pauses, and comes back after Delete and Undo', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await expect(page.getByText('No timers.')).toBeVisible();
    await newTimer(page, '3m', 'Pasta');
    await expect(card(page, /^Pasta, 3 minutes left$/)).toBeVisible();
    await page.clock.runFor(60_000);
    await expect(card(page, /^Pasta, 2 minutes left$/)).toBeVisible();
    await card(page, /^Pasta/).focus();
    await page.keyboard.press('Space');
    // The page's clock keeps going between steps, so a paused timer can read a second or two under 2 minutes.
    const paused = /^Pasta, (2 minutes|1 minute \d+ seconds) left, paused$/;
    await expect(card(page, paused)).toBeVisible();
    await page.keyboard.press('Delete');
    await expect(card(page, /^Pasta/)).toHaveCount(0);
    await expect(page.locator('.al-notice')).toHaveText('Deleted “Pasta”.Undo');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(card(page, paused)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a preset saved from New Timer starts from its chip', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('KeyN');
    const dialog = page.getByRole('dialog', { name: 'New Timer' });
    await expect(dialog.getByRole('textbox', { name: 'Length' })).toBeFocused();
    await page.keyboard.type('25:00');
    await dialog.getByRole('textbox', { name: 'Label' }).fill('Focus');
    await dialog.getByRole('button', { name: 'Save as Preset' }).click();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await page
      .getByRole('list', { name: 'Presets' })
      .getByRole('button', { name: /^Focus/ })
      .click();
    await expect(card(page, /^Focus, 25 minutes left$/)).toBeVisible();
  });
});

test.describe('Ringing', () => {
  test('a finished timer rings until Stop, and its card says Done', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await newTimer(page, '1m', 'Tea');
    await page.clock.runFor(61_000);
    const sheet = page.getByRole('alertdialog', { name: 'Tea · Timer done' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Stop' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(sheet).toBeHidden();
    await expect(card(page, /^Tea, done$/)).toBeVisible();
    await page.clock.runFor(60_000);
    await expect(sheet, 'it rings once').toBeHidden();
    expect(errors).toEqual([]);
  });

  test('the ringing sheet comes in front of an open dialog, which is still there after Stop', async ({
    page,
  }) => {
    await openApp(page);
    await newTimer(page, '1m', 'Tea');
    await page.keyboard.press('KeyN');
    const dialog = page.getByRole('dialog', { name: 'New Timer' });
    await expect(dialog.getByRole('textbox', { name: 'Length' })).toBeFocused();
    await page.keyboard.type('25');
    await page.clock.runFor(61_000);
    const sheet = page.getByRole('alertdialog', { name: 'Tea · Timer done' });
    await sheet.getByRole('button', { name: 'Stop' }).click({ timeout: 2000 });
    await expect(sheet).toBeHidden();
    await expect(dialog.getByRole('textbox', { name: 'Length' })).toHaveValue('25');
  });
});

test.describe('Keeping your data', () => {
  test('timers are in clock.json, survive a reload and pick up changes made elsewhere', async ({ page }) => {
    await openApp(page);
    await newTimer(page, '10m', 'Laundry');
    await expect(page.locator('.al-save')).toHaveClass(/al-save-saved/);
    const data = await readClock(page);
    expect(data?.timers).toHaveLength(1);
    await page.reload();
    await expect(card(page, /^Laundry, 10 minutes left$/)).toBeVisible();
    const timers = (data?.timers ?? []) as { label: string }[];
    await writeClock(page, { ...data, timers: timers.map((t) => ({ ...t, label: 'Dishes' })) });
    await expect(card(page, /^Dishes, /)).toBeVisible();
  });

  test('unsaved changes from last time come back, and only Discard throws them away', async ({ page }) => {
    await openApp(page);
    await newTimer(page, '10m', 'Laundry');
    await expect(page.locator('.al-save')).toHaveClass(/al-save-saved/);
    const data = await readClock(page);
    const timers = (data?.timers ?? []) as { label: string }[];
    const unsaved = { ...data, timers: timers.map((t) => ({ ...t, label: 'Ironing' })) };
    await page.evaluate((text) => localStorage.setItem('alarmony.unsaved', text), JSON.stringify(unsaved));
    await page.reload();
    const ask = page.getByRole('dialog', { name: 'Restore unsaved changes?' });
    await expect(ask.getByRole('button', { name: 'Restore' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Restore' }).click();
    await expect(card(page, /^Ironing, /)).toBeVisible();
  });
});

test.describe('Commands and shortcuts', () => {
  test('⌘K runs a command by name and ⌘/ lists the shortcuts', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await expect(tab(page, 'Timers')).toHaveAttribute('aria-selected', 'true');
    await runCommand(page, 'Stopwatch');
    await expect(tab(page, 'Stopwatch')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ControlOrMeta+Slash');
    const shortcuts = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
    await expect(shortcuts.getByText('Start or Stop Stopwatch')).toBeVisible();
    await expect(shortcuts.getByRole('button', { name: 'Done' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(shortcuts).toBeHidden();
    expect(errors).toEqual([]);
  });
});

test.describe('Look', () => {
  test('the theme setting sticks after a reload', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('ControlOrMeta+Comma');
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('combobox', { name: 'Theme' }).selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.keyboard.press('Escape');
    await openApp(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
