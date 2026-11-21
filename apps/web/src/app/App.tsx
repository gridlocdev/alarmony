import { useRef } from 'preact/hooks';
import { keyFocus, type CommandCatalog } from '@alarmony/ui';
import { arrowNavigate } from './arrowNav.ts';
import { TABS, type AppController } from './controller.ts';
import { CommandMenu } from './CommandMenu.tsx';
import { ContextMenu } from './ContextMenu.tsx';
import { AppDialogs } from './Dialogs.tsx';
import { RingingSheet } from './RingingSheet.tsx';
import { StatusBar } from './StatusBar.tsx';
import { AlarmsView } from './AlarmsView.tsx';
import { WorldView } from './WorldView.tsx';
import { StopwatchView } from './StopwatchView.tsx';
import { TimersView } from './TimersView.tsx';

/** Runs the catalog command for a key press (the page's one key listener calls it, PRD §14). */
export function handleKey(app: AppController, catalog: CommandCatalog, e: KeyboardEvent): void {
  if (e.defaultPrevented) return;
  app.unlockSound();
  if (arrowNavigate(app, e)) return e.preventDefault();
  const result = catalog.forEvent(e, keyFocus(document.activeElement));
  if (!result) return;
  e.preventDefault();
  if (result.kind === 'run') catalog.run(result.command.id);
}

/** What the + button does on each tab that has one. */
const PLUS: Record<string, string> = { world: 'Add Clock', alarms: 'New Alarm', timers: 'New Timer' };

/** The window: a toolbar of tabs, the open tab, the status bar, and whatever dialog is in front (PRD §5.1). */
export function App({ app, catalog }: { readonly app: AppController; readonly catalog: CommandCatalog }) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const dialog = app.dialog.value;
  const tab = app.tab.value;
  const plus = catalog.get('item.new');
  return (
    <div class="al-app" onPointerDown={() => app.unlockSound()}>
      <header class="al-toolbar">
        <div
          class="al-tabs"
          role="tablist"
          aria-label="Clock"
          ref={tabsRef}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const at = TABS.findIndex((t) => t.id === tab);
            const next = TABS[(at + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!;
            app.showTab(next.id);
            tabsRef.current?.querySelector<HTMLElement>(`#al-tab-${next.id}`)?.focus();
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`al-tab-${t.id}`}
              type="button"
              role="tab"
              class="al-tab"
              aria-selected={tab === t.id}
              aria-controls="al-panel"
              tabIndex={tab === t.id ? 0 : -1}
              title={`${t.title} (${catalog.keys(catalog.get(`view.${t.id}`)!).join('')})`}
              onClick={() => app.showTab(t.id)}
            >
              {t.title}
            </button>
          ))}
        </div>
        {plus && (
          <button
            type="button"
            class="al-icon-button al-plus"
            aria-label={PLUS[tab] ?? 'New'}
            title={
              PLUS[tab] ? `${PLUS[tab]} (${catalog.keys(plus).join('')})` : 'The stopwatch has nothing to add'
            }
            disabled={!PLUS[tab]}
            onClick={() => catalog.run('item.new')}
          >
            +
          </button>
        )}
      </header>
      <div id="al-panel" class="al-panel" role="tabpanel" aria-labelledby={`al-tab-${tab}`}>
        {tab === 'world' ? (
          <WorldView app={app} catalog={catalog} />
        ) : tab === 'alarms' ? (
          <AlarmsView app={app} catalog={catalog} />
        ) : tab === 'stopwatch' ? (
          <StopwatchView app={app} catalog={catalog} />
        ) : (
          <TimersView app={app} catalog={catalog} />
        )}
      </div>
      <StatusBar app={app} />
      {dialog?.kind === 'menu' && <CommandMenu app={app} catalog={catalog} initial={dialog.initial} />}
      <ContextMenu app={app} catalog={catalog} />
      <AppDialogs app={app} catalog={catalog} />
      {/* Last, so it covers any open dialog: what rings is what the keys act on (PRD §9.2). */}
      {app.ringing.value.length > 0 && <RingingSheet app={app} />}
    </div>
  );
}
