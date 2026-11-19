import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';

/** Where ↓, ↑, Home and End move in a menu of `count` items, wrapping at the ends; undefined for other keys. */
export function menuMove(key: string, index: number, count: number): number | undefined {
  if (count === 0) return undefined;
  if (key === 'ArrowDown') return (index + 1) % count;
  if (key === 'ArrowUp') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return undefined;
}

/**
 * A menu at a point (a right-click menu): kept on screen, its first item focused, ↑ ↓ Home End to move, Enter or
 * Space to pick, Escape or Tab to close. A click outside it or the window losing focus closes it too.
 * `onClose(true)` means focus should go back where it was.
 */
export function PopupMenu(props: {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly onClose: (refocus: boolean) => void;
  readonly children: ComponentChildren;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(props.onClose);
  close.current = props.onClose;

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close.current(false);
    };
    const lost = () => close.current(false);
    addEventListener('pointerdown', away, true);
    addEventListener('blur', lost);
    addEventListener('resize', lost);
    return () => {
      removeEventListener('pointerdown', away, true);
      removeEventListener('blur', lost);
      removeEventListener('resize', lost);
    };
  }, []);

  // Flip it up or left when it would run off the window, then focus its first item.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { x, y } = props;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    el.style.left = `${x + w > innerWidth - 4 ? Math.max(4, x - w) : x}px`;
    el.style.top = `${y + h > innerHeight - 4 ? Math.max(4, y - h) : y}px`;
    el.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [props.x, props.y]);

  return (
    <div
      ref={ref}
      class="al-context-menu"
      role="menu"
      aria-label={props.label}
      onContextMenu={(e) => e.preventDefault()}
      // Every key stops here, so nothing under the menu acts on it.
      onKeyDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape' || e.key === 'Tab') return props.onClose(true);
        if (e.key === 'Enter' || e.key === ' ') return (e.target as HTMLElement).click();
        const items = [
          ...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []),
        ];
        const next = menuMove(e.key, items.indexOf(e.target as HTMLElement), items.length);
        if (next !== undefined) items[next]?.focus();
      }}
    >
      {props.children}
    </div>
  );
}
