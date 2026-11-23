import { alarmClock, describeIn, describeRepeat, nextAlarm, sortAlarms, type Alarm } from '@alarmony/core';
import { type CommandCatalog, type TimeFormat } from '@alarmony/ui';
import type { AppController } from './controller.ts';
import { lockedProps } from './locked.ts';
import { MoreButton, onMenu } from './ContextMenu.tsx';
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
      data-nav
      onContextMenu={onMenu(app, 'alarm', alarm.id)}
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
        {...lockedProps(catalog)}
        onClick={(e) => {
          e.stopPropagation();
          run('alarm.toggle')();
        }}
      >
        <span class="al-switch-knob" />
      </button>
      <MoreButton app={app} kind="alarm" id={alarm.id} name={`${alarm.label || 'Alarm'} at ${time}`} />
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
      <div class="al-empty">
        <p>No alarms.</p>
        <button
          type="button"
          class="al-button al-button-primary"
          data-nav
          {...lockedProps(catalog)}
          onClick={() => catalog.run('alarm.new')}
        >
          New Alarm
        </button>
      </div>
    );
  return (
    <ul class="al-alarm-list" aria-label="Alarms">
      {alarms.map((a) => (
        <AlarmRow
          key={a.id}
          app={app}
          catalog={catalog}
          alarm={a}
          soon={next?.alarm.id === a.id ? describeIn(next.at - now) : null}
        />
      ))}
      <li class="al-add-row">
        <button
          type="button"
          class="al-add-button"
          data-nav
          {...lockedProps(catalog)}
          onClick={() => catalog.run('alarm.new')}
        >
          + New Alarm
        </button>
      </li>
    </ul>
  );
}
