import { Dialog } from '@alarmony/ui';
import type { AppController } from './controller.ts';
import { clockTime } from './time.ts';

/**
 * What rings now, newest first, each with Stop and, for alarms, Snooze. Enter or Escape stops them all; S snoozes
 * the newest alarm that can be (PRD §9.2).
 */
export function RingingSheet({ app }: { readonly app: AppController }) {
  const list = app.ringing.value;
  const format = app.settings.value.timeFormat;
  const first = list[0]!;
  const many = list.length > 1;
  const name = (r: (typeof list)[number]) => r.label || (r.kind === 'alarm' ? 'Alarm' : 'Timer');
  const snoozeLabel = `Snooze ${app.data.value.settings.snoozeMinutes} min`;
  return (
    <Dialog
      title={many ? `${list.length} ringing` : app.ringTitle(first)}
      alert
      class="al-ringing"
      onClose={() => app.stopAll()}
      onSubmit={() => app.stopAll()}
      actions={
        <>
          {!many && first.snooze && (
            <button type="button" class="al-button" onClick={() => app.snooze(first.key)}>
              {snoozeLabel}
            </button>
          )}
          <button type="submit" class="al-button al-button-primary" data-autofocus>
            {many ? 'Stop All' : 'Stop'}
          </button>
        </>
      }
    >
      <ul class="al-ringing-list">
        {list.map((r) => (
          <li key={r.key}>
            {/* One ringing item is already named in the title. */}
            {many && <span class="al-ringing-name">{name(r)}</span>}
            <span class="al-muted">
              {r.kind === 'alarm' ? clockTime(r.at, format) : `Done at ${clockTime(r.at, format)}`}
            </span>
            {many && r.snooze && (
              <button type="button" class="al-button al-button-small" onClick={() => app.snooze(r.key)}>
                {snoozeLabel}
              </button>
            )}
            {many && (
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
