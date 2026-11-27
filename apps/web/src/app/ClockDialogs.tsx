import { useMemo, useRef, useState } from 'preact/hooks';
import {
  addClock,
  fromHere,
  offsetAt,
  renameClock,
  searchZones,
  systemZones,
  zoneChoices,
  zoneCity,
} from '@alarmony/core';
import { Dialog } from '@alarmony/ui';
import type { AppController } from './controller.ts';

/** How many matches the list shows at once; typing narrows the rest. */
const SHOWN = 60;

/**
 * Add Clock: a search over the system's zones. Enter adds the highlighted match and the dialog stays open for
 * another; a zone already shown is marked Added (PRD §6.1).
 */
function AddClockDialog({ app }: { readonly app: AppController }) {
  const choices = useMemo(
    () => fromHere(zoneChoices(systemZones(), app.now()), offsetAt(app.now(), app.zone)),
    [app],
  );
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const shown = app.data.value.clocks.map((c) => c.zone);
  const hits = searchZones(choices, query).slice(0, SHOWN);
  const at = Math.min(active, Math.max(0, hits.length - 1));
  const add = (index: number) => {
    const c = hits[index];
    if (!c || shown.includes(c.zone)) return;
    const id = app.newId('c');
    if (app.edit(addClock(app.data.peek(), id, c.zone), 'Add clock', `Added ${c.city}.`))
      app.selected.value = id;
  };
  const move = (to: number) => {
    const next = Math.max(0, Math.min(hits.length - 1, to));
    setActive(next);
    listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
  };
  return (
    <Dialog
      title="Add Clock"
      class="al-dialog-wide al-dialog-top"
      onClose={() => app.close()}
      onSubmit={() => add(at)}
      actions={
        <button type="button" class="al-button" onClick={() => app.close()}>
          Done
        </button>
      }
    >
      <input
        type="text"
        role="combobox"
        aria-label="City or time zone"
        aria-expanded="true"
        aria-controls="al-zone-list"
        aria-activedescendant={hits[at] ? `al-zone-${at}` : undefined}
        placeholder="City or time zone"
        class="al-zone-search"
        value={query}
        data-autofocus
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            move(at + (e.key === 'ArrowDown' ? 1 : -1));
          }
        }}
      />
      <ul id="al-zone-list" class="al-zone-list" role="listbox" aria-label="Time zones" ref={listRef}>
        {hits.map((c, i) => {
          const added = shown.includes(c.zone);
          return (
            <li
              key={c.zone}
              id={`al-zone-${i}`}
              role="option"
              aria-selected={i === at}
              aria-disabled={added || undefined}
              class={added ? 'al-disabled' : undefined}
              onMouseMove={() => setActive(i)}
              onClick={() => add(i)}
            >
              <span class="al-zone-city">{c.city}</span>
              <span class="al-muted">{c.detail}</span>
              {added && <span class="al-zone-added">Added</span>}
            </li>
          );
        })}
        {hits.length === 0 && (
          <li class="al-palette-empty">No time zone matches “{query}”. Try a city or a country.</li>
        )}
      </ul>
    </Dialog>
  );
}

/** Rename a clock: its label shows instead of the city; an empty label goes back to the city (PRD §6.1). */
function RenameClockDialog({ app, id }: { readonly app: AppController; readonly id: string }) {
  const clock = app.data.value.clocks.find((c) => c.id === id);
  const label = useRef(clock?.label ?? '');
  if (!clock) return null;
  const save = () => {
    app.close();
    app.edit(renameClock(app.data.peek(), id, label.current), 'Rename', 'Renamed the clock.');
  };
  return (
    <Dialog
      title="Rename Clock"
      onClose={() => app.close()}
      onSubmit={save}
      actions={
        <>
          <button type="button" class="al-button" onClick={() => app.close()}>
            Cancel
          </button>
          <button type="submit" class="al-button al-button-primary">
            Rename
          </button>
        </>
      }
    >
      <label class="al-field">
        <span>Name</span>
        <input
          type="text"
          defaultValue={clock.label}
          placeholder={zoneCity(clock.zone)}
          maxLength={100}
          data-autofocus
          onInput={(e) => {
            label.current = e.currentTarget.value;
          }}
        />
        <small class="al-muted">Leave it empty to show the city.</small>
      </label>
    </Dialog>
  );
}

/** The world clock dialogs, when one is open. */
export function ClockDialog({ app }: { readonly app: AppController }) {
  const d = app.dialog.value;
  if (d?.kind === 'addClock') return <AddClockDialog app={app} />;
  if (d?.kind === 'renameClock') return <RenameClockDialog key={d.id} app={app} id={d.id} />;
  return null;
}
