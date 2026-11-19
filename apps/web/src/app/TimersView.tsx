import {
  deletePreset,
  describeDuration,
  formatCountdown,
  isFinished,
  timerLeft,
  timerProgress,
  type Timer,
} from '@alarmony/core';
import { Icon, type CommandCatalog } from '@alarmony/ui';
import type { AppController } from './controller.ts';
import { clockTime } from './time.ts';
import { startPreset } from './commands.ts';

const RING_R = 44;
const RING_LENGTH = 2 * Math.PI * RING_R;
const MINUTE = 60_000;
/** Above this, a screen reader hears the time left once a minute, not every second (PRD §16). */
const SPEAK_MINUTES_ABOVE = 10 * MINUTE;

function spoken(ms: number): string {
  const rounded = ms > SPEAK_MINUTES_ABOVE ? Math.ceil(ms / MINUTE) * MINUTE : Math.ceil(ms / 1000) * 1000;
  return describeDuration(rounded);
}

function TimerCard({
  app,
  catalog,
  timer,
  now,
}: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
  readonly timer: Timer;
  readonly now: number;
}) {
  const done = isFinished(timer, now);
  const left = timerLeft(timer, now);
  const progress = timerProgress(timer, now);
  const name = timer.label || 'Timer';
  const select = () => {
    app.selected.value = timer.id;
  };
  /** Selects this card, then runs a command on it. */
  const run = (id: string) => () => {
    select();
    catalog.run(id);
  };
  let status: string;
  if (done) {
    const since = Math.floor((now - Date.parse(timer.endsAt ?? '')) / MINUTE);
    status = since < 1 ? 'Done' : `Done ${since} min ago`;
  } else if (timer.state === 'running') status = `🔔 ${clockTime(now + left, app.settings.value.timeFormat)}`;
  else if (timer.state === 'paused') status = 'Paused';
  else status = describeDuration(timer.ms);
  const label = `${name}, ${done ? 'done' : timer.state === 'idle' ? describeDuration(timer.ms) : `${spoken(left)} left${timer.state === 'paused' ? ', paused' : ''}`}`;
  return (
    <li
      class={`al-timer al-timer-${done ? 'done' : timer.state}${app.selected.value === timer.id ? ' al-selected' : ''}`}
      tabIndex={0}
      aria-label={label}
      onFocus={select}
      onClick={select}
      onDblClick={run('timer.edit')}
    >
      <svg class="al-timer-ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={RING_R} class="al-ring-track" />
        <circle
          cx="50"
          cy="50"
          r={RING_R}
          class="al-ring-left"
          stroke-dasharray={RING_LENGTH}
          stroke-dashoffset={RING_LENGTH * progress}
        />
      </svg>
      <div class="al-timer-text" aria-hidden="true">
        <span class="al-timer-left al-num">{done ? '0:00' : formatCountdown(left)}</span>
        <span class="al-timer-label">{name}</span>
        <span class="al-timer-status">{status}</span>
      </div>
      <div class="al-timer-buttons">
        {done ? (
          <>
            <button type="button" class="al-button al-button-small" onClick={run('timer.cancel')}>
              Dismiss
            </button>
            <button
              type="button"
              class="al-button al-button-small al-button-primary"
              onClick={run('timer.restart')}
            >
              Restart
            </button>
          </>
        ) : (
          <>
            {timer.state !== 'idle' && (
              <button type="button" class="al-button al-button-small" onClick={run('timer.cancel')}>
                Cancel
              </button>
            )}
            <button
              type="button"
              class="al-button al-button-small al-button-primary"
              onClick={run('timer.toggle')}
            >
              {timer.state === 'running' ? 'Pause' : timer.state === 'paused' ? 'Resume' : 'Start'}
            </button>
          </>
        )}
      </div>
      <button
        type="button"
        class="al-icon-button al-small al-timer-delete"
        aria-label={`Delete ${name}`}
        title="Delete Timer"
        onClick={(e) => {
          e.stopPropagation();
          run('timer.delete')();
        }}
      >
        <Icon name="x" />
      </button>
    </li>
  );
}

/** The Timers tab: presets as chips, then a card per timer (PRD §8.2). */
export function TimersView({
  app,
  catalog,
}: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
}) {
  const data = app.data.value;
  const now = app.clock.value;
  return (
    <div class="al-timers">
      {data.presets.length > 0 && (
        <ul class="al-presets" aria-label="Presets">
          {data.presets.map((p) => (
            <li key={p.id} class="al-chip">
              <button
                type="button"
                class="al-chip-start"
                title={`Start ${describeDuration(p.ms)}`}
                onClick={() => startPreset(app, p.id)}
              >
                <span>{p.label || 'Timer'}</span>
                <span class="al-num al-muted">{formatCountdown(p.ms)}</span>
              </button>
              <button
                type="button"
                class="al-icon-button al-small"
                aria-label={`Delete preset ${p.label || describeDuration(p.ms)}`}
                onClick={() =>
                  app.edit(
                    deletePreset(data, p.id),
                    'Delete preset',
                    `Deleted preset${p.label ? ` “${p.label}”` : ''}.`,
                  )
                }
              >
                <Icon name="x" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {data.timers.length === 0 ? (
        <p class="al-empty">
          No timers. Start one with <kbd>N</kbd>.
        </p>
      ) : (
        <ul class="al-timer-grid" aria-label="Timers">
          {data.timers.map((t) => (
            <TimerCard key={t.id} app={app} catalog={catalog} timer={t} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}
