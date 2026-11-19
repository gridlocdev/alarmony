/** A short random id, unique in its list (PRD §3.2): a letter for the list, then 10 random characters. */
export function newId(prefix: string, taken: ReadonlySet<string> = new Set()): string {
  for (;;) {
    const id = `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
    if (!taken.has(id)) return id;
  }
}
