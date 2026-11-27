import { useMemo, useState } from 'preact/hooks';
import { ListPopup, filterEntries, type CommandCatalog, type MenuEntry } from '@alarmony/ui';
import { dynamicEntries } from './timerCommands.ts';
import type { AppController } from './controller.ts';

interface Entry extends MenuEntry {
  readonly keys: string;
  readonly enabled: boolean;
  /** Why it is off, when a person should know (a read-only file). */
  readonly why: string | null;
  readonly run: () => void;
}

/** ⌘K: every command and preset, recent ones first (PRD §14). */
export function CommandMenu({
  app,
  catalog,
  initial,
}: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
  readonly initial: string;
}) {
  const [query, setQuery] = useState(initial);
  const [index, setIndex] = useState(0);
  const entries = useMemo<Entry[]>(() => {
    const commands = catalog.all
      .filter((c) => !c.hidden)
      .map((c) => ({
        id: c.id,
        title: c.title,
        group: c.group,
        keywords: `${c.keywords ?? ''} ${c.description}`,
        keys: catalog.keys(c).join(' '),
        enabled: catalog.isEnabled(c),
        why: catalog.whyDisabled(c),
        run: () => catalog.run(c.id),
      }));
    const locked = catalog.locked();
    const extra = dynamicEntries(app).map((e) => ({ ...e, keys: '', enabled: locked === null, why: locked }));
    return [...commands, ...extra];
  }, [app, catalog]);
  const results = filterEntries(entries, query, catalog.recentIds).slice(0, 80);
  const pick = (i: number) => {
    const entry = results[i];
    if (!entry || !entry.enabled) return;
    app.close();
    catalog.remember(entry.id);
    // Let the menu close (and focus go back) before the command runs.
    queueMicrotask(entry.run);
  };
  return (
    <ListPopup
      label="Command menu"
      placeholder="Type a command or preset…"
      query={query}
      onQuery={(q) => {
        setQuery(q);
        setIndex(0);
      }}
      index={index}
      onIndex={setIndex}
      count={results.length}
      onPick={pick}
      onClose={() => app.close()}
    >
      {results.map((e, i) => (
        <li
          key={e.id}
          id={`al-palette-${i}`}
          role="option"
          aria-selected={i === index}
          aria-disabled={!e.enabled}
          class={e.enabled ? undefined : 'al-disabled'}
          title={e.why ?? undefined}
          onPointerMove={() => setIndex(i)}
          onClick={() => pick(i)}
        >
          <span class="al-palette-title">{e.title}</span>
          <span class="al-palette-group">{e.group}</span>
          {e.keys && <kbd class="al-menu-key">{e.keys}</kbd>}
        </li>
      ))}
    </ListPopup>
  );
}
