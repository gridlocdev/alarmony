import { Icon } from '@alarmony/ui';
import type { AppController } from './controller.ts';

const STATUS_TEXT = { saved: '', saving: 'Saving…', failed: 'Not saved', conflict: 'Not saved' } as const;

/** Whether the status bar has nothing to show: no notice, and everything saved. On a phone it then takes no room. */
export function statusQuiet(app: AppController): boolean {
  return !app.notice.value && app.session.status.value === 'saved';
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
      <span class="al-where" title={app.session.store.location()}>
        {app.session.store.location()}
      </span>
      <div class="al-live" role="status" aria-live="polite" aria-atomic="true">
        {app.announcement.value}
      </div>
    </footer>
  );
}
