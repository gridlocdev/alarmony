/**
 * The arrow keys on a tab move focus between its items, the clocks, alarms, presets, timers or stopwatch buttons,
 * and wrap at the ends (PRD §14). Each item carries `data-nav`. From the page or the tab row, an arrow goes to the
 * selected item, else the first (↓ →) or the last (↑ ←).
 */
import type { AppController } from './controller.ts';

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const;
type Arrow = (typeof ARROWS)[number];

function isArrow(key: string): key is Arrow {
  return (ARROWS as readonly string[]).includes(key);
}

/** The items' rows, top to bottom, as lists of indexes; items whose tops are within half a height share a row. */
function rowsOf(boxes: readonly Box[]): number[][] {
  const rows: number[][] = [];
  const order = boxes
    .map((_, i) => i)
    .sort((a, b) => boxes[a]!.top - boxes[b]!.top || boxes[a]!.left - boxes[b]!.left);
  for (const i of order) {
    const row = rows.at(-1);
    const first = row && boxes[row[0]!]!;
    if (first && Math.abs(boxes[i]!.top - first.top) < Math.max(1, first.height / 2)) row.push(i);
    else rows.push([i]);
  }
  return rows;
}

const centre = (b: Box) => b.left + b.width / 2;

/**
 * Where an arrow moves from item `at`: ← → step through the items in order; ↑ ↓ go to the nearest item in the row
 * above or below. Both wrap. When every item is in one row, ↑ ↓ step like ← →.
 */
export function arrowTarget(key: Arrow, at: number, boxes: readonly Box[]): number {
  const n = boxes.length;
  const rows = rowsOf(boxes);
  const across = key === 'ArrowLeft' || key === 'ArrowRight' || rows.length === 1;
  const back = key === 'ArrowLeft' || key === 'ArrowUp';
  if (across) return (at + (back ? n - 1 : 1)) % n;
  const r = rows.findIndex((row) => row.includes(at));
  const row = rows[(r + (back ? rows.length - 1 : 1)) % rows.length]!;
  const x = centre(boxes[at]!);
  return row.reduce((best, i) =>
    Math.abs(centre(boxes[i]!) - x) < Math.abs(centre(boxes[best]!) - x) ? i : best,
  );
}

/** Moves focus for an arrow key on a tab. Returns whether it did, so the key does nothing else. */
export function arrowNavigate(app: AppController, e: KeyboardEvent): boolean {
  if (!isArrow(e.key) || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return false;
  if (app.dialog.peek() || app.ringing.peek().length > 0 || app.itemMenu.open.peek()) return false;
  const panel = document.getElementById('al-panel');
  const active = document.activeElement;
  if (!panel) return false;
  const onPage = !active || active === document.body;
  const fromTabs = e.key === 'ArrowDown' && !!active?.closest('[role="tablist"]');
  if (!onPage && !fromTabs && !panel.contains(active)) return false;
  if (active?.closest('input, textarea, select, [contenteditable="true"]')) return false;
  const items = [...panel.querySelectorAll<HTMLElement>('[data-nav]:not(:disabled)')];
  if (items.length === 0) return false;
  const at = items.findIndex((el) => el.contains(active));
  let to: number;
  if (at >= 0)
    to = arrowTarget(
      e.key,
      at,
      items.map((el) => el.getBoundingClientRect()),
    );
  else {
    const selected = items.findIndex(
      (el) => el.dataset.id !== undefined && el.dataset.id === app.selected.peek(),
    );
    to = selected >= 0 ? selected : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? items.length - 1 : 0;
  }
  items[to]!.focus();
  items[to]!.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  return true;
}
