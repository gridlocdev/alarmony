import { alarmClock, describeIn, describeRepeat, nextAlarm, sortAlarms, type Alarm } from '@alarmony/core';
import { Icon, type CommandCatalog, type TimeFormat } from '@alarmony/ui';
import type { AppController } from './controller.ts';
import { clockTime } from './time.ts';

/** An alarm's `HH:MM` in the chosen format: "7:00 AM" or "07:00". */
export function alarmTime(time: string, format: TimeFormat): string {
  const { hour, minute } = alarmClock(time);
  return clockTime(new Date(2000, 0, 1, hour, minute).getTime(), format);
}

function AlarmRow({
  app,
  catalog,
  alarm,
  soon,
}: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
  readonly alarm: Alarm;
  /** "in 7 hr 12 min" on the alarm that rings next. */
  readonly soon: string | null;
}) {
  const now = app.clock.value;
  const on = app.alarmOn(alarm);
  const time = alarmTime(alarm.time, app.settings.value.timeFormat);
  const repeat = describeRepeat(alarm, now, app.zone);
  const under = [alarm.label, repeat].filter(Boolean).join(', ');
  const select = () => {
    app.selected.value = alarm.id;
  };
  const run = (id: string) => () => {
    select();
    catalog.run(id);
  };
  return (
    <li
      class={`al-alarm${on ? '' : ' al-alarm-off'}${app.selected.value === alarm.id ? ' al-selected' : ''}`}
      tabIndex={0}
      data-id={alarm.id}
      aria-label={`${alarm.label || 'Alarm'}, ${time}, ${repeat}, ${on ? 'on' : 'off'}`}
      onFocusIn={select}
      onClick={select}
      onDblClick={run('alarm.edit')}
    >
      <div class="al-alarm-text" aria-hidden="true">
        <span class="al-alarm-time al-num">{time}</span>
        <span class="al-alarm-under">
          {under}
          {soon && <span class="al-alarm-soon"> · {soon}</span>}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        class="al-switch"
        aria-checked={on}
        aria-label={`${alarm.label || 'Alarm'} at ${time}`}
        onClick={(e) => {
          e.stopPropagation();
          run('alarm.toggle')();
        }}
      >
        <span class="al-switch-knob" />
      </button>
      <button
        type="button"
        class="al-icon-button al-small al-alarm-delete"
        aria-label={`Delete ${alarm.label || 'alarm'} at ${time}`}
        title="Delete Alarm"
        onClick={(e) => {
          e.stopPropagation();
          run('alarm.delete')();
        }}
      >
        <Icon name="x" />
      </button>
    </li>
  );
}

/** The Alarms tab: one row per alarm, by time of day (PRD §7.1). */
export function AlarmsView({
  app,
  catalog,
}: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
}) {
  const alarms = sortAlarms(app.data.value.alarms);
  const now = app.clock.value;
  const next = nextAlarm(alarms, now, app.zone);
  if (alarms.length === 0)
    return (
      <p class="al-empty">
        No alarms. Add one with <kbd>N</kbd>.
      </p>
    );
  /** Up and Down move along the list (PRD §7.1). */
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.al-alarm')];
    const at = rows.findIndex((r) => r.contains(document.activeElement));
    const to = rows[Math.max(0, Math.min(rows.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (!to) return;
    e.preventDefault();
    to.focus();
  };
  return (
    <ul class="al-alarm-list" aria-label="Alarms" onKeyDown={onKeyDown}>
      {alarms.map((a) => (
        <AlarmRow
          key={a.id}
          app={app}
          catalog={catalog}
          alarm={a}
          soon={next?.alarm.id === a.id ? describeIn(next.at - now) : null}
        />
      ))}
    </ul>
  );
}
