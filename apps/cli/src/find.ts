/**
 * Finding the item a command names: its id, then a name that matches exactly, then a name that contains the
 * text, then an id prefix of at least 4 characters. Only the items the command can act on are searched. Several
 * matches are listed, never guessed between.
 */
import { fold } from '@alarmony/core';
import { CliError } from './errors.ts';

export interface Findable {
  readonly id: string;
}

export interface Search<T extends Findable> {
  /** "alarm", "running timer": what the messages call the items searched. */
  readonly what: string;
  readonly items: readonly T[];
  /** The names an item answers to: its label, an alarm's time, a clock's city and zone. */
  readonly names: (item: T) => readonly string[];
  /** One line describing an item, for the list of matches. */
  readonly line: (item: T) => string;
}

const MIN_ID_PREFIX = 4;

export function findOne<T extends Findable>(query: string, s: Search<T>): T {
  const q = fold(query.trim());
  const byId = s.items.find((i) => i.id === query.trim());
  if (byId) return byId;
  const names = (i: T) => s.names(i).filter(Boolean).map(fold);
  const tiers: ((i: T) => boolean)[] = [
    (i) => names(i).includes(q),
    (i) => q.length > 0 && names(i).some((n) => n.includes(q)),
    (i) =>
      q.length >= MIN_ID_PREFIX && (i.id.startsWith(q) || i.id.slice(i.id.indexOf('_') + 1).startsWith(q)),
  ];
  for (const tier of tiers) {
    const hits = s.items.filter(tier);
    if (hits.length === 1) return hits[0] as T;
    if (hits.length > 1)
      throw new CliError(
        `“${query}” matches ${hits.length} ${s.what}s:\n${hits.map((h) => `  ${h.id}  ${s.line(h)}`).join('\n')}\nName one by its id.`,
      );
  }
  throw new CliError(`No ${s.what} matches “${query}”.`);
}
