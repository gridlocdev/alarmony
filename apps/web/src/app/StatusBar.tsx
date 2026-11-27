import { Icon, type ClockStore } from '@alarmony/ui';
import type { AppController } from './controller.ts';

const STATUS_TEXT = { saved: '', saving: 'Saving…', failed: 'Not saved', conflict: 'Not saved' } as const;

/** What the status bar says about where the file is: a folder by its name (the path is on hover), else as is (PRD §3.7). */
export function placeLabel(kind: ClockStore['kind'], location: string): string {
  if (kind !== 'native') return location;
  // A bare folder name doesn't say what it is, so it says "Folder:"; the full path is on hover.
  const name =
    location
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() || location;
  return `Folder: ${name}`;
}

/** In a browser something will ring, but only while this tab is open: the status bar says so (PRD §5.3, §9). */
export function keepTabOpen(app: AppController): boolean {
  return app.session.store.kind === 'browser' && app.tray.value.armed;
}

/** Whether the status bar has nothing to show: no notice, and everything saved. On a phone it then takes no room. */
export function statusQuiet(app: AppController): boolean {
  return !app.notice.value && app.session.status.value === 'saved' && !keepTabOpen(app);
}

/** The status bar: the latest notice with its action, the save state and where the file is (PRD §5.1, §5.3). */
export function StatusBar({ app }: { readonly app: AppController }) {
  const notice = app.notice.value;
  const status = app.session.status.value;
  return (
    <footer class={`al-status${statusQuiet(app) ? ' al-quiet' : ''}`}>
      <div class={`al-notice${notice?.tone === 'error' ? ' al-notice-error' : ''}`}>
        {notice && (
          <>
            <span>{notice.text}</span>
            {notice.action && (
              <button
                type="button"
                class="al-link-button"
                onClick={() => {
                  const run = notice.action!.run;
                  app.dismissNotice();
                  run();
                }}
              >
                {notice.action.label}
              </button>
            )}
            {notice.sticky && (
              <button
                type="button"
                class="al-icon-button al-small"
                aria-label="Dismiss"
                onClick={() => app.dismissNotice()}
              >
                <Icon name="x" />
              </button>
            )}
          </>
        )}
      </div>
      <span class={`al-save al-save-${status}`}>{STATUS_TEXT[status]}</span>
      {keepTabOpen(app) && (
        <span
          class="al-keep-open"
          title="In a browser, alarms and timers ring only while this tab is open, and a tab in the background can ring up to a minute late."
        >
          Keep this tab open to ring
        </span>
      )}
      <span class="al-where" title={app.session.store.location()}>
        {placeLabel(app.session.store.kind, app.session.store.location())}
      </span>
      <div class="al-live" role="status" aria-live="polite" aria-atomic="true">
        {app.announcement.value}
      </div>
    </footer>
  );
}
