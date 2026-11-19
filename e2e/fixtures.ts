// Shared scenario setup. Each test gets a fresh browser, so its storage, and clock.json in it, start empty.
// Every page runs on a clock that starts at NOW and keeps going; `page.clock.runFor(ms)` moves it on, which
// finishes a timer without waiting for it.
import { expect, test as base, type Page } from '@playwright/test';
import { NOW } from './server.ts';

export { expect };
export { NOW } from './server.ts';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.install({ time: NOW });
    await use(page);
  },
});

/** Open the app the way a user does and wait until it has drawn: a key pressed sooner goes nowhere. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('tablist', { name: 'Clock' }).waitFor();
}

/** clock.json as the page's storage has it now, or null before the first save. */
export async function readClock(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    try {
      const file = await (await root.getFileHandle('clock.json')).getFile();
      return JSON.parse(await file.text()) as Record<string, unknown>;
    } catch {
      return null;
    }
  });
}

/** Writes clock.json into the page's storage, as another window would, then reloads so the app reads it. */
export async function writeClock(page: Page, data: unknown): Promise<void> {
  await page.evaluate(
    async (text) => {
      const root = await navigator.storage.getDirectory();
      const writable = await (await root.getFileHandle('clock.json', { create: true })).createWritable();
      await writable.write(text);
      await writable.close();
    },
    `${JSON.stringify(data, null, 2)}\n`,
  );
  await page.reload();
  await page.getByRole('tablist', { name: 'Clock' }).waitFor();
}

/**
 * Collect what went wrong on the page: uncaught errors, console errors and failed requests. The browser's own
 * "Failed to load resource" line names no URL, so the request is reported instead, with its URL.
 */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
      errors.push(message.text());
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  return errors;
}

/** The ⌘K menu: a dialog named "Command menu" holding a combobox, with an option for each entry. */
export const commandMenu = (page: Page) => page.getByRole('dialog', { name: 'Command menu' });

/**
 * Run a command from ⌘K by its name. Type the way a person does: wait until focus is in the field, then use the
 * keyboard. `fill()` right after a field appears can land before the component has set itself up, and be lost.
 */
export async function runCommand(page: Page, name: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+KeyK');
  const menu = commandMenu(page);
  await expect(menu.getByRole('combobox')).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
}

/** Starts a timer through New Timer, the way a person does. */
export async function newTimer(page: Page, length: string, label = ''): Promise<void> {
  await page.keyboard.press('KeyN');
  const dialog = page.getByRole('dialog', { name: 'New Timer' });
  await expect(dialog.getByRole('textbox', { name: 'Length' })).toBeFocused();
  await page.keyboard.type(length);
  if (label) {
    await dialog.getByRole('textbox', { name: 'Label' }).fill(label);
  }
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
}
