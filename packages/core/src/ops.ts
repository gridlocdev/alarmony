/**
 * Operations: every edit is a list of these (PRD §3.5, §4.1). Each one names one item and carries its
 * before and after, so undo is the inverse and a later replay can see what changed.
 */
import type { ClockData, FileSettings, Item, ListItems, ListName, Stopwatch } from './format.ts';

export type Op =
  | { readonly kind: 'insert'; readonly list: ListName; readonly index: number; readonly item: Item }
  | { readonly kind: 'remove'; readonly list: ListName; readonly index: number; readonly item: Item }
  | { readonly kind: 'update'; readonly list: ListName; readonly before: Item; readonly after: Item }
  | {
      readonly kind: 'move';
      readonly list: ListName;
      readonly id: string;
      readonly from: number;
      readonly to: number;
    }
  | { readonly kind: 'stopwatch'; readonly before: Stopwatch; readonly after: Stopwatch }
  | { readonly kind: 'settings'; readonly before: FileSettings; readonly after: FileSettings };

function withList<L extends ListName>(data: ClockData, list: L, items: readonly ListItems[L][]): ClockData {
  return { ...data, [list]: items };
}

function itemsOf(data: ClockData, list: ListName): readonly Item[] {
  return data[list];
}

/**
 * Fields that only make sense together: a change to one of them carries the rest (a timer's run state and its
 * end time, an alarm's time and whether it is on).
 */
const FIELD_GROUPS: Readonly<Record<ListName | 'settings', readonly (readonly string[])[]>> = {
  settings: [],
  clocks: [],
  alarms: [['time', 'days', 'enabled', 'once']],
  presets: [],
  timers: [['ms', 'state', 'endsAt', 'leftMs']],
};

/** The fields an update changes, with the fields grouped with them. */
export function changedFields(list: ListName | 'settings', before: object, after: object): Set<string> {
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const changed = new Set<string>();
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) if (!sameValue(b[k], a[k])) changed.add(k);
  for (const group of FIELD_GROUPS[list])
    if (group.some((k) => changed.has(k))) for (const k of group) changed.add(k);
  return changed;
}

/** `current` with the fields `before` → `after` changes, and nothing else: another copy's changes to the rest stay. */
function patch<T extends object>(list: ListName | 'settings', current: T, before: T, after: T): T {
  const out: Record<string, unknown> = { ...(current as Record<string, unknown>) };
  const a = after as Record<string, unknown>;
  for (const k of changedFields(list, before, after)) {
    if (k in a) out[k] = a[k];
    else delete out[k];
  }
  return out as T;
}

/**
 * Applies one operation. An update changes only the fields it changed, so replaying it onto a copy someone else
 * changed keeps their other fields, and undoing it takes back only this window's. An operation that no longer fits
 * (its item is gone) changes nothing.
 */
export function applyOp(data: ClockData, op: Op): ClockData {
  switch (op.kind) {
    case 'insert': {
      const items = [...itemsOf(data, op.list)];
      if (items.some((i) => i.id === op.item.id)) return data;
      items.splice(Math.min(Math.max(0, op.index), items.length), 0, op.item);
      return withList(data, op.list, items as ListItems[typeof op.list][]);
    }
    case 'remove': {
      const items = itemsOf(data, op.list).filter((i) => i.id !== op.item.id);
      return withList(data, op.list, items as ListItems[typeof op.list][]);
    }
    case 'update': {
      const items = itemsOf(data, op.list);
      if (!items.some((i) => i.id === op.after.id)) return data;
      return withList(
        data,
        op.list,
        items.map((i) =>
          i.id === op.after.id ? patch(op.list, i, op.before, op.after) : i,
        ) as ListItems[typeof op.list][],
      );
    }
    case 'move': {
      const items = [...itemsOf(data, op.list)];
      const from = items.findIndex((i) => i.id === op.id);
      if (from < 0) return data;
      const [item] = items.splice(from, 1);
      items.splice(Math.min(Math.max(0, op.to), items.length), 0, item as Item);
      return withList(data, op.list, items as ListItems[typeof op.list][]);
    }
    case 'stopwatch':
      return { ...data, stopwatch: op.after };
    case 'settings':
      return { ...data, settings: patch('settings', data.settings, op.before, op.after) };
  }
}

export function applyOps(data: ClockData, ops: readonly Op[]): ClockData {
  return ops.reduce(applyOp, data);
}

export function invertOp(op: Op): Op {
  switch (op.kind) {
    case 'insert':
      return { ...op, kind: 'remove' };
    case 'remove':
      return { ...op, kind: 'insert' };
    case 'update':
    case 'stopwatch':
    case 'settings':
      return { ...op, before: op.after, after: op.before } as Op;
    case 'move':
      return { ...op, from: op.to, to: op.from };
  }
}

/** The inverse of a list of operations: each inverted, last first. */
export function invertOps(ops: readonly Op[]): Op[] {
  return ops.map(invertOp).reverse();
}

/** Plain-JSON equality, for items and settings. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** An operation that changes nothing records nothing (PRD §4.1). */
export function isNoop(op: Op): boolean {
  switch (op.kind) {
    case 'insert':
    case 'remove':
      return false;
    case 'move':
      return op.from === op.to;
    case 'update':
    case 'stopwatch':
    case 'settings':
      return sameValue(op.before, op.after);
  }
}
