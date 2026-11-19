/** `stopwatch [start|stop|lap|reset]` (PRD §12, §8.1). */
import {
  MAX_LAPS,
  canReset,
  lapStopwatch,
  resetStopwatch,
  toggleStopwatch,
  type ClockData,
  type Op,
} from '@alarmony/core';
import type { Context } from '../context.ts';
import { CliError, EXIT_OK } from '../errors.ts';
import type { CommandSpec } from '../spec.ts';
import { load, save } from '../store.ts';
import { stopwatchText, stopwatchView } from '../view.ts';

async function show(ctx: Context): Promise<number> {
  const { data } = await load(ctx);
  const now = ctx.io.now();
  ctx.reply({ stopwatch: stopwatchView(data.stopwatch, now) }, stopwatchText(data.stopwatch, now));
  return EXIT_OK;
}

/** One stopwatch action; `edit` returns the operations, or null when there is nothing to do. */
function action(
  name: string,
  description: string,
  edit: (data: ClockData, now: number) => Op[] | null,
  said: string,
): CommandSpec {
  return {
    name,
    description,
    run: async (_p, ctx) => {
      const loaded = await load(ctx);
      const now = ctx.io.now();
      const ops = edit(loaded.data, now);
      const { data, merged } = await save(ctx, loaded, ops ?? []);
      const v = stopwatchView(data.stopwatch, now);
      ctx.reply(
        { stopwatch: v, changed: !!ops?.length, merged },
        `${ops?.length ? said : 'Already at zero.'} ${v.elapsed}`,
      );
      return EXIT_OK;
    },
  };
}

export const stopwatchCommand: CommandSpec = {
  name: 'stopwatch',
  description: 'Show the stopwatch and its laps, or start, stop, lap or reset it',
  run: async (_p, ctx) => show(ctx),
  subcommands: [
    action(
      'start',
      'Start or carry on',
      (d, now) => {
        if (d.stopwatch.state === 'running') throw new CliError('The stopwatch is already running.');
        return toggleStopwatch(d, now);
      },
      'Started at',
    ),
    action(
      'stop',
      'Stop it',
      (d, now) => {
        if (d.stopwatch.state !== 'running') throw new CliError("The stopwatch isn't running.");
        return toggleStopwatch(d, now);
      },
      'Stopped at',
    ),
    action(
      'lap',
      'Mark a lap while it runs',
      (d, now) => {
        if (d.stopwatch.state !== 'running') throw new CliError('Lap needs a running stopwatch.');
        if (d.stopwatch.laps.length >= MAX_LAPS) throw new CliError('The lap list is full.');
        return lapStopwatch(d, now);
      },
      'Lap at',
    ),
    action(
      'reset',
      'Back to zero, laps and all (stop it first)',
      (d) => {
        if (d.stopwatch.state === 'running') throw new CliError('Stop the stopwatch before resetting it.');
        return canReset(d.stopwatch) ? resetStopwatch(d) : null;
      },
      'Reset to',
    ),
  ],
};
