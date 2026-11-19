import { Dialog } from '@alarmony/ui';
import type { AppController } from './controller.ts';
import { clockTime } from './time.ts';

/** What rings now, newest first, each with Stop; Enter or Escape stops them all (PRD §9.2). */
export function RingingSheet({ app }: { readonly app: AppController }) {
  const list = app.ringing.value;
  const format = app.settings.value.timeFormat;
  return (
    <Dialog
      title={list.length === 1 ? `${list[0]!.label || 'Timer'} · Timer done` : `${list.length} timers done`}
      alert
      class="al-ringing"
      onClose={() => app.stopAll()}
      onSubmit={() => app.stopAll()}
      actions={
        <button type="submit" class="al-button al-button-primary" data-autofocus>
          {list.length === 1 ? 'Stop' : 'Stop All'}
        </button>
      }
    >
      <ul class="al-ringing-list">
        {list.map((r) => (
          <li key={r.key}>
            <span class="al-ringing-name">{r.label || 'Timer'}</span>
            <span class="al-muted">Done at {clockTime(r.at, format)}</span>
            {list.length > 1 && (
              <button type="button" class="al-button al-button-small" onClick={() => app.stopRinging(r.key)}>
                Stop
              </button>
            )}
          </li>
        ))}
      </ul>
      {app.soundWaiting.value && (
        <p class="al-muted">Click anywhere to hear it. Browsers play sound only after a click.</p>
      )}
    </Dialog>
  );
}
