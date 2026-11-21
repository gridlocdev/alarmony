/** Every command in the app (PRD §14). The keyboard, ⌘K, the menu bar and the Shortcuts window all read this list. */
import {
  clockName,
  deleteClock,
  moveClock,
  deleteAlarm,
  duplicateAlarm,
  toggleAlarm,
  addTimer,
  canLap,
  describeDuration,
  canReset,
  deleteTimer,
  isFinished,
  lapStopwatch,
  pauseAllTimers,
  resetStopwatch,
  resetTimer,
  restartTimer,
  addPreset,
  deletePreset,
  formatStopwatch,
  toggleStopwatch,
  toggleTimer,
} from '@alarmony/core';
import { CommandCatalog, type CommandSpec, type MenuEntry } from '@alarmony/ui';
import { TABS, type AppController } from './controller.ts';
import { openSelectedMenu } from './ContextMenu.tsx';
import { targetOf } from './itemMenu.ts';
import { deleteAndSelectBeside } from './afterDelete.ts';
import { exportClock, importClock, inPickedFolder, leaveFolder } from './transfer.ts';

/** The dialogs ⌘K may replace: none of them holds anything typed. */
const MENU_OVER: readonly string[] = ['menu', 'shortcuts', 'settings'];

const TAB_KEYS: Record<string, string> = {
  timers: 'mod+1',
  stopwatch: 'mod+2',
  alarms: 'mod+3',
  world: 'mod+4',
};

export function commandSpecs(app: AppController): CommandSpec[] {
  const now = () => app.now();
  const sw = () => app.data.value.stopwatch;
  const timer = () => app.selectedTimer.value;
  const onTimers = () => app.tab.value === 'timers' && timer() !== null;
  const withTimer = (run: (id: string) => void) => () => {
    const t = timer();
    if (t) run(t.id);
  };
  const clock = () => app.selectedClock.value;
  const onWorld = () => app.tab.value === 'world' && clock() !== null;
  const withClock = (run: (id: string) => void) => () => {
    const c = clock();
    if (c) run(c.id);
  };
  const alarm = () => app.selectedAlarm.value;
  const onAlarms = () => app.tab.value === 'alarms' && alarm() !== null;
  const withAlarm = (run: (id: string) => void) => () => {
    const a = alarm();
    if (a) run(a.id);
  };
  const preset = () => {
    const id = targetOf(app.itemMenu, 'preset');
    return app.data.value.presets.find((p) => p.id === id) ?? null;
  };
  const lap = () => {
    const at = targetOf(app.itemMenu, 'lap');
    return at === null ? null : (sw().laps[Number(at)] ?? null);
  };
  const alarmName = () => {
    const a = alarm();
    return a?.label ? `“${a.label}”` : 'the alarm';
  };

  return [
    // File
    {
      id: 'item.new',
      title: 'New Clock, Alarm or Timer',
      description:
        'Add a clock on the World Clock tab, an alarm on the Alarms tab, or start a timer on the others.',
      group: 'File',
      shortcuts: ['mod+n', 'n'],
      hidden: true,
      run: () =>
        app.open({
          kind: app.tab.value === 'world' ? 'addClock' : app.tab.value === 'alarms' ? 'newAlarm' : 'newTimer',
        }),
    },
    {
      id: 'clock.add',
      title: 'Add Clock…',
      description: 'Add a world clock: search for a city or time zone.',
      group: 'File',
      keywords: 'world city time zone place',
      run: () => {
        app.showTab('world');
        app.open({ kind: 'addClock' });
      },
    },
    {
      id: 'alarm.new',
      title: 'New Alarm…',
      description: 'Add an alarm: its time, the days it repeats, a label and a sound.',
      group: 'File',
      keywords: 'add wake',
      run: () => {
        app.showTab('alarms');
        app.open({ kind: 'newAlarm' });
      },
    },
    {
      id: 'timer.new',
      title: 'New Timer…',
      description: 'Start a new timer: type how long, and a label if you like.',
      group: 'File',
      keywords: 'add countdown',
      run: () => {
        app.showTab('timers');
        app.open({ kind: 'newTimer' });
      },
    },
    {
      id: 'file.openFolder',
      title: 'Open Folder…',
      description: 'Keep clock.json in another folder, or open the one already there.',
      group: 'File',
      shortcuts: ['mod+o'],
      keywords: 'location directory change',
      enabled: () => app.openFolder !== null,
      hidden: app.openFolder === null,
      run: () => void app.openFolder?.(),
    },
    {
      id: 'file.useBrowser',
      title: 'Use This Browser’s Storage',
      description: 'Stop using the picked folder: the clock, as it is, goes back into this browser.',
      group: 'File',
      keywords: 'folder forget leave',
      hidden: !inPickedFolder(app.session),
      run: () =>
        void leaveFolder(app.session, () => location.reload()).catch((e: unknown) =>
          app.say(`Couldn't move the clock back: ${String(e)}`, { tone: 'error' }),
        ),
    },
    {
      id: 'file.export',
      title: 'Export clock.json…',
      description: 'Save a copy of your clocks, alarms, timers and stopwatch to the Downloads folder.',
      group: 'File',
      keywords: 'backup download save copy',
      hidden: app.session.store.kind === 'native',
      run: () =>
        void exportClock(app).catch((e: unknown) =>
          app.say(`Couldn't export: ${String(e)}`, { tone: 'error' }),
        ),
    },
    {
      id: 'file.import',
      title: 'Import clock.json…',
      description: 'Replace everything here with a clock.json you pick. Undo takes it back.',
      group: 'File',
      keywords: 'restore upload load backup',
      hidden: app.session.store.kind === 'native',
      enabled: () => !app.session.readOnly.value,
      run: () => importClock(app),
    },
    {
      id: 'app.settings',
      title: 'Settings…',
      description: 'Theme, ringing on this device, and the volume.',
      group: 'File',
      shortcuts: ['mod+,'],
      keywords: 'preferences options theme volume',
      run: () => app.open({ kind: 'settings' }),
    },

    // Edit
    {
      id: 'edit.undo',
      title: 'Undo',
      description: 'Take back the last change.',
      group: 'Edit',
      shortcuts: ['mod+z'],
      enabled: () => (void app.rev.value, app.doc.canUndo),
      run: () => app.undo(),
    },
    {
      id: 'edit.redo',
      title: 'Redo',
      description: 'Make the change you took back again.',
      group: 'Edit',
      shortcuts: ['mod+shift+z'],
      enabled: () => (void app.rev.value, app.doc.canRedo),
      run: () => app.redo(),
    },

    // View
    ...TABS.map((t): CommandSpec => ({
      id: `view.${t.id}`,
      title: t.title,
      description: `Show the ${t.title} tab.`,
      group: 'View',
      shortcuts: [TAB_KEYS[t.id] ?? ''],
      checked: () => app.tab.value === t.id,
      run: () => app.showTab(t.id),
    })),
    {
      id: 'view.worldList',
      title: 'World Clocks as List',
      description: 'Show world clocks as a list instead of cards with faces.',
      group: 'View',
      shortcuts: ['mod+l'],
      checked: () => app.settings.value.worldView === 'list',
      run: () => {
        app.showTab('world');
        app.setSettings({ worldView: app.settings.peek().worldView === 'list' ? 'cards' : 'list' });
      },
    },
    {
      id: 'item.menu',
      title: 'Show Item Menu',
      description: 'Open the right-click menu of the selected clock, alarm or timer.',
      group: 'View',
      shortcuts: ['shift+f10'],
      keysOnly: true,
      hidden: true,
      enabled: () => onWorld() || onAlarms() || onTimers(),
      run: () => openSelectedMenu(app),
    },
    {
      id: 'view.commandMenu',
      title: 'Command Menu…',
      description: 'Find and run any command by typing its name.',
      group: 'View',
      shortcuts: ['mod+k'],
      global: true,
      hidden: true,
      // Not over a form, which it would throw away, nor over the ringing sheet or a save question, where its
      // commands couldn't run.
      enabled: () => {
        const open = app.dialog.value?.kind;
        if (open && !MENU_OVER.includes(open)) return false;
        return (
          app.ringing.value.length === 0 &&
          app.session.conflict.value === null &&
          app.session.recoverable.value === null
        );
      },
      run: () => app.open({ kind: 'menu', initial: '' }),
    },

    // Clock
    {
      id: 'clock.rename',
      title: 'Rename Clock…',
      description: 'Give the selected clock a name of its own, shown instead of the city.',
      group: 'Clock',
      shortcuts: ['enter'],
      keysOnly: true,
      enabled: onWorld,
      run: withClock((id) => app.open({ kind: 'renameClock', id })),
    },
    {
      id: 'clock.moveUp',
      title: 'Move Clock Up',
      description: 'Move the selected clock one place earlier.',
      group: 'Clock',
      shortcuts: ['alt+up'],
      enabled: () => onWorld() && app.data.value.clocks[0]?.id !== clock()?.id,
      run: withClock((id) => app.edit(moveClock(app.data.peek(), id, -1), 'Move')),
    },
    {
      id: 'clock.moveDown',
      title: 'Move Clock Down',
      description: 'Move the selected clock one place later.',
      group: 'Clock',
      shortcuts: ['alt+down'],
      enabled: () => onWorld() && app.data.value.clocks.at(-1)?.id !== clock()?.id,
      run: withClock((id) => app.edit(moveClock(app.data.peek(), id, 1), 'Move')),
    },
    {
      id: 'clock.delete',
      title: 'Delete Clock',
      description: 'Remove the selected world clock.',
      group: 'Clock',
      shortcuts: ['delete', 'backspace'],
      keysOnly: true,
      danger: true,
      enabled: onWorld,
      run: withClock((id) => {
        const name = clockName(clock()!);
        deleteAndSelectBeside(app, 'clocks', id, () =>
          app.edit(deleteClock(app.data.peek(), id), 'Delete', `Deleted ${name}.`),
        );
      }),
    },
    {
      id: 'alarm.toggle',
      title: 'Turn Alarm On or Off',
      description: 'Switch the selected alarm on or off.',
      group: 'Clock',
      shortcuts: ['space'],
      keysOnly: true,
      enabled: onAlarms,
      run: withAlarm((id) => {
        const on = app.alarmOn(alarm()!);
        app.edit(
          toggleAlarm(app.data.peek(), id, now(), app.zone),
          on ? 'Turn off' : 'Turn on',
          `Turned ${alarmName()} ${on ? 'off' : 'on'}.`,
        );
      }),
    },
    {
      id: 'alarm.edit',
      title: 'Edit Alarm…',
      description: 'Change the selected alarm’s time, days, label or sound.',
      group: 'Clock',
      shortcuts: ['enter'],
      keysOnly: true,
      enabled: onAlarms,
      run: withAlarm((id) => app.open({ kind: 'editAlarm', id })),
    },
    {
      id: 'alarm.duplicate',
      title: 'Duplicate Alarm',
      description: 'Add a copy of the selected alarm.',
      group: 'Clock',
      enabled: onAlarms,
      run: withAlarm((id) => {
        const copy = app.newId('a');
        if (app.edit(duplicateAlarm(app.data.peek(), id, copy), 'Duplicate', `Duplicated ${alarmName()}.`))
          app.selected.value = copy;
      }),
    },
    {
      id: 'alarm.delete',
      title: 'Delete Alarm',
      description: 'Remove the selected alarm.',
      group: 'Clock',
      shortcuts: ['delete', 'backspace'],
      keysOnly: true,
      danger: true,
      enabled: onAlarms,
      run: withAlarm((id) => {
        const name = alarmName();
        deleteAndSelectBeside(app, 'alarms', id, () =>
          app.edit(deleteAlarm(app.data.peek(), id), 'Delete', `Deleted ${name}.`),
        );
      }),
    },
    {
      id: 'stopwatch.toggle',
      title: 'Start or Stop Stopwatch',
      description: 'Start the stopwatch, or stop it where it is.',
      group: 'Clock',
      shortcuts: ['space'],
      keysOnly: true,
      enabled: () => app.tab.value === 'stopwatch',
      run: () =>
        void app.edit(toggleStopwatch(app.data.peek(), now()), sw().state === 'running' ? 'Stop' : 'Start'),
    },
    {
      id: 'stopwatch.lap',
      title: 'Lap',
      description: 'Start a new lap; the one that ended goes on the list.',
      group: 'Clock',
      shortcuts: ['l'],
      keysOnly: true,
      enabled: () => sw().state === 'running' && canLap(sw()),
      run: () => {
        if (!app.edit(lapStopwatch(app.data.peek(), now()), 'Lap') && sw().laps.length > 0)
          app.say('The lap list is full.');
      },
    },
    {
      id: 'stopwatch.reset',
      title: 'Reset Stopwatch',
      description: 'Set the stopped stopwatch back to zero and clear its laps.',
      group: 'Clock',
      shortcuts: ['r'],
      keysOnly: true,
      enabled: () => canReset(sw()),
      run: () => void app.edit(resetStopwatch(app.data.peek()), 'Reset', 'Reset the stopwatch.'),
    },
    {
      id: 'timer.toggle',
      title: 'Pause or Resume Timer',
      description: 'Pause the selected timer, or carry on with it.',
      group: 'Clock',
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
      enabled: () => onTimers() && timer()?.state !== 'idle',
      run: withTimer((id) => app.edit(restartTimer(app.data.peek(), id, now()), 'Restart')),
    },
    {
      id: 'timer.cancel',
      title: 'Cancel Timer',
      description: 'Stop the selected timer and put it back to its full length.',
      group: 'Clock',
      enabled: () => onTimers() && timer()?.state !== 'idle',
      run: withTimer((id) => {
        const t = timer();
        const word = t && isFinished(t, now()) ? 'Dismissed' : 'Cancelled';
        app.edit(resetTimer(app.data.peek(), id), 'Cancel', `${word} ${app.describeTimer(t!)}.`);
      }),
    },
    {
      id: 'timer.savePreset',
      title: 'Save Timer as Preset',
      description: 'Keep the selected timer’s length and label as a preset.',
      group: 'Clock',
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
      enabled: () =>
        app.data.value.timers.some((t) => t.state === 'running' && !isFinished(t, app.clock.value)),
      run: () => void app.edit(pauseAllTimers(app.data.peek(), now()), 'Pause all', 'Paused all timers.'),
    },
    {
      id: 'preset.start',
      title: 'Start Preset',
      description: 'Start a timer from the preset.',
      group: 'Clock',
      hidden: true,
      enabled: () => preset() !== null,
      run: () => startPreset(app, preset()!.id),
    },
    {
      id: 'preset.rename',
      title: 'Rename Preset…',
      description: 'Change the preset’s label.',
      group: 'Clock',
      hidden: true,
      enabled: () => preset() !== null,
      run: () => app.open({ kind: 'renamePreset', id: preset()!.id }),
    },
    {
      id: 'preset.delete',
      title: 'Delete Preset',
      description: 'Remove the preset.',
      group: 'Clock',
      hidden: true,
      danger: true,
      enabled: () => preset() !== null,
      run: () => deletePresetFrom(app, preset()!.id),
    },
    {
      id: 'lap.copy',
      title: 'Copy Lap Time',
      description: 'Copy the lap’s time, to paste somewhere else.',
      group: 'Clock',
      hidden: true,
      enabled: () => lap() !== null,
      run: () => {
        const n = Number(targetOf(app.itemMenu, 'lap'));
        const text = formatStopwatch(lap()!);
        void navigator.clipboard.writeText(text).then(
          () => app.say(`Copied Lap ${n + 1}, ${text}.`),
          () => app.say('Alarmony couldn’t copy to the clipboard.', { tone: 'error' }),
        );
      },
    },
    {
      id: 'ringing.snooze',
      title: 'Snooze',
      description: 'Ring the alarm again in a few minutes (Settings has how many).',
      group: 'Clock',
      shortcuts: ['s'],
      global: true,
      enabled: () => app.ringing.value.some((r) => r.snooze),
      run: () => app.snoozeFirst(),
    },
    {
      id: 'ringing.stop',
      title: 'Stop Ringing',
      description: 'Stop every alarm and timer ringing now.',
      group: 'Clock',
      global: true,
      enabled: () => app.ringing.value.length > 0,
      run: () => app.stopAll(),
    },

    // Help
    {
      id: 'help.shortcuts',
      title: 'Keyboard Shortcuts',
      description: 'List every shortcut.',
      group: 'Help',
      shortcuts: ['mod+/'],
      keywords: 'keys help',
      run: () => app.open({ kind: 'shortcuts' }),
    },
  ];
}

export function buildCommands(app: AppController): CommandCatalog {
  const catalog = new CommandCatalog(commandSpecs(app));
  // With a dialog, the ringing sheet or a save question in front, only global commands run (PRD §14).
  catalog.gate = (c) => c.global === true || !app.blocked();
  return catalog;
}

/** Entries ⌘K finds besides the commands: the presets, each starting a timer. */
export function dynamicEntries(app: AppController): (MenuEntry & { readonly run: () => void })[] {
  return app.data.peek().presets.map((p) => ({
    id: `preset:${p.id}`,
    title: `Start ${p.label || 'Timer'} (${describeDuration(p.ms)})`,
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
