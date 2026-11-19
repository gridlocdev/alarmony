import { useState } from 'preact/hooks';
import {
  addPreset,
  addTimer,
  describeDuration,
  durationInput,
  editTimer,
  formatCountdown,
  parseDuration,
  setSnoozeMinutes,
} from '@alarmony/core';
import { Dialog, isMac, type CommandCatalog, type Theme, type TimeFormat } from '@alarmony/ui';
import type { AppController } from './controller.ts';
import { startPreset } from './commands.ts';
import { shortcutGroups } from './shortcuts.ts';
import { AlarmDialog } from './AlarmDialogs.tsx';

const BAD_DURATION = 'Type a length from 1 second to 99:59:59, like 5, 5m, 1h30m, 90s or 25:00.';

/** The duration and label fields both timer dialogs share. */
function TimerFields(props: {
  readonly duration: string;
  readonly label: string;
  readonly error: string | null;
  readonly onDuration: (v: string) => void;
  readonly onLabel: (v: string) => void;
}) {
  const ms = parseDuration(props.duration);
  return (
    <>
      <label class="al-field">
        <span>Length</span>
        <input
          type="text"
          inputMode="text"
          value={props.duration}
          placeholder="5m, 1h30m, 25:00"
          aria-invalid={props.error ? true : undefined}
          data-autofocus
          onInput={(e) => props.onDuration(e.currentTarget.value)}
        />
        <small class={props.error ? 'al-error-text' : 'al-muted'}>
          {props.error ?? (ms === null ? 'A bare number is minutes.' : describeDuration(ms))}
        </small>
      </label>
      <label class="al-field">
        <span>Label</span>
        <input
          type="text"
          value={props.label}
          maxLength={100}
          onInput={(e) => props.onLabel(e.currentTarget.value)}
        />
      </label>
    </>
  );
}

function NewTimerDialog({ app }: { readonly app: AppController }) {
  const [duration, setDuration] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const presets = app.data.value.presets;
  const read = (): number | null => {
    const ms = parseDuration(duration);
    setError(ms === null ? BAD_DURATION : null);
    return ms;
  };
  const start = () => {
    const ms = read();
    if (ms === null) return;
    const id = app.newId('t');
    app.close();
    if (app.edit(addTimer(app.data.peek(), { id, ms, label }, app.now()), 'New timer'))
      app.selected.value = id;
  };
  const savePreset = () => {
    const ms = read();
    if (ms === null) return;
    app.edit(
      addPreset(app.data.peek(), { id: app.newId('p'), ms, label }),
      'Save preset',
      'Saved as a preset.',
    );
  };
  return (
    <Dialog
      title="New Timer"
      onClose={() => app.close()}
      onSubmit={start}
      actions={
        <>
          <button type="button" class="al-button al-push-left" onClick={savePreset}>
            Save as Preset
          </button>
          <button type="button" class="al-button" onClick={() => app.close()}>
            Cancel
          </button>
          <button type="submit" class="al-button al-button-primary">
            Start
          </button>
        </>
      }
    >
      <TimerFields
        duration={duration}
        label={label}
        error={error}
        onDuration={(v) => {
          setDuration(v);
          setError(null);
        }}
        onLabel={setLabel}
      />
      {presets.length > 0 && (
        <div class="al-preset-buttons" role="group" aria-label="Presets">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              class="al-button al-button-small"
              onClick={() => {
                app.close();
                startPreset(app, p.id);
              }}
            >
              {p.label || 'Timer'} <span class="al-num al-muted">{formatCountdown(p.ms)}</span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function EditTimerDialog({ app, id }: { readonly app: AppController; readonly id: string }) {
  const timer = app.data.peek().timers.find((t) => t.id === id);
  const [duration, setDuration] = useState(() => (timer ? durationInput(timer.ms) : ''));
  const [label, setLabel] = useState(timer?.label ?? '');
  const [error, setError] = useState<string | null>(null);
  if (!timer) return null;
  const save = () => {
    const ms = parseDuration(duration);
    if (ms === null) {
      setError(BAD_DURATION);
      return;
    }
    app.close();
    app.edit(editTimer(app.data.peek(), id, label, ms, app.now()), 'Edit timer');
  };
  return (
    <Dialog
      title="Edit Timer"
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
      <TimerFields
        duration={duration}
        label={label}
        error={error}
        onDuration={(v) => {
          setDuration(v);
          setError(null);
        }}
        onLabel={setLabel}
      />
    </Dialog>
  );
}

function SettingsDialog({ app, folder }: { readonly app: AppController; readonly folder: string }) {
  const s = app.settings.value;
  return (
    <Dialog
      title="Settings"
      onClose={() => app.close()}
      actions={
        <button type="button" class="al-button al-button-primary" onClick={() => app.close()}>
          Done
        </button>
      }
    >
      <div class="al-field-row">
        <label class="al-field">
          <span>Theme</span>
          <select
            value={s.theme}
            onChange={(e) => app.setSettings({ theme: e.currentTarget.value as Theme })}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label class="al-field">
          <span>Time format</span>
          <select
            value={s.timeFormat}
            onChange={(e) => app.setSettings({ timeFormat: e.currentTarget.value as TimeFormat })}
          >
            <option value="system">System</option>
            <option value="12">12-hour</option>
            <option value="24">24-hour</option>
          </select>
        </label>
      </div>
      <label class="al-check">
        <input
          type="checkbox"
          checked={s.ring}
          onChange={(e) => app.setSettings({ ring: e.currentTarget.checked })}
        />
        Ring on this device
      </label>
      <label class="al-check">
        <input
          type="checkbox"
          checked={s.notifications}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            app.setSettings({ notifications: on });
            if (on) app.askToNotify();
          }}
        />
        Show notifications
      </label>
      <label class="al-field">
        <span>Snooze length</span>
        <select
          value={String(app.data.value.settings.snoozeMinutes)}
          onChange={(e) =>
            app.doc.applySetting(
              setSnoozeMinutes(app.data.peek(), Number(e.currentTarget.value)),
              'Snooze length',
            )
          }
        >
          {[...new Set([1, 2, 3, 5, 9, 10, 15, 20, 30, 45, 60, app.data.value.settings.snoozeMinutes])]
            .sort((a, b) => a - b)
            .map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
        </select>
      </label>
      <label class="al-field">
        <span>Volume</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(s.volume * 100)}
          aria-valuetext={`${Math.round(s.volume * 100)}%`}
          onChange={(e) => {
            app.setSettings({ volume: Number(e.currentTarget.value) / 100 });
            app.previewSound();
          }}
        />
      </label>
      <p class="al-muted al-small-text">Data: {folder}</p>
      {app.session.store.kind === 'browser' && (
        <p class="al-muted al-small-text">
          In a browser, a timer rings only while this tab is open, and a tab in the background can ring up to
          a minute late.
        </p>
      )}
    </Dialog>
  );
}

function ShortcutsDialog({
  app,
  catalog,
}: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
}) {
  return (
    <Dialog
      title="Keyboard Shortcuts"
      class="al-dialog-wide"
      onClose={() => app.close()}
      actions={
        <button type="button" class="al-button al-button-primary" onClick={() => app.close()}>
          Done
        </button>
      }
    >
      <div class="al-shortcuts">
        {shortcutGroups(catalog, isMac).map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <dl>
              {g.lines.map((l) => (
                <div key={l.title} class="al-shortcut">
                  <dt>{l.title}</dt>
                  <dd>
                    {l.keys.map((way, i) => (
                      <span key={i}>
                        {i > 0 && ' or '}
                        {way.map((k, j) => (
                          <kbd key={j}>{k}</kbd>
                        ))}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

/** Saving found the file changed somewhere else (PRD §3.5; slice 1 always asks). */
function ConflictDialog({ app }: { readonly app: AppController }) {
  const busy = app.session.choosing.value;
  const conflict = app.session.conflict.value!;
  const fail = (e: unknown) =>
    app.say(e instanceof Error ? e.message : String(e), { sticky: true, tone: 'error' });
  return (
    <Dialog
      title="clock.json changed somewhere else"
      onClose={() => undefined}
      actions={
        <>
          <button
            type="button"
            class="al-button"
            disabled={busy}
            onClick={() =>
              void app.session.useTheirs().then((notice) => notice && app.say(notice, { sticky: true }), fail)
            }
          >
            Use Theirs
          </button>
          <button
            type="button"
            class="al-button al-button-primary"
            disabled={busy}
            onClick={() =>
              void app.session.keepMine().then((notice) => notice && app.say(notice, { sticky: true }), fail)
            }
          >
            Keep Mine
          </button>
        </>
      }
    >
      <p>
        Another window, device or the command line changed the file while this window had unsaved changes (
        {conflict.changed === 1 ? '1 item differs' : `${conflict.changed} items differ`}).
      </p>
      <p class="al-muted">
        Keep Mine saves this window’s timers and stopwatch over it. Use Theirs drops this window’s changes.
      </p>
    </Dialog>
  );
}

/** Last time ended with changes that weren't saved (PRD §3.6). */
function RecoveryDialog({ app }: { readonly app: AppController }) {
  return (
    <Dialog
      title="Restore unsaved changes?"
      // Escape or a click outside must not throw the only copy away: only Discard does.
      onClose={() => undefined}
      onSubmit={() => app.session.restoreRecovered()}
      actions={
        <>
          <button type="button" class="al-button" onClick={() => app.session.discardRecovered()}>
            Discard
          </button>
          <button type="submit" class="al-button al-button-primary" data-autofocus>
            Restore
          </button>
        </>
      }
    >
      <p>Alarmony closed last time before it could save some changes. Restore them?</p>
    </Dialog>
  );
}

/** Whichever dialog is in front. A save question comes before the rest. */
export function AppDialogs({
  app,
  catalog,
}: {
  readonly app: AppController;
  readonly catalog: CommandCatalog;
}) {
  if (app.session.conflict.value) return <ConflictDialog app={app} />;
  if (app.session.recoverable.value !== null) return <RecoveryDialog app={app} />;
  const d = app.dialog.value;
  switch (d?.kind) {
    case 'newTimer':
      return <NewTimerDialog app={app} />;
    case 'editTimer':
      return <EditTimerDialog key={d.id} app={app} id={d.id} />;
    case 'settings':
      return <SettingsDialog app={app} folder={app.session.store.location()} />;
    case 'shortcuts':
      return <ShortcutsDialog app={app} catalog={catalog} />;
    case 'newAlarm':
    case 'editAlarm':
      return <AlarmDialog app={app} />;
    case 'menu':
    case undefined:
      return null;
  }
}
