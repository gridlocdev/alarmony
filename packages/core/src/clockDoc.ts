/**
 * The open clock file: its data and this window's undo history (PRD §4.1, §11). Edits come in as operations
 * from `edits.ts`; listeners hear every change so the session can save it.
 */
import type { ClockData } from './format.ts';
import { applyOps, invertOps, isNoop, type Op } from './ops.ts';

export const MAX_HISTORY = 100;

export interface Step {
  /** Past tense, for the notice and the Edit menu: "Started timer", "Deleted Pasta". */
  readonly label: string;
  readonly ops: readonly Op[];
}

/**
 * `edit`, `undo`, `redo` and `setting` are this window's and get saved. `outside` (a change picked up from the
 * file), `merge` (this window's changes replayed onto the file's) and `replace` come from the file.
 */
export type ChangeKind = 'edit' | 'undo' | 'redo' | 'setting' | 'outside' | 'merge' | 'replace';

export interface Change {
  readonly kind: ChangeKind;
  /** The operations that made this change; empty for `merge` and `replace`. */
  readonly ops: readonly Op[];
  readonly label: string;
}

export class ClockDoc {
  #data: ClockData;
  #undo: Step[] = [];
  #redo: Step[] = [];
  #listeners = new Set<(change: Change) => void>();
  #locked = false;

  constructor(data: ClockData) {
    this.#data = data;
  }

  get data(): ClockData {
    return this.#data;
  }

  /** A file from a newer Alarmony (PRD §3.3): edits, settings, undo and redo change nothing. */
  get locked(): boolean {
    return this.#locked;
  }

  set locked(locked: boolean) {
    this.#locked = locked;
  }

  get canUndo(): boolean {
    return !this.#locked && this.#undo.length > 0;
  }

  get canRedo(): boolean {
    return !this.#locked && this.#redo.length > 0;
  }

  get undoLabel(): string | null {
    return this.#undo.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.#redo.at(-1)?.label ?? null;
  }

  onChange(listener: (change: Change) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(change: Change): void {
    for (const l of this.#listeners) l(change);
  }

  /** Applies an edit as one undo step. Returns false, and records nothing, when it changes nothing. */
  apply(ops: readonly Op[] | null, label: string): boolean {
    if (this.#locked) return false;
    const real = (ops ?? []).filter((op) => !isNoop(op));
    if (!real.length) return false;
    this.#data = applyOps(this.#data, real);
    this.#undo.push({ label, ops: real });
    if (this.#undo.length > MAX_HISTORY) this.#undo.shift();
    this.#redo = [];
    this.#emit({ kind: 'edit', ops: real, label });
    return true;
  }

  /** A change that is saved but isn't an undo step: settings in the file (PRD §3.4). */
  applySetting(ops: readonly Op[] | null, label: string): boolean {
    if (this.#locked) return false;
    const real = (ops ?? []).filter((op) => !isNoop(op));
    if (!real.length) return false;
    this.#data = applyOps(this.#data, real);
    this.#emit({ kind: 'setting', ops: real, label });
    return true;
  }

  undo(): Step | null {
    if (this.#locked) return null;
    const step = this.#undo.pop();
    if (!step) return null;
    const ops = invertOps(step.ops);
    this.#data = applyOps(this.#data, ops);
    this.#redo.push(step);
    this.#emit({ kind: 'undo', ops, label: step.label });
    return step;
  }

  redo(): Step | null {
    if (this.#locked) return null;
    const step = this.#redo.pop();
    if (!step) return null;
    this.#data = applyOps(this.#data, step.ops);
    this.#undo.push(step);
    this.#emit({ kind: 'redo', ops: step.ops, label: step.label });
    return step;
  }

  /**
   * Takes a change picked up from the file as one undo step (PRD §3.5). `ops` turn the data here into `data`;
   * `data` also carries what the file keeps that no operation reaches (items this version can't read).
   */
  takeOutside(data: ClockData, ops: readonly Op[], label: string): void {
    const real = ops.filter((op) => !isNoop(op));
    this.#data = data;
    if (real.length) {
      this.#undo.push({ label, ops: real });
      if (this.#undo.length > MAX_HISTORY) this.#undo.shift();
      this.#redo = [];
    }
    this.#emit({ kind: 'outside', ops: real, label });
  }

  /**
   * Takes this window's changes replayed onto the file's. Each step only changes its own fields, so undo still
   * fits unless some of this window's operations were dropped (Use Theirs); then the history goes.
   */
  merge(data: ClockData, keepHistory: boolean): void {
    this.#data = data;
    if (!keepHistory) {
      this.#undo = [];
      this.#redo = [];
    }
    this.#emit({ kind: 'merge', ops: [], label: '' });
  }

  /** Takes data read from the file. The history no longer fits it, so it goes. */
  replace(data: ClockData): void {
    this.#data = data;
    this.#undo = [];
    this.#redo = [];
    this.#emit({ kind: 'replace', ops: [], label: '' });
  }
}
