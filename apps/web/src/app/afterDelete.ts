/** After a clock, an alarm or a timer is deleted, the one beside it is selected and focused (PRD §16). */
import { sortAlarms } from '@alarmony/core';
import { after } from '@alarmony/ui';
import type { AppController } from './controller.ts';

export type ListKind = 'clocks' | 'alarms' | 'timers';

/** The ids in the order the tab shows them. */
function shown(app: AppController, kind: ListKind): string[] {
  const data = app.data.peek();
  const items = kind === 'alarms' ? sortAlarms(data.alarms) : data[kind];
  return items.map((x) => x.id);
}

/** The item after `id`, else the one before, else null. */
export function besideOf(ids: readonly string[], id: string): string | null {
  const i = ids.indexOf(id);
  return i < 0 ? null : (ids[i + 1] ?? ids[i - 1] ?? null);
}

/** Runs `remove`; when it deleted `id`, selects the item beside it and moves focus there once it has drawn. */
export function deleteAndSelectBeside(
  app: AppController,
  kind: ListKind,
  id: string,
  remove: () => boolean,
): void {
  const next = besideOf(shown(app, kind), id);
  if (!remove()) return;
  app.selected.value = next;
  if (next && typeof document !== 'undefined')
    after(0, () => document.querySelector<HTMLElement>(`[data-id="${CSS.escape(next)}"]`)?.focus());
}
