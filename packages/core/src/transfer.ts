/** Import clock.json…: what a file someone picks does to the clock here, as one undo step (PRD §3.7). */
import { classifyFile, type ClockData } from './format.ts';
import { diffOps } from './merge.ts';
import type { Op } from './ops.ts';

export type ImportRead =
  { readonly kind: 'ok'; readonly ops: Op[] } | { readonly kind: 'error'; readonly message: string };

/** The operations that turn `current` into the file's clock, or why the file can't be imported. */
export function importOps(current: ClockData, text: string): ImportRead {
  const read = classifyFile(text);
  if (read.kind === 'newer')
    return { kind: 'error', message: 'That file is from a newer Alarmony. Update Alarmony to import it.' };
  if (read.kind === 'corrupt')
    return { kind: 'error', message: `That isn't a clock.json Alarmony can read (${read.reason}).` };
  return { kind: 'ok', ops: diffOps(current, read.data) };
}
