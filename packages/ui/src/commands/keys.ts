/** The page's one key listener and how it reads focus. Every shortcut reaches the catalog from here (PRD §14). */
import type { KeyFocus } from './command.ts';

/** Calls `handler` for every key pressed in the page. Returns a function that stops listening. */
export function listenKeys(target: Document, handler: (e: KeyboardEvent) => void): () => void {
  target.addEventListener('keydown', handler);
  return () => target.removeEventListener('keydown', handler);
}

/** Where keyboard focus is, for `CommandCatalog.forEvent`: a text field, another control, or the page. */
export function keyFocus(el: Element | null): KeyFocus {
  if (!el) return 'list';
  if (el.closest('input, textarea, select, [contenteditable="true"]')) return 'text';
  if (el.closest('button, a[href], [role="tab"], [role="menuitem"]')) return 'control';
  return 'list';
}
