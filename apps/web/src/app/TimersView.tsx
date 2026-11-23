import {
  describeDuration,
  formatCountdown,
  isDone,
  timerLeft,
  timerName,
  timerProgress,
  type Timer,
} from '@alarmony/core';
import type { CommandCatalog } from '@alarmony/ui';
import type { AppController } from './controller.ts';
import { lockedProps } from './locked.ts';
import { clockTime, doneAgo } from './time.ts';
import { startTimerFor } from './timerCommands.ts';
import { quickStarts } from './quickStart.ts';
import { MoreButton, onMenu } from './ContextMenu.tsx';

const RING_R = 47;
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
  const done = isDone(timer, now);
  const left = timerLeft(timer, now);
  const progress = timerProgress(timer, now);
  const name = timerName(timer);
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
    status = doneAgo(now - Date.parse(timer.endsAt ?? ''));
  } else if (timer.state === 'running')
    status = `Ends ${clockTime(now + left, app.settings.value.timeFormat)}`;
  else if (timer.state === 'paused') status = 'Paused';
  else status = describeDuration(timer.ms);
  const label = `${name}, ${done ? 'done' : timer.state === 'idle' ? describeDuration(timer.ms) : `${spoken(left)} left${timer.state === 'paused' ? ', paused' : ''}`}`;
  return (
    <li
      class={`al-timer al-timer-${done ? 'done' : timer.state}${app.selected.value === timer.id ? ' al-selected' : ''}`}
      tabIndex={0}
      data-id={timer.id}
      data-nav
      onContextMenu={onMenu(app, 'timer', timer.id)}
      aria-label={label}
      onFocusIn={select}
      onClick={select}
      onDblClick={run('timer.edit')}
    >
      <div class="al-timer-dial">
        <svg class="al-timer-ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={RING_R} class="al-ring-track" />
          <circle
            cx="50"
            cy="50"
            r={RING_R}
            class="al-ring-left"
            stroke-dasharray={RING_LENGTH}
            stroke-dashoffset={done ? 0 : RING_LENGTH * progress}
          />
        </svg>
        <div class="al-timer-text" aria-hidden="true">
          <span class="al-timer-left al-num">{done ? '0:00' : formatCountdown(left)}</span>
          <span class="al-timer-label">{name}</span>
          <span class="al-timer-status">{status}</span>
        </div>
      </div>
      <div class="al-timer-buttons">
        {done ? (
          <>
            <button
              type="button"
              class="al-button al-button-small"
              {...lockedProps(catalog)}
              onClick={run('timer.dismiss')}
            >
              Dismiss
            </button>
            <button
              type="button"
              class="al-button al-button-small"
              {...lockedProps(catalog)}
              onClick={run('timer.addMinute')}
            >
              +1 min
            </button>
            <button
              type="button"
              class="al-button al-button-small al-button-primary"
              {...lockedProps(catalog)}
              onClick={run('timer.restart')}
            >
              Restart
            </button>
          </>
        ) : (
          <>
            {timer.state !== 'idle' && (
              <>
                <button
                  type="button"
                  class="al-button al-button-small al-button-quiet"
                  {...lockedProps(catalog)}
                  onClick={run('timer.cancel')}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="al-button al-button-small"
                  {...lockedProps(catalog)}
                  onClick={run('timer.addMinute')}
                >
                  +1 min
                </button>
              </>
            )}
            <button
              type="button"
              class="al-button al-button-small al-button-primary"
              {...lockedProps(catalog)}
              onClick={run('timer.toggle')}
            >
              {timer.state === 'running' ? 'Pause' : timer.state === 'paused' ? 'Resume' : 'Start'}
            </button>
          </>
        )}
      </div>
      <MoreButton app={app} kind="timer" id={timer.id} name={name} />
    </li>
  );
}

/** The last card: one click starts a preset or a common length, and Custom… opens New Timer (PRD §8.2). */
function AddTimerCard({ app, catalog }: { readonly app: AppController; readonly catalog: CommandCatalog }) {
  return (
    <li class="al-add-card al-timer-add" aria-label="New timer">
      <span class="al-add-title" aria-hidden="true">
        New Timer
      </span>
      <ul class="al-quick" aria-label="Start a timer">
        {quickStarts(app.data.value.presets).map((q) => (
          <li
            key={q.presetId ?? q.ms}
            onContextMenu={q.presetId ? onMenu(app, 'preset', q.presetId) : undefined}
          >
            <button
              type="button"
              class="al-quick-start"
              data-nav
              title={`Start ${describeDuration(q.ms)}`}
              onClick={() => startTimerFor(app, q.ms, q.label)}
              {...lockedProps(catalog)}
            >
              {q.label && <span class="al-quick-label">{q.label}</span>}
              <span class="al-num">{q.text}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        class="al-add-button"
        data-nav
        {...lockedProps(catalog)}
        onClick={() => catalog.run('timer.new')}
      >
        + Custom…
      </button>
    </li>
  );
}

/** The Timers tab: a card per timer, then the New Timer card with the presets (PRD §8.2). */
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
      <ul class="al-timer-grid" aria-label="Timers">
        {data.timers.map((t) => (
          <TimerCard key={t.id} app={app} catalog={catalog} timer={t} now={now} />
        ))}
        <AddTimerCard app={app} catalog={catalog} />
      </ul>
    </div>
  );
}
