import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { isComposingKey, isSubmitKey, isUndoKey } from '../commands/shortcut.ts';
import { after } from '../schedule.ts';
import { trapTab } from './focusTrap.ts';

/**
 * The one modal dialog: labelled by its title, Escape and a click on the backdrop close it, ⌘Enter (Ctrl+Enter)
 * submits it from any field, Tab stays inside it, focus moves in when it opens and goes back where it was when it closes.
 */
export function Dialog(props: {
  readonly title: string;
  readonly onClose: () => void;
  readonly class?: string;
  readonly children: ComponentChildren;
  readonly actions?: ComponentChildren;
  readonly onSubmit?: () => void;
  /** Something that needs an answer now (the ringing sheet): an alert dialog to screen readers (PRD §16). */
  readonly alert?: boolean;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const titleId = useId();
  // Taken while rendering: the body's own effects run first and may already have moved focus inside.
  const [previous] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => {
    const root = ref.current;
    // A finger: no keyboard popping up over the dialog until a field is tapped, so the box itself takes focus.
    const finger = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const first =
      root?.querySelector<HTMLElement>('[data-autofocus]') ??
      (finger
        ? root?.closest<HTMLElement>('.al-dialog')
        : root?.querySelector<HTMLElement>('input, select, textarea, button'));
    if (!root?.contains(document.activeElement)) first?.focus();
    return () => {
      // In an area with a roving tab stop (data-roving), focus goes back to that area's current stop, which the
      // dialog may have changed (a new item selected), once the area has drawn; not to where the dialog opened from.
      const area = previous?.closest('[data-roving]');
      if (area)
        after(0, () => {
          const active = document.activeElement;
          if (!active || active === document.body)
            area.querySelector<HTMLElement>('[data-nav][tabindex="0"]')?.focus();
        });
      else if (previous?.isConnected && previous !== document.body) previous.focus();
    };
  }, []);
  return (
    <div
      class="al-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      {/* Keys are handled on the whole box (focusable, so a click on empty space keeps focus in it). */}
      <div
        class={`al-dialog ${props.class ?? ''}`}
        role={props.alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (isComposingKey(e)) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            props.onClose();
          } else if (props.onSubmit && isSubmitKey(e)) {
            e.preventDefault();
            e.stopPropagation();
            ref.current?.requestSubmit();
          } else if (isUndoKey(e) && !keepsOwnUndo(e.target)) {
            // The browser's own undo would take back typing in a field behind the dialog, and move the keyboard
            // there. A text field in the dialog keeps its undo.
            e.preventDefault();
            e.stopPropagation();
          } else if (ref.current) {
            trapTab(ref.current, e);
          }
        }}
      >
        <form
          ref={ref}
          autocomplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            props.onSubmit?.();
          }}
        >
          <h2 id={titleId}>{props.title}</h2>
          <div class="al-dialog-body">{props.children}</div>
          {props.actions && <div class="al-dialog-actions">{props.actions}</div>}
        </form>
      </div>
    </div>
  );
}

/** Input types that hold typed text, so ⌘Z in them undoes typing. A radio or checkbox has none. */
const TEXT_INPUTS = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);

function keepsOwnUndo(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return TEXT_INPUTS.has(target.type);
  return target instanceof HTMLElement && target.isContentEditable;
}
