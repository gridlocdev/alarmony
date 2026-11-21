/** The right-click menu on a clock, an alarm, a timer, a preset or a lap: which item, and where (PRD §14). */
import { signal } from '@preact/signals';

export type MenuKind = 'clock' | 'alarm' | 'timer' | 'preset' | 'lap';

export interface MenuTarget {
  readonly kind: MenuKind;
  /** The item's id; a lap's is its index in the lap list. */
  readonly id: string;
}

export interface OpenMenu extends MenuTarget {
  readonly x: number;
  readonly y: number;
  /** The element right-clicked, which gets focus back when the menu closes. */
  readonly from: HTMLElement | null;
}

/** Each item's menu, as command ids in order; `|` is a line between groups (PRD §14). */
export const MENUS: Record<MenuKind, readonly string[]> = {
  clock: ['clock.rename', 'clock.moveUp', 'clock.moveDown', '|', 'clock.delete'],
  alarm: ['alarm.edit', 'alarm.toggle', 'alarm.duplicate', '|', 'alarm.delete'],
  timer: [
    'timer.toggle',
    'timer.edit',
    'timer.addMinute',
    'timer.cancel',
    'timer.dismiss',
    'timer.savePreset',
    '|',
    'timer.delete',
  ],
  preset: ['preset.start', 'preset.rename', '|', 'preset.delete'],
  lap: ['lap.copy'],
};

/** Clocks, alarms and timers are selected while their menu is open, so the menu's commands act on them. */
export const SELECTED_KINDS: readonly MenuKind[] = ['clock', 'alarm', 'timer'];

export class ItemMenu {
  /** The open menu, or null. */
  readonly open = signal<OpenMenu | null>(null);
  /** The item the last menu was opened on. It stays after the menu closes, so the command it runs can read it. */
  readonly target = signal<MenuTarget | null>(null);

  show(menu: OpenMenu): void {
    this.target.value = { kind: menu.kind, id: menu.id };
    this.open.value = menu;
  }

  close(): void {
    this.open.value = null;
  }
}

/** The target's id when it is of this kind. */
export function targetOf(menu: ItemMenu, kind: MenuKind): string | null {
  const t = menu.target.peek();
  return t?.kind === kind ? t.id : null;
}
