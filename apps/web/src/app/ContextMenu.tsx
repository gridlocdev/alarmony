import { Icon, PopupMenu, type Command, type CommandCatalog } from '@alarmony/ui';
import { isDone } from '@alarmony/core';
import type { AppController } from './controller.ts';
import { MENUS, SELECTED_KINDS, type MenuKind } from './itemMenu.ts';

/** Opens an item's menu at the pointer, or under the item when a key opened it. */
export function openMenu(
  app: AppController,
  kind: MenuKind,
  id: string,
  el: HTMLElement,
  x = 0,
  y = 0,
): void {
  if (SELECTED_KINDS.includes(kind)) app.selected.value = id;
  if (x === 0 && y === 0) {
    const r = el.getBoundingClientRect();
    x = r.left + 12;
    y = r.top + Math.min(r.height, 32);
  }
  app.itemMenu.show({ kind, id, x, y, from: el });
}

/**
 * The ⋯ button on a card: the same menu as a right-click, so Delete, Rename and the rest can be found without
 * hovering or knowing to right-click, and on a touch screen (PRD §14).
 */
export function MoreButton({
  app,
  kind,
  id,
  name,
}: {
  readonly app: AppController;
  readonly kind: MenuKind;
  readonly id: string;
  readonly name: string;
}) {
  return (
    <button
      type="button"
      class="al-icon-button al-small al-more"
      aria-label={`${name} actions`}
      aria-haspopup="menu"
      title="Actions (Shift+F10)"
      onClick={(e) => {
        e.stopPropagation();
        openMenu(app, kind, id, e.currentTarget);
      }}
    >
      <Icon name="ellipsis" />
    </button>
  );
}

/** `onContextMenu` for an item that has a menu. */
export function onMenu(app: AppController, kind: MenuKind, id: string) {
  return (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu(app, kind, id, e.currentTarget as HTMLElement, e.clientX, e.clientY);
  };
}

/** Shift+F10 on the selected clock, alarm or timer opens its menu, as a right-click would. */
export function openSelectedMenu(app: AppController): void {
  const id = app.selected.peek();
  const kind = ({ world: 'clock', alarms: 'alarm', timers: 'timer' } as const)[app.tab.peek() as string];
  const el = id ? document.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`) : null;
  if (id && kind && el) openMenu(app, kind, id, el);
}

/** A menu item's words: the command's title without the item's name, which the menu is already on. */
function menuTitle(app: AppController, c: Command): string {
  if (c.id === 'alarm.toggle') {
    const a = app.selectedAlarm.value;
    return a && app.alarmOn(a) ? 'Turn Off' : 'Turn On';
  }
  if (c.id === 'timer.toggle') {
    const t = app.selectedTimer.value;
    if (!t || t.state === 'idle') return 'Start';
    return t.state === 'running' && !isDone(t, app.clock.value) ? 'Pause' : 'Resume';
  }
  // "Cancel" alone reads as "close this menu", so that one keeps its full title.
  if (c.id === 'timer.cancel') return c.title;
  return c.title.replace(/ (Clock|Alarm|Timer|Preset|Lap)\b/, '');
}

const KIND_LABEL: Record<MenuKind, string> = {
  clock: 'Clock',
  alarm: 'Alarm',
  timer: 'Timer',
  preset: 'Preset',
  lap: 'Lap',
};

/** The right-click menu on an item: the catalog's own commands, so they do what the keys and ⌘K do (PRD §14). */
export function ContextMenu({
  app,
  catalog,
}: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
}) {
  const menu = app.itemMenu.open.value;
  if (!menu) return null;
  const close = (refocus: boolean) => {
    app.itemMenu.close();
    if (refocus && menu.from?.isConnected) menu.from.focus();
  };
  return (
    <PopupMenu
      key={`${menu.kind}:${menu.id}:${menu.x}:${menu.y}`}
      label={`${KIND_LABEL[menu.kind]} actions`}
      x={menu.x}
      y={menu.y}
      onClose={close}
    >
      {MENUS[menu.kind].map((id, i) => {
        if (id === '|') return <div key={i} class="al-context-line" role="separator" />;
        const c = catalog.get(id);
        if (!c) return null;
        const keys = c.sequences.length ? catalog.keys(c).join('') : '';
        return (
          <button
            key={id}
            type="button"
            role="menuitem"
            class={`al-context-item${c.danger ? ' al-danger' : ''}`}
            disabled={!catalog.isEnabled(c)}
            title={catalog.whyDisabled(c) ?? undefined}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              close(true);
              catalog.run(id);
            }}
          >
            <span>{menuTitle(app, c)}</span>
            {keys && (
              <kbd class="al-context-key" aria-hidden="true">
                {keys}
              </kbd>
            )}
          </button>
        );
      })}
    </PopupMenu>
  );
}
