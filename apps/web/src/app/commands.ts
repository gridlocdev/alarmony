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
  toggleStopwatch,
  toggleTimer,
} from '@alarmony/core';
import { CommandCatalog, type CommandSpec, type MenuEntry } from '@alarmony/ui';
import { TABS, type AppController } from './controller.ts';

const TAB_KEYS: Record<string, string> = {
  world: 'mod+1',
  alarms: 'mod+2',
  stopwatch: 'mod+3',
  timers: 'mod+4',
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
      id: 'view.commandMenu',
      title: 'Command Menu…',
      description: 'Find and run any command by typing its name.',
      group: 'View',
      shortcuts: ['mod+k'],
      global: true,
      hidden: true,
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
      context: true,
      enabled: onWorld,
      run: withClock((id) => app.open({ kind: 'renameClock', id })),
    },
    {
      id: 'clock.moveUp',
      title: 'Move Clock Up',
      description: 'Move the selected clock one place earlier.',
      group: 'Clock',
      shortcuts: ['alt+up'],
      context: true,
      enabled: () => onWorld() && app.data.value.clocks[0]?.id !== clock()?.id,
      run: withClock((id) => app.edit(moveClock(app.data.peek(), id, -1), 'Move')),
    },
    {
      id: 'clock.moveDown',
      title: 'Move Clock Down',
      description: 'Move the selected clock one place later.',
      group: 'Clock',
      shortcuts: ['alt+down'],
      context: true,
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
      context: true,
      danger: true,
      enabled: onWorld,
      run: withClock((id) => {
        const name = clockName(clock()!);
        app.edit(deleteClock(app.data.peek(), id), 'Delete', `Deleted ${name}.`);
      }),
    },
    {
      id: 'alarm.toggle',
      title: 'Turn Alarm On or Off',
      description: 'Switch the selected alarm on or off.',
      group: 'Clock',
      shortcuts: ['space'],
      keysOnly: true,
      context: true,
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
      context: true,
      enabled: onAlarms,
      run: withAlarm((id) => app.open({ kind: 'editAlarm', id })),
    },
    {
      id: 'alarm.duplicate',
      title: 'Duplicate Alarm',
      description: 'Add a copy of the selected alarm.',
      group: 'Clock',
      context: true,
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
      context: true,
      danger: true,
      enabled: onAlarms,
      run: withAlarm((id) => {
        const name = alarmName();
        app.edit(deleteAlarm(app.data.peek(), id), 'Delete', `Deleted ${name}.`);
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
      context: true,
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
      context: true,
      enabled: onTimers,
      run: withTimer((id) => app.open({ kind: 'editTimer', id })),
    },
    {
      id: 'timer.restart',
      title: 'Restart Timer',
      description: 'Start the selected timer again from its full length.',
      group: 'Clock',
      context: true,
      enabled: () => onTimers() && timer()?.state !== 'idle',
      run: withTimer((id) => app.edit(restartTimer(app.data.peek(), id, now()), 'Restart')),
    },
    {
      id: 'timer.cancel',
      title: 'Cancel Timer',
      description: 'Stop the selected timer and put it back to its full length.',
      group: 'Clock',
      context: true,
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
      context: true,
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
      context: true,
      danger: true,
      enabled: onTimers,
      run: withTimer((id) => {
        const t = timer()!;
        app.edit(deleteTimer(app.data.peek(), id), 'Delete', `Deleted ${app.describeTimer(t)}.`);
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
  app.showTab('timers');
  const id = app.newId('t');
  if (app.edit(addTimer(app.data.peek(), { id, ms: p.ms, label: p.label }, app.now()), 'New timer'))
    app.selected.value = id;
}
