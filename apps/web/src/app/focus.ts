/**
 * Keyboard focus on a tab's items follows the app's state, not the other way round (PRD §14). The selected clock,
 * alarm or timer is the one tab stop of its list (roving tabindex); its focus ring comes from `itemFocus` and
 * `selected`, never from the browser; and after an arrow key, a command, a dialog closing, an undo or a delete,
 * focus is moved to whatever `selected` names. The panel carries `data-roving`, so a closing dialog hands focus to
 * the selected item too. Focus the user puts on an item (a click, Tab, a screen reader) selects it.
 */
import { effect } from '@preact/signals';
import { after } from '@alarmony/ui';
import type { AppController } from './controller.ts';

/** A clock, alarm or timer in the open tab: it carries both `data-id` and `data-nav`. */
function itemOf(el: EventTarget | null): HTMLElement | null {
  return el instanceof HTMLElement && el.dataset.id !== undefined && el.hasAttribute('data-nav') ? el : null;
}

function itemEl(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#al-panel [data-id="${CSS.escape(id)}"][data-nav]`);
}

/** How a list item draws itself: whether it is the list's tab stop, and whether it shows the focus ring. */
export function itemFocusProps(
  app: AppController,
  id: string,
  ids: readonly string[],
): { readonly tabIndex: 0 | -1; readonly focused: boolean } {
  const selected = app.selected.value;
  const stop = selected !== null && ids.includes(selected) ? selected : ids[0];
  return { tabIndex: id === stop ? 0 : -1, focused: app.itemFocus.value && selected === id };
}

/** Focus the user put on a clock, alarm or timer, or on one of its buttons, selects it. */
export function panelFocusIn(app: AppController, target: EventTarget | null): void {
  const item = target instanceof HTMLElement ? itemOf(target.closest('[data-id][data-nav]')) : null;
  app.itemFocus.value = item !== null && item === target;
  if (item) app.selected.value = item.dataset.id!;
}

/** Focus left an item for another control; leaving the window or losing the element keeps the item focused. */
export function panelFocusOut(app: AppController, to: EventTarget | null): void {
  if (to instanceof HTMLElement && !itemOf(to)) app.itemFocus.value = false;
}

/** Moves DOM focus to the selected item when the keyboard was on an item, or focus fell to the page. */
export function syncFocus(app: AppController): void {
  if (app.dialog.peek() || app.itemMenu.open.peek()) return;
  const active = document.activeElement;
  const lost = !active || active === document.body;
  if (!lost && !app.itemFocus.peek()) return;
  const selected = app.selected.peek();
  const el = selected !== null ? itemEl(selected) : null;
  if (el && el !== active) el.focus();
  else if (!el && !lost) app.itemFocus.value = false;
}

/** Keeps DOM focus with the selection from now on. Returns the function that stops it. */
export function followSelection(app: AppController): () => void {
  return effect(() => {
    void app.selected.value;
    void app.tab.value;
    void app.dialog.value;
    void app.data.value;
    // After the change has drawn, so the item it names exists.
    after(0, () => syncFocus(app));
  });
}
