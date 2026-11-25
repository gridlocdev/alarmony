// What a person does with Alarmony, in a real browser, one describe per feature in docs/features.md.
// The page's clock starts at NOW; `page.clock.runFor` moves it on, so a timer finishes without a wait.
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import {
  commandMenu,
  expect,
  newTimer,
  openApp,
  readClock,
  runCommand,
  test,
  watchErrors,
  writeClock,
} from './fixtures.ts';

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  let text = '';
  for await (const chunk of stream) text += String(chunk);
  return text;
}

const card = (page: Page, name: RegExp) =>
  page.getByRole('list', { name: 'Timers' }).getByRole('listitem', { name });
const tab = (page: Page, name: string) => page.getByRole('tab', { name });

/** A folder with a clock.json in it, as Open Folder picks one in Firefox and Safari. */
const FOLDER = fileURLToPath(new URL('folder/Alarmony', import.meta.url));

const place = (page: Page, name: RegExp) =>
  page.getByRole('list', { name: 'World clocks' }).getByRole('listitem', { name });

test.describe('World Clock', () => {
  test('starts with this place, adds two more by search, renames, moves by key and by drag, and deletes with Undo', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await page.keyboard.press('ControlOrMeta+Digit4');
    await expect(tab(page, 'World Clock')).toHaveAttribute('aria-selected', 'true');
    // The browser runs in UTC at 9:00 AM.
    await expect(place(page, /^UTC, 9:00 AM, Today, same time$/)).toBeVisible();
    // The faded card at the end of the clocks adds one, as N does.
    await page.getByRole('button', { name: '+ Add Clock' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add Clock' });
    const search = dialog.getByRole('combobox', { name: 'City or time zone' });
    await expect(search).toBeFocused();
    await page.keyboard.type('tokyo');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ControlOrMeta+KeyA');
    await page.keyboard.type('sao paulo');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ControlOrMeta+KeyA');
    await page.keyboard.type('tokyo');
    await expect(dialog.getByRole('option', { name: /Tokyo.*Added/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(place(page, /^Tokyo, 6:00 PM, Today, \+9 hrs$/)).toBeVisible();
    await expect(place(page, /^Sao Paulo, 6:00 AM, Today, −3 hrs$/)).toBeVisible();

    await place(page, /^Tokyo/).focus();
    await page.keyboard.press('Enter');
    const rename = page.getByRole('dialog', { name: 'Rename Clock' });
    await expect(rename.getByRole('textbox', { name: 'Name' })).toBeFocused();
    await page.keyboard.type('Office');
    await page.keyboard.press('Enter');
    await expect(rename).toBeHidden();
    const office = place(page, /^Office, 6:00 PM/);
    await expect(office).toBeVisible();
    await expect(office).toContainText('Tokyo');

    await office.focus();
    await page.keyboard.press('Alt+ArrowUp');
    const names = page.getByRole('list', { name: 'World clocks' }).locator('.al-clock-name');
    await expect(names).toHaveText(['Office', 'UTC', 'Sao Paulo']);
    await page.keyboard.press('Delete');
    await expect(names).toHaveText(['UTC', 'Sao Paulo']);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(names).toHaveText(['Office', 'UTC', 'Sao Paulo']);

    // Dragging a clock onto the right half of another puts it after that one.
    const sao = place(page, /^Sao Paulo/);
    const box = (await place(page, /^Office/).boundingBox())!;
    await sao.dragTo(place(page, /^Office/), { targetPosition: { x: box.width - 10, y: box.height / 2 } });
    await expect(names).toHaveText(['Office', 'Sao Paulo', 'UTC']);
    await page.keyboard.press('ControlOrMeta+KeyZ');
    await expect(names).toHaveText(['Office', 'UTC', 'Sao Paulo']);

    await page.keyboard.press('ControlOrMeta+KeyL');
    await expect(page.locator('.al-clock-row')).toHaveCount(3);
    // In the list, the top half of a row is before it.
    const utcRow = place(page, /^UTC/);
    await place(page, /^Sao Paulo/).dragTo(utcRow, { targetPosition: { x: 20, y: 4 } });
    await expect(names).toHaveText(['Office', 'Sao Paulo', 'UTC']);
    await expect(page.locator('.al-face')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

const alarm = (page: Page, name: RegExp) =>
  page.getByRole('list', { name: 'Alarms' }).getByRole('listitem', { name });

/** Adds an alarm through New Alarm on the Alarms tab, the way a person does. NOW is 9:00 AM UTC. */
async function newAlarm(page: Page, time: string, label: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+Digit3');
  await page.keyboard.press('KeyN');
  const dialog = page.getByRole('dialog', { name: 'New Alarm' });
  const field = dialog.getByRole('textbox', { name: /^Time/ });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('');
  await page.keyboard.press('ControlOrMeta+KeyA');
  await page.keyboard.type(time);
  await dialog.getByRole('textbox', { name: 'Label' }).fill(label);
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
}

test.describe('Alarms', () => {
  test('a new alarm rings at its time, snoozes, rings again and turns itself off after Stop', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await page.keyboard.press('ControlOrMeta+Digit3');
    await expect(page.getByText('No alarms.')).toBeVisible();
    await page.locator('.al-empty').getByRole('button', { name: 'New Alarm' }).click();
    await expect(
      page.getByRole('dialog', { name: 'New Alarm' }).getByRole('textbox', { name: /^Time/ }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await newAlarm(page, '905', 'Stand up');
    // Once there are alarms, a faded row at the end of the list adds another.
    await expect(page.getByRole('button', { name: '+ New Alarm' })).toBeVisible();
    await expect(alarm(page, /^Stand up, 9:05 AM, Today, on$/)).toBeVisible();
    await expect(alarm(page, /^Stand up/)).toContainText('in 5 min');
    await page.clock.runFor(5 * 60_000);
    const sheet = page.getByRole('alertdialog', { name: 'Stand up · 9:05 AM' });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('KeyS');
    await expect(sheet).toBeHidden();
    await expect(page.locator('.al-notice')).toContainText('Snoozed “Stand up” until 9:14');
    await page.clock.runFor(9 * 60_000);
    const again = page.getByRole('alertdialog', { name: 'Stand up · 9:14 AM' });
    await expect(again).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(again).toBeHidden();
    await expect(alarm(page, /^Stand up, 9:05 AM, .*, off$/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Space turns the selected alarm off, Enter edits it, Delete removes it and Undo brings it back, all in clock.json', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await newAlarm(page, '7:30 pm', 'Dinner');
    const row = alarm(page, /^Dinner, 7:30 PM/);
    await row.focus();
    await page.keyboard.press('Space');
    await expect(alarm(page, /^Dinner, 7:30 PM, .*, off$/)).toBeVisible();
    await page.keyboard.press('Space');
    await expect(alarm(page, /^Dinner, 7:30 PM, Today, on$/)).toBeVisible();
    // Enter edits; Up on the hour moves it, and the change is saved without Save.
    await page.keyboard.press('Enter');
    const editor = page.getByRole('dialog', { name: 'Edit Alarm' });
    await expect(editor.getByRole('textbox', { name: /^Time/ })).toBeFocused();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowUp');
    await expect(editor.getByRole('textbox', { name: /^Time/ })).toHaveValue('8:30 PM');
    await page.keyboard.press('Escape');
    await expect(editor).toBeHidden();
    const moved = alarm(page, /^Dinner, 8:30 PM, Today, on$/);
    await expect(moved).toBeVisible();
    await moved.focus();
    await page.keyboard.press('Delete');
    await expect(moved).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(moved).toBeVisible();
    await expect
      .poll(
        async () => ((await readClock(page))?.alarms as { time: string; label: string }[] | undefined)?.[0],
      )
      .toMatchObject({ time: '20:30', label: 'Dinner' });
    expect(errors).toEqual([]);
  });
});

test.describe('Stopwatch', () => {
  test('starts, laps and stops from the keyboard', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await page.keyboard.press('ControlOrMeta+Digit2');
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
  test('a timer done long ago says so in days, inside a full ring', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await newTimer(page, '1m', 'Eggs');
    await page.clock.runFor(61_000);
    await page.keyboard.press('Escape');
    await page.clock.fastForward(3 * 24 * 60 * 60_000);
    const status = page.locator('.al-timer-status', { hasText: 'Done 3 days ago' });
    await expect(status).toBeVisible();
    // Nothing paints over the status, and its corners sit inside the ring's circle, clear of the stroke.
    const clear = await status.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const ring = el.closest('.al-timer')!.querySelector('.al-timer-ring')!.getBoundingClientRect();
      const ends = [r.left + 1, r.right - 1].map((x) => document.elementFromPoint(x, r.top + r.height / 2));
      const cx = ring.left + ring.width / 2;
      const cy = ring.top + ring.height / 2;
      // The track's inner edge: radius 47 less half the 5-wide stroke, in a 100-wide view box.
      const inner = ((47 - 2.5) / 100) * ring.width;
      const corners = [r.left, r.right].flatMap((x) =>
        [r.top, r.bottom].map((y) => Math.hypot(x - cx, y - cy)),
      );
      return ends.every((hit) => el.contains(hit)) && corners.every((d) => d < inner - 4);
    });
    expect(clear).toBe(true);
    await expect(page.locator('.al-timer-done .al-ring-left')).toHaveAttribute('stroke-dashoffset', '0');
    expect(errors).toEqual([]);
  });

  test('the arrow keys move between the timers and the New Timer card, and wrap', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await newTimer(page, '3m', 'Pasta');
    await newTimer(page, '5m', 'Tea');
    const focused = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el?.getAttribute('aria-label') ?? el?.textContent ?? '';
      });
    await card(page, /^Pasta/).focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(focused).toMatch(/^Tea, /);
    // After the timers come the New Timer card's buttons: the common lengths, then Custom….
    await page.keyboard.press('ArrowRight');
    await expect.poll(focused).toBe('1 min');
    await page.keyboard.press('Enter');
    await expect(card(page, /^1 min timer, 1 minute left$/)).toBeVisible();
    await card(page, /^Pasta/).focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(focused).toBe('+ Custom…');
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'New Timer' });
    await expect(dialog.getByRole('textbox', { name: 'Length' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    // ↓ from the tab row goes into the tab.
    await tab(page, 'Timers').focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(focused).toMatch(/^(Pasta|Tea|1 min timer), /);
    expect(errors).toEqual([]);
  });

  test('a new timer counts down, pauses, and comes back after Delete and Undo', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await page.keyboard.press('ControlOrMeta+Digit1');
    await expect(card(page, /^New timer$/)).toBeVisible();
    await expect(page.locator('.al-timer')).toHaveCount(0);
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

  test('+1 min adds a minute, and the ⋯ button opens the timer menu', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await newTimer(page, '3m', 'Pasta');
    await card(page, /^Pasta/)
      .getByRole('button', { name: '+1 min' })
      .click();
    await expect(card(page, /^Pasta, (4 minutes|3 minutes \d+ seconds) left$/)).toBeVisible();
    await card(page, /^Pasta/)
      .getByRole('button', { name: 'Pasta actions' })
      .click();
    const menu = page.getByRole('menu', { name: 'Timer actions' });
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Add 1 Minute' }).click();
    await expect(menu).toBeHidden();
    await expect(card(page, /^Pasta, (5 minutes|4 minutes \d+ seconds) left$/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Delete acts on the card that holds focus, even on one of its buttons', async ({ page }) => {
    await openApp(page);
    await newTimer(page, '3m', 'Pasta');
    await newTimer(page, '5m', 'Tea');
    await card(page, /^Tea/).focus();
    await card(page, /^Pasta/)
      .getByRole('button', { name: 'Pasta actions' })
      .focus();
    await page.keyboard.press('Delete');
    await expect(card(page, /^Pasta/)).toHaveCount(0);
    await expect(card(page, /^Tea/)).toHaveCount(1);
    // Focus moves to the card beside it, so the next Delete goes on from there.
    await expect(card(page, /^Tea/)).toBeFocused();
    await page.keyboard.press('Delete');
    await expect(card(page, /^Tea/)).toHaveCount(0);
  });

  test('a preset saved from New Timer starts from the New Timer card', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('ControlOrMeta+Digit1');
    await page.keyboard.press('KeyN');
    const dialog = page.getByRole('dialog', { name: 'New Timer' });
    await expect(dialog.getByRole('textbox', { name: 'Length' })).toBeFocused();
    await page.keyboard.type('25:00');
    await dialog.getByRole('textbox', { name: 'Label' }).fill('Focus');
    await dialog.getByRole('button', { name: 'Save as Preset' }).click();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await page
      .getByRole('list', { name: 'Start a timer' })
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

  test('a change made here while another window changed the file is merged with it', async ({ page }) => {
    await openApp(page);
    await newTimer(page, '10m', 'Laundry');
    await expect(page.locator('.al-save')).toHaveClass(/al-save-saved/);
    const data = await readClock(page);
    const timers = (data?.timers ?? []) as { label: string }[];
    await writeClock(
      page,
      { ...data, timers: timers.map((t) => ({ ...t, label: 'Dishes' })) },
      { reload: false },
    );
    await runCommand(page, 'Pause All Timers');
    await expect(page.locator('.al-notice')).toContainText('Merged with changes made elsewhere.');
    await expect(card(page, /^Dishes, .*paused/i)).toBeVisible();
    const saved = (await readClock(page))?.timers as { label: string; state: string }[];
    expect(saved.map((t) => [t.label, t.state])).toEqual([['Dishes', 'paused']]);
  });

  test('when both sides changed the same timer, Keep Mine and Use Theirs choose', async ({ page }) => {
    await openApp(page);
    await newTimer(page, '10m', 'Laundry');
    await expect(page.locator('.al-save')).toHaveClass(/al-save-saved/);
    const data = await readClock(page);
    await writeClock(page, { ...data, timers: [] }, { reload: false });
    await runCommand(page, 'Pause All Timers');
    const ask = page.getByRole('dialog', { name: 'Clock changed somewhere else' });
    await expect(ask.getByRole('listitem')).toHaveText(['Laundry']);
    await expect(ask.getByRole('button', { name: 'Keep Mine' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Keep Mine' }).click();
    await expect(ask).toBeHidden();
    await expect(page.locator('.al-save')).toHaveClass(/al-save-saved/);
    expect(((await readClock(page))?.timers as unknown[]).length).toBe(1);

    await writeClock(page, { ...(await readClock(page)), timers: [] }, { reload: false });
    await card(page, /^Laundry, /)
      .getByRole('button', { name: 'Resume' })
      .click();
    await ask.getByRole('button', { name: 'Use Theirs' }).click();
    await expect(ask).toBeHidden();
    await expect(card(page, /^Laundry, /)).toBeHidden();
    await expect(page.locator('.al-save')).toHaveClass(/al-save-saved/);
    expect((await readClock(page))?.timers).toEqual([]);
  });

  test('a file from a newer Alarmony is shown read-only and left as it is', async ({ page }) => {
    await openApp(page);
    await newTimer(page, '10m', 'Laundry');
    await expect(page.locator('.al-save')).toHaveClass(/al-save-saved/);
    const newer = { ...(await readClock(page)), format: 99 };
    await writeClock(page, newer);
    await expect(page.locator('.al-notice')).toContainText('made by a newer Alarmony');
    await expect(card(page, /^Laundry, /)).toBeVisible();
    await page.keyboard.press('ControlOrMeta+k');
    await commandMenu(page).getByRole('combobox').fill('Pause All Timers');
    const pause = commandMenu(page).getByRole('option', { name: /Pause All Timers/ });
    await expect(pause).toHaveAttribute('aria-disabled', 'true');
    await expect(pause).toHaveAttribute('title', /made by a newer Alarmony/);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(card(page, /^Laundry, .*paused/i)).toBeHidden();
    expect((await readClock(page))?.format).toBe(99);
    await expect(page.locator('.al-where')).toHaveText('Stored in this browser');
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

test.describe('Keeping your data', () => {
  test('Export downloads clock.json, and Import replaces the clock until Undo', async ({ page }) => {
    await openApp(page);
    await newTimer(page, '10m', 'Laundry');
    await expect(page.locator('.al-save')).toHaveClass(/al-save-saved/);
    const download = page.waitForEvent('download');
    await runCommand(page, 'Export clock.json');
    const file = await download;
    expect(file.suggestedFilename()).toBe('clock.json');
    const exported = JSON.parse(await readStream(await file.createReadStream())) as Record<string, unknown>;
    expect(exported).toEqual(await readClock(page));

    const timers = exported.timers as { label: string }[];
    const other = { ...exported, timers: timers.map((t) => ({ ...t, label: 'Dishes' })) };
    const chooser = page.waitForEvent('filechooser');
    await runCommand(page, 'Import clock.json');
    await (
      await chooser
    ).setFiles({
      name: 'clock.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(other)),
    });
    await expect(card(page, /^Dishes, /)).toBeVisible();
    await expect(page.locator('.al-notice')).toContainText('Imported clock.json.');
    await page.locator('.al-notice').getByRole('button', { name: 'Undo' }).click();
    await expect(card(page, /^Laundry, /)).toBeVisible();
  });

  test('Open Folder moves the clock into a picked folder, and back to the browser', async ({ page }) => {
    // The folder picker is the browser's own window; here it hands back a folder in the page's storage.
    await page.addInitScript(() => {
      Object.assign(window, {
        showDirectoryPicker: async () =>
          (await navigator.storage.getDirectory()).getDirectoryHandle('picked', { create: true }),
      });
    });
    await openApp(page);
    await newTimer(page, '10m', 'Laundry');
    await expect(page.locator('.al-save')).toHaveClass(/al-save-saved/);
    const loaded = page.waitForEvent('load');
    await runCommand(page, 'Open Folder');
    await loaded;
    await page.getByRole('tablist', { name: 'Clock' }).waitFor();
    await expect(page.locator('.al-where')).toHaveText('picked');
    await expect(card(page, /^Laundry, /)).toBeVisible();

    await newTimer(page, '5m', 'Tea');
    await expect(page.locator('.al-save')).toHaveClass(/al-save-saved/);
    const inFolder = await page.evaluate(async () => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('picked');
      const text = await (await (await dir.getFileHandle('clock.json')).getFile()).text();
      return (JSON.parse(text) as { timers: { label: string }[] }).timers.map((t) => t.label);
    });
    expect(inFolder.sort()).toEqual(['Laundry', 'Tea']);
    expect(((await readClock(page))?.timers as unknown[]).length).toBe(1);

    const back = page.waitForEvent('load');
    await runCommand(page, 'Use This Browser');
    await back;
    await page.getByRole('tablist', { name: 'Clock' }).waitFor();
    await expect(page.locator('.al-where')).toHaveText('Stored in this browser');
    await expect(card(page, /^Tea, /)).toBeVisible();
  });

  test('a browser whose own storage won’t open still starts, keeping the clock for this tab', async ({
    page,
  }) => {
    // Some browsers have the private file system but refuse it, such as a private window or some WebKit builds.
    await page.addInitScript(() => {
      Object.defineProperty(StorageManager.prototype, 'getDirectory', {
        value: () =>
          Promise.reject(
            new DOMException('The operation failed for an unknown transient reason', 'UnknownError'),
          ),
      });
    });
    await openApp(page);
    await expect(page.locator('.al-notice')).toContainText('nothing here is saved after the tab closes');
    await newTimer(page, '10m', 'Laundry');
    await expect(card(page, /^Laundry, /)).toBeVisible();
  });

  test('without the folder picker, Open Folder shows a folder read-only and Use This Browser goes back', async ({
    page,
  }) => {
    // Firefox and Safari have no showDirectoryPicker; they hand over a copy of the folder's files instead.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showDirectoryPicker', { value: undefined });
    });
    const errors = watchErrors(page);
    await openApp(page);
    await newTimer(page, '10m', 'Laundry');
    await expect(page.locator('.al-save')).toHaveClass(/al-save-saved/);

    const chooser = page.waitForEvent('filechooser');
    const loaded = page.waitForEvent('load');
    await runCommand(page, 'Open Folder');
    await (await chooser).setFiles(FOLDER);
    await loaded;
    await page.getByRole('tablist', { name: 'Clock' }).waitFor();
    await expect(page.locator('.al-where')).toHaveText('Alarmony (read-only)');
    await expect(page.locator('.al-notice')).toContainText('is read-only in this browser');
    await expect(card(page, /^Pasta, /)).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Timer' })).toBeDisabled();
    await expect(
      page.getByRole('list', { name: 'Start a timer' }).getByRole('button').first(),
    ).toBeDisabled();

    await page.keyboard.press('ControlOrMeta+k');
    await commandMenu(page).getByRole('combobox').fill('New Timer');
    const newTimerOption = commandMenu(page)
      .getByRole('option', { name: /New Timer/ })
      .first();
    await expect(newTimerOption).toHaveAttribute('aria-disabled', 'true');
    await expect(newTimerOption).toHaveAttribute('title', /read-only in this browser/);
    await page.keyboard.press('Escape');

    const download = page.waitForEvent('download');
    await runCommand(page, 'Export clock.json');
    const exported = JSON.parse(await readStream(await (await download).createReadStream())) as {
      timers: { label: string }[];
    };
    expect(exported.timers.map((t) => t.label)).toEqual(['Pasta']);

    await runCommand(page, 'World Clock');
    await expect(place(page, /^Office, /)).toBeVisible();

    const back = page.waitForEvent('load');
    await runCommand(page, 'Use This Browser');
    await back;
    await page.getByRole('tablist', { name: 'Clock' }).waitFor();
    await expect(page.locator('.al-where')).toHaveText('Stored in this browser');
    await runCommand(page, 'Timers');
    await expect(card(page, /^Laundry, /)).toBeVisible();
    expect(errors).toEqual([]);
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

  test('Press a Shortcut says what a key runs without running it, and Esc always gets out', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await runCommand(page, 'Stopwatch');
    await page.keyboard.press('ControlOrMeta+Slash');
    const shortcuts = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
    await shortcuts.getByRole('button', { name: 'Press a Shortcut…' }).click();
    const answer = shortcuts.getByRole('status');
    await expect(answer).toContainText('Press a key');
    await page.keyboard.press('Space');
    await expect(answer).toContainText('Start or Stop Stopwatch');
    await page.keyboard.press('ControlOrMeta+k');
    await expect(answer).toContainText('runs Command Menu');
    await expect(commandMenu(page)).toBeHidden();
    await page.keyboard.press('ControlOrMeta+Alt+j');
    await expect(answer).toContainText('runs no command.');
    await shortcuts.getByRole('button', { name: 'Stop' }).click();
    await expect(answer).toBeHidden();
    await expect(page.getByText(/^Stopwatch stopped/)).toBeAttached();
    await shortcuts.getByRole('button', { name: 'Press a Shortcut…' }).click();
    await page.keyboard.press('Escape');
    await expect(shortcuts).toBeHidden();
    await page.keyboard.press('ControlOrMeta+k');
    await expect(commandMenu(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('right-click menus act on their item, and Shift+F10 opens one from the keyboard', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await newTimer(page, '3m', 'Pasta');
    const menu = page.getByRole('menu', { name: 'Timer actions' });
    await card(page, /^Pasta/).click({ button: 'right' });
    await expect(menu.getByRole('menuitem', { name: 'Pause' })).toBeFocused();
    await menu.getByRole('menuitem', { name: 'Save as Preset' }).click();
    await expect(menu).toBeHidden();
    const chip = page.getByRole('list', { name: 'Start a timer' }).getByRole('listitem').first();
    await chip.click({ button: 'right' });
    await page
      .getByRole('menu', { name: 'Preset actions' })
      .getByRole('menuitem', { name: 'Rename…' })
      .click();
    const rename = page.getByRole('dialog', { name: 'Rename Preset' });
    await rename.getByRole('textbox', { name: 'Label' }).fill('Spaghetti');
    await rename.getByRole('button', { name: 'Rename' }).click();
    await expect(chip).toContainText('Spaghetti');
    await card(page, /^Pasta/).focus();
    await page.keyboard.press('Shift+F10');
    await expect(menu).toBeVisible();
    await page.keyboard.press('ArrowUp');
    await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(card(page, /^Pasta/)).toBeFocused();
    await page.keyboard.press('Shift+F10');
    await page.keyboard.press('Enter');
    await expect(card(page, /^Pasta, .* paused$/)).toBeVisible();
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
