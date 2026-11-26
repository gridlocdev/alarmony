import { useRef, useState } from 'preact/hooks';
import {
  DEFAULT_SOUND,
  EVERY_DAY,
  SOUNDS,
  WEEKDAYS,
  WEEKENDS,
  addAlarm,
  deleteAlarm,
  editAlarm,
  parseAlarmTime,
  stepAlarmTime,
  wallAt,
  type AlarmFields,
} from '@alarmony/core';
import { Dialog } from '@alarmony/ui';
import { alarmTime } from './AlarmsView.tsx';
import type { AppController } from './controller.ts';

const BAD_TIME = 'Type a time like 7, 7:30, 730, 7:30 pm or 19:30.';
const DAYS = [
  { day: 1, short: 'Mo', name: 'Monday' },
  { day: 2, short: 'Tu', name: 'Tuesday' },
  { day: 3, short: 'We', name: 'Wednesday' },
  { day: 4, short: 'Th', name: 'Thursday' },
  { day: 5, short: 'Fr', name: 'Friday' },
  { day: 6, short: 'Sa', name: 'Saturday' },
  { day: 7, short: 'Su', name: 'Sunday' },
];

/** The first day of the week where this browser is (1 Monday … 7 Sunday); Monday where it can't tell. */
function firstDayHere(): number {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const first = locale.getWeekInfo?.().firstDay ?? locale.weekInfo?.firstDay;
    return first && first >= 1 && first <= 7 ? first : 1;
  } catch {
    return 1;
  }
}

/** The seven day buttons, starting on `first` (PRD §7.2). */
export function daysFrom(first: number): typeof DAYS {
  const at = DAYS.findIndex((d) => d.day === first);
  return at <= 0 ? DAYS : [...DAYS.slice(at), ...DAYS.slice(0, at)];
}

/** The same days, in any order. */
const sameDays = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((d) => b.includes(d));

const SHORTCUTS = [
  { label: 'Weekdays', days: WEEKDAYS },
  { label: 'Weekends', days: WEEKENDS },
  { label: 'Every Day', days: EVERY_DAY },
  { label: 'Never', days: [] as readonly number[] },
];

const pad = (n: number) => String(n).padStart(2, '0');

/** A new alarm starts at the next whole hour (PRD §7.2). */
function nextWholeHour(app: AppController): string {
  const w = wallAt(app.now(), app.zone);
  return `${pad((w.hour + 1) % 24)}:00`;
}

/** The fields both alarm editors share. Each change goes to `onChange`; the time and label when typed in full. */
function AlarmFieldsView(props: {
  readonly app: AppController;
  readonly fields: AlarmFields;
  readonly timeText: string;
  readonly timeError: string | null;
  readonly onTimeText: (text: string) => void;
  /** The time field lost focus, Enter was pressed in it, or an arrow key set it to `text`. */
  readonly onTimeDone: (text?: string) => void;
  readonly onLabelText: (label: string) => void;
  /** The label field lost focus or Enter was pressed in it. */
  readonly onLabelDone: () => void;
  readonly onChange: (patch: Partial<AlarmFields>) => void;
}) {
  const { app, fields } = props;
  const parsed = parseAlarmTime(props.timeText);
  const shown = parsed === null ? null : alarmTime(parsed, app.settings.value.timeFormat);
  // The time as Alarmony reads it, when that tells you more than what you typed ("730" → "7:30 AM").
  const reading = shown && shown.toLowerCase() !== props.timeText.trim().toLowerCase() ? shown : ' ';
  const setDays = (days: readonly number[]) => props.onChange({ days });
  const toggleDay = (day: number) =>
    setDays(fields.days.includes(day) ? fields.days.filter((d) => d !== day) : [...fields.days, day]);
  return (
    <>
      <label class="al-field">
        <span>Time</span>
        <input
          type="text"
          value={props.timeText}
          placeholder="7:30 am"
          aria-invalid={props.timeError ? true : undefined}
          data-autofocus
          onInput={(e) => props.onTimeText(e.currentTarget.value)}
          onChange={() => props.onTimeDone()}
          onKeyDown={(e) => {
            // Up and Down step the hour, or the minute when the caret is after the colon (PRD §7.2).
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            const input = e.currentTarget;
            if (!input.value.trim()) {
              // An empty field starts at the next whole hour, then steps from there.
              e.preventDefault();
              const text = alarmTime(nextWholeHour(app), app.settings.value.timeFormat);
              input.value = text;
              props.onTimeText(text);
              props.onTimeDone(text);
              return;
            }
            const time = parseAlarmTime(input.value);
            if (time === null) return;
            e.preventDefault();
            const colon = input.value.indexOf(':');
            const caret = input.selectionStart ?? 0;
            const part = colon >= 0 && caret > colon ? 'minute' : 'hour';
            const text = alarmTime(
              stepAlarmTime(time, part, e.key === 'ArrowUp' ? 1 : -1),
              app.settings.value.timeFormat,
            );
            // Set here first, so the redraw finds the field already right and the caret stays where it was.
            input.value = text;
            input.setSelectionRange(caret, caret);
            props.onTimeText(text);
            props.onTimeDone(text);
          }}
        />
        <small class={props.timeError ? 'al-error-text' : 'al-muted'}>{props.timeError ?? reading}</small>
      </label>
      <fieldset class="al-field al-days">
        <legend>Repeat</legend>
        <div class="al-day-buttons" role="group" aria-label="Days">
          {daysFrom(firstDayHere()).map((d) => (
            <button
              key={d.day}
              type="button"
              class="al-day"
              aria-pressed={fields.days.includes(d.day)}
              aria-label={d.name}
              title={d.name}
              onClick={() => toggleDay(d.day)}
            >
              {d.short}
            </button>
          ))}
        </div>
        <div class="al-day-shortcuts">
          {SHORTCUTS.map((s) => (
            <button
              key={s.label}
              type="button"
              class="al-button al-button-small"
              aria-pressed={sameDays(fields.days, s.days)}
              onClick={() => setDays(s.days)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>
      <label class="al-field">
        <span>Label</span>
        <input
          type="text"
          defaultValue={fields.label}
          maxLength={100}
          onInput={(e) => props.onLabelText(e.currentTarget.value)}
          onChange={() => props.onLabelDone()}
        />
      </label>
      <div class="al-field-row">
        <label class="al-field">
          <span>Sound</span>
          <select
            value={fields.sound}
            onChange={(e) => {
              const sound = e.currentTarget.value;
              props.onChange({ sound });
              app.previewSound(sound);
            }}
          >
            {/* A sound from a newer Alarmony is kept, and plays the default here (PRD §3.2). */}
            {!SOUNDS.some((s) => s.id === fields.sound) && (
              <option value={fields.sound}>{fields.sound}</option>
            )}
            {SOUNDS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label class="al-check">
          <input
            type="checkbox"
            checked={fields.snooze}
            onChange={(e) => props.onChange({ snooze: e.currentTarget.checked })}
          />
          Snooze
        </label>
      </div>
    </>
  );
}

function NewAlarmDialog({ app }: { readonly app: AppController }) {
  // The time starts empty, so Enter can't add an alarm at a time nobody chose (PRD §7.2).
  const [timeText, setTimeText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<AlarmFields>(() => ({
    time: nextWholeHour(app),
    days: [],
    label: '',
    sound: DEFAULT_SOUND,
    snooze: true,
  }));
  const label = useRef(fields.label);
  const save = () => {
    const time = parseAlarmTime(timeText);
    if (time === null) {
      setError(BAD_TIME);
      return;
    }
    const id = app.newId('a');
    const ops = addAlarm(app.data.peek(), id, { ...fields, time, label: label.current }, app.now(), app.zone);
    if (app.edit(ops, 'New alarm', `Added an alarm for ${alarmTime(time, app.settings.peek().timeFormat)}.`))
      app.selected.value = id;
    app.close();
    app.askToNotify();
  };
  return (
    <Dialog
      title="New Alarm"
      onClose={() => app.close()}
      onSubmit={save}
      actions={
        <>
          <button type="button" class="al-button" onClick={() => app.close()}>
            Cancel
          </button>
          <button type="submit" class="al-button al-button-primary">
            Save
          </button>
        </>
      }
    >
      <AlarmFieldsView
        app={app}
        fields={fields}
        timeText={timeText}
        timeError={error}
        onTimeText={(v) => {
          setTimeText(v);
          setError(null);
        }}
        onTimeDone={() => undefined}
        onLabelText={(v) => {
          label.current = v;
        }}
        onLabelDone={() => undefined}
        onChange={(patch) => setFields({ ...fields, ...patch })}
      />
    </Dialog>
  );
}

/** An existing alarm: each change is saved as it is made, one undo step each (PRD §7.2). */
function EditAlarmDialog({ app, id }: { readonly app: AppController; readonly id: string }) {
  const alarm = app.data.value.alarms.find((a) => a.id === id);
  const [timeText, setTimeText] = useState(() =>
    alarm ? alarmTime(alarm.time, app.settings.peek().timeFormat) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const label = useRef(alarm?.label ?? '');
  if (!alarm) return null;
  const change = (patch: Partial<AlarmFields>) =>
    app.edit(editAlarm(app.data.peek(), id, patch, app.now(), app.zone), 'Edit alarm');
  /** Saves a typed time that reads; false when it doesn't. */
  const saveTime = (text = timeText): boolean => {
    const time = parseAlarmTime(text);
    if (time === null) {
      setError(BAD_TIME);
      return false;
    }
    if (time !== alarm.time) change({ time });
    return true;
  };
  const saveLabel = () => {
    if (label.current !== alarm.label) change({ label: label.current });
  };
  const done = () => {
    // What is still being typed is saved before the editor goes; a time that doesn't read keeps it open.
    saveLabel();
    if (saveTime()) app.close();
  };
  return (
    <Dialog
      title="Edit Alarm"
      onClose={() => {
        // Escape keeps the changes; a half-typed time that doesn't read is dropped.
        saveLabel();
        if (parseAlarmTime(timeText) !== null) saveTime();
        app.close();
      }}
      onSubmit={done}
      actions={
        <>
          <button
            type="button"
            class="al-button al-button-danger al-push-left"
            onClick={() => {
              app.selected.value = id;
              app.close();
              app.edit(
                deleteAlarm(app.data.peek(), id),
                'Delete',
                `Deleted ${alarm.label ? `“${alarm.label}”` : 'the alarm'}.`,
              );
            }}
          >
            Delete Alarm
          </button>
          <button type="submit" class="al-button al-button-primary">
            Done
          </button>
        </>
      }
    >
      <AlarmFieldsView
        app={app}
        fields={alarm}
        timeText={timeText}
        timeError={error}
        onTimeText={(v) => {
          setTimeText(v);
          setError(null);
        }}
        onTimeDone={(text) => void saveTime(text)}
        onLabelText={(v) => {
          label.current = v;
        }}
        onLabelDone={saveLabel}
        onChange={change}
      />
    </Dialog>
  );
}

/** The alarm editors, when one is open. */
export function AlarmDialog({ app }: { readonly app: AppController }) {
  const d = app.dialog.value;
  if (d?.kind === 'newAlarm') return <NewAlarmDialog app={app} />;
  if (d?.kind === 'editAlarm') return <EditAlarmDialog key={d.id} app={app} id={d.id} />;
  return null;
}
