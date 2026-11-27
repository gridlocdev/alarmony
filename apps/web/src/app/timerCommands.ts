/** The timer and preset commands (PRD §8.2, §14), and starting a timer from a preset or a common length. */
import {
  addTimer,
  addTimerTime,
  deletePreset,
  deleteTimer,
  describeDuration,
  isDone,
  pauseAllTimers,
  resetTimer,
  restartTimer,
  toggleTimer,
  addPreset,
  timerName,
} from '@alarmony/core';
import type { CommandSpec, MenuEntry } from '@alarmony/ui';
import type { AppController } from './controller.ts';
import { targetOf } from './itemMenu.ts';
import { deleteAndSelectBeside } from './afterDelete.ts';

const MINUTE_MS = 60_000;

export function timerCommandSpecs(app: AppController): CommandSpec[] {
  const now = () => app.now();
  const timer = () => app.selectedTimer.value;
  const onTimers = () => app.tab.value === 'timers' && timer() !== null;
  const withTimer = (run: (id: string) => void) => () => {
    const t = timer();
    if (t) run(t.id);
  };
  const preset = () => {
    const id = targetOf(app.itemMenu, 'preset');
    return app.data.value.presets.find((p) => p.id === id) ?? null;
  };
  return [
    {
      id: 'timer.toggle',
      title: 'Pause or Resume Timer',
      description: 'Pause the selected timer, or carry on with it.',
      group: 'Clock',
      writes: true,
      shortcuts: ['space'],
      keysOnly: true,
      enabled: onTimers,
      run: withTimer((id) => app.edit(toggleTimer(app.data.peek(), id, now()), 'Pause or resume')),
    },
    {
      id: 'timer.edit',
      title: 'Edit Timer…',
      description: 'Change the selected timer’s length or label.',
      group: 'Clock',
      writes: true,
      shortcuts: ['enter'],
      keysOnly: true,
      enabled: onTimers,
      run: withTimer((id) => app.open({ kind: 'editTimer', id })),
    },
    {
      id: 'timer.restart',
      title: 'Restart Timer',
      description: 'Start the selected timer again from its full length.',
      group: 'Clock',
      writes: true,
      enabled: () => onTimers() && timer()?.state !== 'idle',
      run: withTimer((id) => app.edit(restartTimer(app.data.peek(), id, now()), 'Restart')),
    },
    {
      id: 'timer.cancel',
      title: 'Cancel Timer',
      description: 'Stop the selected timer and put it back to its full length.',
      group: 'Clock',
      writes: true,
      enabled: () => onTimers() && !!timer() && timer()!.state !== 'idle' && !isDone(timer()!, now()),
      run: withTimer((id) => {
        const t = timer()!;
        app.edit(resetTimer(app.data.peek(), id), 'Cancel', `Cancelled ${app.describeTimer(t)}.`);
      }),
    },
    {
      id: 'timer.addMinute',
      title: 'Add 1 Minute',
      description: 'Give the selected timer another minute, even once it is done.',
      group: 'Clock',
      writes: true,
      enabled: () => onTimers() && !!timer() && timer()!.state !== 'idle',
      run: withTimer((id) => app.edit(addTimerTime(app.data.peek(), id, MINUTE_MS, now()), 'Add a minute')),
    },
    {
      id: 'timer.dismiss',
      title: 'Dismiss Timer',
      description: 'Close the selected timer once it is done.',
      group: 'Clock',
      writes: true,
      enabled: () => onTimers() && !!timer() && isDone(timer()!, now()),
      run: withTimer((id) => {
        const t = timer()!;
        deleteAndSelectBeside(app, 'timers', id, () =>
          app.edit(deleteTimer(app.data.peek(), id), 'Dismiss', `Dismissed ${app.describeTimer(t)}.`),
        );
      }),
    },
    {
      id: 'timer.savePreset',
      title: 'Save Timer as Preset',
      description: 'Keep the selected timer’s length and label as a preset.',
      group: 'Clock',
      writes: true,
      enabled: onTimers,
      run: withTimer(() => {
        const t = timer()!;
        app.edit(
          addPreset(app.data.peek(), { id: app.newId('p'), ms: t.ms, label: t.label }),
          'Save preset',
          'Saved as a preset.',
        );
      }),
    },
    {
      id: 'timer.delete',
      title: 'Delete Timer',
      description: 'Remove the selected timer.',
      group: 'Clock',
      writes: true,
      shortcuts: ['delete', 'backspace'],
      keysOnly: true,
      danger: true,
      enabled: onTimers,
      run: withTimer((id) => {
        const t = timer()!;
        deleteAndSelectBeside(app, 'timers', id, () =>
          app.edit(deleteTimer(app.data.peek(), id), 'Delete', `Deleted ${app.describeTimer(t)}.`),
        );
      }),
    },
    {
      id: 'timer.pauseAll',
      title: 'Pause All Timers',
      description: 'Pause every running timer.',
      group: 'Clock',
      writes: true,
      enabled: () => app.data.value.timers.some((t) => t.state === 'running' && !isDone(t, app.clock.value)),
      run: () => void app.edit(pauseAllTimers(app.data.peek(), now()), 'Pause all', 'Paused all timers.'),
    },
    {
      id: 'preset.start',
      title: 'Start Preset',
      description: 'Start a timer from the preset.',
      group: 'Clock',
      writes: true,
      hidden: true,
      enabled: () => preset() !== null,
      run: () => startPreset(app, preset()!.id),
    },
    {
      id: 'preset.rename',
      title: 'Rename Preset…',
      description: 'Change the preset’s label.',
      group: 'Clock',
      writes: true,
      hidden: true,
      enabled: () => preset() !== null,
      run: () => app.open({ kind: 'renamePreset', id: preset()!.id }),
    },
    {
      id: 'preset.delete',
      title: 'Delete Preset',
      description: 'Remove the preset.',
      group: 'Clock',
      writes: true,
      hidden: true,
      danger: true,
      enabled: () => preset() !== null,
      run: () => deletePresetFrom(app, preset()!.id),
    },
  ];
}

/** Entries ⌘K finds besides the commands: the presets, each starting a timer. */
export function dynamicEntries(app: AppController): (MenuEntry & { readonly run: () => void })[] {
  return app.data.peek().presets.map((p) => ({
    id: `preset:${p.id}`,
    title: p.label ? `Start ${p.label} (${describeDuration(p.ms)})` : `Start ${timerName(p)}`,
    group: 'Presets',
    keywords: 'preset timer start',
    run: () => startPreset(app, p.id),
  }));
}

export function startPreset(app: AppController, presetId: string): void {
  const p = app.data.peek().presets.find((x) => x.id === presetId);
  if (!p) return;
  startTimerFor(app, p.ms, p.label);
}

/** Starts a new timer of this length, as a preset or a common length does (PRD §8.2). */
export function startTimerFor(app: AppController, ms: number, label: string): void {
  app.showTab('timers');
  const id = app.newId('t');
  if (app.edit(addTimer(app.data.peek(), { id, ms, label }, app.now()), 'New timer')) app.selected.value = id;
}

export function deletePresetFrom(app: AppController, presetId: string): void {
  const p = app.data.peek().presets.find((x) => x.id === presetId);
  if (!p) return;
  app.edit(
    deletePreset(app.data.peek(), p.id),
    'Delete preset',
    `Deleted preset${p.label ? ` “${p.label}”` : ''}.`,
  );
}
