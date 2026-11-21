/**
 * Changes made elsewhere (PRD §3.5): which of this window's unsaved operations clash with what another copy saved,
 * replaying them onto that copy, and turning a change picked up from the file into operations for one undo step.
 */
import { clockName } from './clocks.ts';
import { LISTS, type ClockData, type Item, type ListName } from './format.ts';
import { timerName } from './duration.ts';
import { applyOps, changedFields, sameValue, type Op } from './ops.ts';

/** One thing both sides changed. */
export interface Clash {
  /** `alarms:<id>`, `stopwatch` or `settings`: what the clash is about. */
  readonly key: string;
  /** What the dialog lists: the item's label, an alarm's time, "Timer", "Stopwatch", "Snooze length". */
  readonly name: string;
}

/** Which side wins where both changed the same thing. */
export type ReplayMode = 'mine' | 'theirs';

export interface Replayed {
  readonly data: ClockData;
  /** Whether any of this window's operations were left out (Use Theirs on a clash). */
  readonly dropped: boolean;
}

function itemName(list: ListName, item: Item): string {
  switch (list) {
    case 'clocks':
      return clockName(item as ClockData['clocks'][number]);
    case 'alarms': {
      const a = item as ClockData['alarms'][number];
      return a.label || a.time;
    }
    case 'presets':
      return (item as ClockData['presets'][number]).label || 'Preset';
    case 'timers':
      return timerName(item as ClockData['timers'][number]);
  }
}

function byId(items: readonly Item[]): Map<string, Item> {
  return new Map(items.map((i) => [i.id, i]));
}

/**
 * The fields one side changed with its new values, or `removed`. Fields both sides set to the same value don't
 * clash, so the values come along.
 */
type Change = 'removed' | Map<string, unknown>;

function changeOf(list: ListName | 'settings', before: object, after: object | undefined): Change | null {
  if (!after) return 'removed';
  const fields = changedFields(list, before, after);
  if (!fields.size) return null;
  const values = after as Record<string, unknown>;
  return new Map([...fields].map((k) => [k, values[k]]));
}

function clashes(a: Change, b: Change): boolean {
  if (a === 'removed' || b === 'removed') return a !== b;
  for (const [k, v] of a) if (b.has(k) && !sameValue(v, b.get(k))) return true;
  return false;
}

/**
 * What both sides changed since `base`: an item edited on both sides in the same fields (to different values),
 * edited on one side and deleted on the other, or the stopwatch or the file's settings changed on both.
 */
export function findClashes(base: ClockData, theirs: ClockData, mine: readonly Op[]): Clash[] {
  const ours = applyOps(base, mine);
  const found: Clash[] = [];
  for (const list of LISTS) {
    const t = byId(theirs[list]);
    const m = byId(ours[list]);
    for (const item of base[list]) {
      const a = changeOf(list, item, t.get(item.id));
      const b = changeOf(list, item, m.get(item.id));
      if (a && b && clashes(a, b))
        found.push({ key: `${list}:${item.id}`, name: itemName(list, m.get(item.id) ?? item) });
    }
  }
  const sw = (d: ClockData) => !sameValue(d.stopwatch, base.stopwatch);
  if (sw(theirs) && sw(ours) && !sameValue(theirs.stopwatch, ours.stopwatch))
    found.push({ key: 'stopwatch', name: 'Stopwatch' });
  const a = changeOf('settings', base.settings, theirs.settings);
  const b = changeOf('settings', base.settings, ours.settings);
  if (a && b && clashes(a, b)) found.push({ key: 'settings', name: 'Snooze length' });
  return found;
}

function keyOf(op: Op): string {
  switch (op.kind) {
    case 'insert':
    case 'remove':
      return `${op.list}:${op.item.id}`;
    case 'update':
      return `${op.list}:${op.after.id}`;
    case 'move':
      return `${op.list}:${op.id}`;
    case 'stopwatch':
      return 'stopwatch';
    case 'settings':
      return 'settings';
  }
}

/**
 * What this window's operations changed, replayed onto what another copy saved. Each update changes only the fields it changed,
 * so edits to different fields of one item both stay. Where both sides changed the same thing, `mine` keeps this
 * window's change (an item they deleted comes back with it) and `theirs` keeps theirs and drops this window's
 * operations on it.
 */
export function replay(base: ClockData, theirs: ClockData, mine: readonly Op[], mode: ReplayMode): Replayed {
  const clashing = new Set(findClashes(base, theirs, mine).map((c) => c.key));
  // What this window changed in the end: an edit undone here takes nothing back from the other copy.
  const net = diffOps(base, applyOps(base, mine));
  let onto = theirs;
  let ops = net;
  if (mode === 'theirs') ops = net.filter((op) => !clashing.has(keyOf(op)));
  else
    for (const list of LISTS) {
      const there = new Set(theirs[list].map((i) => i.id));
      const back: Op[] = [];
      base[list].forEach((item, index) => {
        if (clashing.has(`${list}:${item.id}`) && !there.has(item.id))
          back.push({ kind: 'insert', list, index, item });
      });
      onto = applyOps(onto, back);
    }
  return { data: applyOps(onto, ops), dropped: ops.length < net.length };
}

/** Operations that turn `from` into `to`: what a change picked up from the file did, as one undo step. */
export function diffOps(from: ClockData, to: ClockData): Op[] {
  const ops: Op[] = [];
  for (const list of LISTS) {
    const target = byId(to[list]);
    let work = [...from[list]];
    for (let i = work.length - 1; i >= 0; i--) {
      const item = work[i] as Item;
      if (!target.has(item.id)) ops.push({ kind: 'remove', list, index: i, item });
    }
    work = work.filter((i) => target.has(i.id));
    const kept = byId(work);
    const order = to[list].filter((i) => kept.has(i.id)).map((i) => i.id);
    order.forEach((id, i) => {
      const j = work.findIndex((w) => w.id === id);
      if (j === i) return;
      ops.push({ kind: 'move', list, id, from: j, to: i });
      const [item] = work.splice(j, 1);
      work.splice(i, 0, item as Item);
    });
    to[list].forEach((item, index) => {
      if (!kept.has(item.id)) ops.push({ kind: 'insert', list, index, item });
    });
    for (const item of to[list]) {
      const before = kept.get(item.id);
      if (before && !sameValue(before, item)) ops.push({ kind: 'update', list, before, after: item });
    }
  }
  if (!sameValue(from.stopwatch, to.stopwatch))
    ops.push({ kind: 'stopwatch', before: from.stopwatch, after: to.stopwatch });
  if (!sameValue(from.settings, to.settings))
    ops.push({ kind: 'settings', before: from.settings, after: to.settings });
  return ops;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isItem = (v: unknown): v is Item => isObject(v) && typeof v.id === 'string';
const isList = (v: unknown): v is ListName => (LISTS as readonly unknown[]).includes(v);
const isIndex = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

/** Operations kept as JSON (the crash snapshot, PRD §3.6), or null when any of them isn't one. */
export function readOps(raw: unknown): Op[] | null {
  if (!Array.isArray(raw)) return null;
  const ops: Op[] = [];
  for (const op of raw) {
    if (!isObject(op)) return null;
    const fits =
      op.kind === 'insert' || op.kind === 'remove'
        ? isList(op.list) && isIndex(op.index) && isItem(op.item)
        : op.kind === 'update'
          ? isList(op.list) && isItem(op.before) && isItem(op.after) && op.before.id === op.after.id
          : op.kind === 'move'
            ? isList(op.list) && typeof op.id === 'string' && isIndex(op.from) && isIndex(op.to)
            : op.kind === 'stopwatch' || op.kind === 'settings'
              ? isObject(op.before) && isObject(op.after)
              : false;
    if (!fits) return null;
    ops.push(op as unknown as Op);
  }
  return ops;
}
