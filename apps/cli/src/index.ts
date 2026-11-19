/** The `alarmony` command tree (PRD §12). */
import { alarmCommands } from './commands/alarms.ts';
import { clockCommands } from './commands/clocks.ts';
import { referenceCommands } from './commands/reference.ts';
import { stopwatchCommand } from './commands/stopwatch.ts';
import { timerCommands } from './commands/timers.ts';
import type { CommandSpec } from './spec.ts';

export const ROOT: CommandSpec = {
  name: 'alarmony',
  description:
    "The world clocks, alarms, timers and stopwatch in Alarmony's clock.json. The apps pick up every change.",
  subcommands: [
    ...clockCommands,
    ...alarmCommands,
    ...timerCommands,
    stopwatchCommand,
    ...referenceCommands(),
  ],
};
