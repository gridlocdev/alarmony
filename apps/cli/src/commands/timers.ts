/** `timers`, `timer start|pause|resume|cancel|delete`, `presets`, `preset add|delete` (PRD §12, §8.2). */
import {
  addPreset,
  addTimer,
  deletePreset,
  deleteTimer,
  formatCountdown,
  isDone,
  newId,
  parseDuration,
  pauseTimer,
  resetTimer,
  startTimer,
  timerLeft,
  type ClockData,
  type Op,
  type Preset,
  type Timer,
} from '@alarmony/core';
import type { Context } from '../context.ts';
import { CliError, EXIT_OK } from '../errors.ts';
import { findOne } from '../find.ts';
import type { CommandSpec, Parsed } from '../spec.ts';
import { load, save } from '../store.ts';
import { hhmm, presetView, table, timerLine, timerView } from '../view.ts';
import { takenIds } from './clocks.ts';

function parseLength(text: string): number {
  const ms = parseDuration(text);
  if (ms === null)
    throw new CliError(
      `“${text}” isn't a duration from 1 second to 99:59:59. Try 5 (minutes), 5m, 1h30m, 90s, 25:00 or 1:30:00.`,
    );
  return ms;
}

const timerName = (t: Timer) => t.label || `${formatCountdown(t.ms)} timer`;

/** One timer action, searching only the timers it can act on. */
function timerAction(
  name: string,
  description: string,
  what: string,
  canAct: (t: Timer, now: number) => boolean,
  edit: (data: ClockData, t: Timer, now: number) => Op[] | null,
  done: string,
): CommandSpec {
  return {
    name,
    description,
    args: [{ name: 'timer', description: "The timer's id or label" }],
    run: async (p, ctx) => {
      const loaded = await load(ctx);
      const now = ctx.io.now();
      const timer = findOne(p.arg('timer'), {
        what,
        items: loaded.data.timers.filter((t) => canAct(t, now)),
        names: (t) => [t.label],
        line: (t) => timerLine(t, now, ctx.io.zone).slice(1).join('  '),
      });
      const { data, merged } = await save(ctx, loaded, edit(loaded.data, timer, now) ?? []);
      const after = data.timers.find((t) => t.id === timer.id);
      const v = timerView(after ?? timer, now);
      ctx.reply(
        name === 'delete' ? { deleted: v, merged } : { timer: v, merged },
        `${done} ${timerName(timer)}.`,
      );
      return EXIT_OK;
    },
  };
}

/** `--wait`: count down in the terminal, following the file, and ring the bell at the end. */
async function waitFor(ctx: Context, id: string): Promise<{ timer: Timer | null; finished: boolean }> {
  const { io } = ctx;
  let last: Timer | null = null;
  for (;;) {
    const { data } = await load(ctx);
    const now = io.now();
    const t = data.timers.find((x) => x.id === id) ?? null;
    if (!t || t.state === 'idle') {
      ctx.note(
        `\n${last ? timerName(last) : 'The timer'} was ${t ? 'cancelled' : 'deleted'} somewhere else.`,
      );
      return { timer: t, finished: false };
    }
    last = t;
    if (isDone(t, now)) {
      io.stderr(`\r${timerName(t)} is done.\u0007\n`);
      return { timer: t, finished: true };
    }
    const left = timerLeft(t, now);
    io.stderr(`\r${formatCountdown(left)} left${t.state === 'paused' ? ' (paused)' : ''}   `);
    // Wake as the shown second changes.
    const step = t.state === 'paused' ? 1000 : Math.ceil(left % 1000) || 1000;
    if (!(await io.wait(step))) {
      ctx.note('\nThe timer keeps running in clock.json.');
      return { timer: t, finished: false };
    }
  }
}

async function startNew(p: Parsed, ctx: Context): Promise<number> {
  const loaded = await load(ctx);
  const ms = parseLength(p.arg('duration'));
  const id = newId('t', takenIds(loaded.data));
  const now = ctx.io.now();
  const { data, merged } = await save(
    ctx,
    loaded,
    addTimer(loaded.data, { id, ms, label: p.str('--label') ?? '' }, now),
  );
  const timer = data.timers.find((t) => t.id === id) as Timer;
  const ends = hhmm(Date.parse(timer.endsAt ?? ''), ctx.io.zone);
  if (!p.has('--wait')) {
    ctx.reply(
      { timer: timerView(timer, now), merged },
      `Started ${timerName(timer)}, ends ${ends}. Id ${id}.`,
    );
    return EXIT_OK;
  }
  if (!ctx.json)
    ctx.note(
      `Started ${timerName(timer)}, ends ${ends}. Id ${id}. Ctrl-C stops waiting; the timer keeps running.`,
    );
  const r = await waitFor(ctx, id);
  ctx.reply(
    { timer: r.timer ? timerView(r.timer, ctx.io.now()) : null, finished: r.finished, merged },
    r.finished ? `${timerName(timer)} is done.` : '',
  );
  return EXIT_OK;
}

function presetSearch(data: ClockData) {
  return {
    what: 'preset',
    items: data.presets,
    names: (x: Preset) => [x.label],
    line: (x: Preset) => `${formatCountdown(x.ms)}  ${x.label}`,
  };
}

const running = (t: Timer, now: number) => t.state === 'running' && !isDone(t, now);

export const timerCommands: CommandSpec[] = [
  {
    name: 'timers',
    description: 'List the timers with the time left',
    run: async (_p, ctx) => {
      const { data } = await load(ctx);
      const now = ctx.io.now();
      ctx.reply(
        { timers: data.timers.map((t) => timerView(t, now)) },
        data.timers.length
          ? table(data.timers.map((t) => timerLine(t, now, ctx.io.zone)))
          : 'No timers. Start one with: alarmony timer start 5m',
      );
      return EXIT_OK;
    },
  },
  {
    name: 'timer',
    description: 'Start, pause, resume, cancel or delete a timer',
    subcommands: [
      {
        name: 'start',
        description: 'Start a new timer; the apps ring it when it ends',
        args: [{ name: 'duration', description: '5 (minutes), 5m, 1h30m, 90s, 25:00, 1:30:00' }],
        options: [
          { name: '--label', kind: 'value', value: 'text', description: 'A label' },
          {
            name: '--wait',
            kind: 'switch',
            description: 'Count down here and ring the terminal bell at the end (Ctrl-C leaves it running)',
          },
        ],
        run: startNew,
      },
      timerAction(
        'pause',
        'Pause a running timer',
        'running timer',
        running,
        (d, t, now) => pauseTimer(d, t.id, now),
        'Paused',
      ),
      timerAction(
        'resume',
        'Resume a paused timer, or start an idle one again',
        'paused or idle timer',
        (t) => t.state !== 'running',
        (d, t, now) => startTimer(d, t.id, now),
        'Resumed',
      ),
      timerAction(
        'cancel',
        'Stop a timer and set it back to its full length',
        'running or paused timer',
        (t) => t.state !== 'idle',
        (d, t) => resetTimer(d, t.id),
        'Cancelled',
      ),
      timerAction(
        'delete',
        'Delete a timer',
        'timer',
        () => true,
        (d, t) => deleteTimer(d, t.id),
        'Deleted',
      ),
    ],
  },
  {
    name: 'presets',
    description: 'List the timer presets',
    run: async (_p, ctx) => {
      const { data } = await load(ctx);
      ctx.reply(
        { presets: data.presets.map(presetView) },
        data.presets.length
          ? table(data.presets.map((x) => [x.id, formatCountdown(x.ms), x.label]))
          : 'No presets. Add one with: alarmony preset add 10m --label Tea',
      );
      return EXIT_OK;
    },
  },
  {
    name: 'preset',
    description: 'Add or delete a timer preset',
    subcommands: [
      {
        name: 'add',
        description: 'Add a preset',
        args: [{ name: 'duration', description: '5 (minutes), 5m, 1h30m, 90s, 25:00, 1:30:00' }],
        options: [{ name: '--label', kind: 'value', value: 'text', description: 'Its label (required)' }],
        run: async (p, ctx) => {
          const label = p.str('--label')?.trim() ?? '';
          if (!label) throw new CliError('A preset needs a label: --label <text>.');
          const ms = parseLength(p.arg('duration'));
          const loaded = await load(ctx);
          const id = newId('p', takenIds(loaded.data));
          const { data, merged } = await save(ctx, loaded, addPreset(loaded.data, { id, ms, label }));
          const preset = data.presets.find((x) => x.id === id) as Preset;
          ctx.reply(
            { preset: presetView(preset), merged },
            `Added preset ${preset.label}, ${formatCountdown(ms)}. Id ${id}.`,
          );
          return EXIT_OK;
        },
      },
      {
        name: 'delete',
        description: 'Delete a preset',
        args: [{ name: 'preset', description: "The preset's id or label" }],
        run: async (p, ctx) => {
          const loaded = await load(ctx);
          const preset = findOne(p.arg('preset'), presetSearch(loaded.data));
          const { merged } = await save(ctx, loaded, deletePreset(loaded.data, preset.id) ?? []);
          ctx.reply({ deleted: presetView(preset), merged }, `Deleted preset ${preset.label}.`);
          return EXIT_OK;
        },
      },
    ],
  },
];
