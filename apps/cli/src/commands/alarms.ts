/** `alarms` and `alarm add|edit|on|off|delete` (PRD §12, §7). */
import {
  DEFAULT_SOUND,
  EVERY_DAY,
  SOUNDS,
  WEEKDAYS,
  WEEKENDS,
  addAlarm,
  alarmIsOn,
  deleteAlarm,
  editAlarm,
  fold,
  newId,
  parseAlarmTime,
  sortAlarms,
  toggleAlarm,
  type Alarm,
  type AlarmFields,
  type ClockData,
} from '@alarmony/core';
import type { Context } from '../context.ts';
import { CliError, EXIT_OK, UsageError } from '../errors.ts';
import { findOne } from '../find.ts';
import type { CommandSpec, OptionSpec, Parsed } from '../spec.ts';
import { load, save, type Loaded } from '../store.ts';
import { alarmLine, alarmView, table } from '../view.ts';
import { takenIds } from './clocks.ts';

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** `weekdays`, `weekends`, `daily`, `never`, or days such as `mon,wed,fri`. */
export function parseDays(text: string): number[] {
  const t = text.trim().toLowerCase();
  if (t === '' || t === 'never' || t === 'once') return [];
  if (t === 'daily' || t === 'everyday' || t === 'every day') return [...EVERY_DAY];
  if (t === 'weekdays') return [...WEEKDAYS];
  if (t === 'weekends') return [...WEEKENDS];
  return t
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((word) => {
      const n = word.length < 2 ? -1 : DAY_NAMES.findIndex((d) => d.startsWith(word));
      if (n < 0)
        throw new CliError(
          `“${text}” isn't a repeat. Use weekdays, weekends, daily, never, or days like mon,wed,fri.`,
        );
      return n + 1;
    });
}

function parseTime(text: string): string {
  const time = parseAlarmTime(text);
  if (!time) throw new CliError(`“${text}” isn't a time. Try 7, 7:30, 730, 7:30 pm or 19:30.`);
  return time;
}

function parseSound(text: string): string {
  const s = SOUNDS.find((x) => x.id === fold(text.trim()) || fold(x.name) === fold(text.trim()));
  if (!s) throw new CliError(`No sound “${text}”. The sounds are ${SOUNDS.map((x) => x.id).join(', ')}.`);
  return s.id;
}

const FIELD_OPTIONS: OptionSpec[] = [
  {
    name: '--days',
    kind: 'value',
    value: 'days',
    description: 'weekdays, weekends, daily, never, or days like mon,wed (default: never, rings once)',
  },
  { name: '--label', kind: 'value', value: 'text', description: 'A label' },
  {
    name: '--sound',
    kind: 'value',
    value: 'sound',
    description: `One of ${SOUNDS.map((s) => s.id).join(', ')}`,
  },
  { name: '--no-snooze', kind: 'switch', description: "Don't offer Snooze when it rings" },
];

/** The fields the options set, for an edit; nothing for options not given. */
function patchFrom(p: Parsed): Partial<{ -readonly [K in keyof AlarmFields]: AlarmFields[K] }> {
  const patch: Partial<{ -readonly [K in keyof AlarmFields]: AlarmFields[K] }> = {};
  const time = p.str('--time');
  if (time !== null) patch.time = parseTime(time);
  const days = p.str('--days');
  if (days !== null) patch.days = parseDays(days);
  const label = p.str('--label');
  if (label !== null) patch.label = label;
  const sound = p.str('--sound');
  if (sound !== null) patch.sound = parseSound(sound);
  if (p.has('--snooze') && p.has('--no-snooze'))
    throw new UsageError('Give --snooze or --no-snooze, not both.');
  if (p.has('--snooze')) patch.snooze = true;
  if (p.has('--no-snooze')) patch.snooze = false;
  return patch;
}

function alarmSearch(data: ClockData, ctx: Context) {
  const now = ctx.io.now();
  return {
    what: 'alarm',
    items: data.alarms,
    names: (a: Alarm) => [a.label, a.time],
    line: (a: Alarm) => alarmLine(a, now, ctx.io.zone).slice(1).join('  '),
  };
}

function describe(a: Alarm, ctx: Context): string {
  const v = alarmView(a, ctx.io.now(), ctx.io.zone);
  return `${v.time}${v.label ? ` ${v.label}` : ''}, ${v.repeat.toLowerCase()}`;
}

async function saved(ctx: Context, loaded: Loaded, ops: Parameters<typeof save>[2], id: string) {
  const { data, merged } = await save(ctx, loaded, ops);
  return { alarm: data.alarms.find((a) => a.id === id) as Alarm, merged };
}

function switchCommand(on: boolean): CommandSpec {
  return {
    name: on ? 'on' : 'off',
    description: on ? 'Turn an alarm on' : 'Turn an alarm off',
    args: [{ name: 'alarm', description: "The alarm's id, label or time" }],
    run: async (p, ctx) => {
      const loaded = await load(ctx);
      const now = ctx.io.now();
      const found = findOne(p.arg('alarm'), alarmSearch(loaded.data, ctx));
      const ops =
        alarmIsOn(found, now, ctx.io.zone) === on
          ? []
          : (toggleAlarm(loaded.data, found.id, now, ctx.io.zone) ?? []);
      const { alarm, merged } = await saved(ctx, loaded, ops, found.id);
      const v = alarmView(alarm, now, ctx.io.zone);
      const already = ops.length ? '' : 'already ';
      ctx.reply(
        { alarm: v, changed: ops.length > 0, merged },
        `${describe(alarm, ctx)}: ${already}${on ? 'on' : 'off'}.`,
      );
      return EXIT_OK;
    },
  };
}

export const alarmCommands: CommandSpec[] = [
  {
    name: 'alarms',
    description: 'List the alarms: id, time, on/off, repeat, label and when each is next due',
    run: async (_p, ctx) => {
      const { data } = await load(ctx);
      const now = ctx.io.now();
      const alarms = sortAlarms(data.alarms);
      ctx.reply(
        { alarms: alarms.map((a) => alarmView(a, now, ctx.io.zone)) },
        alarms.length
          ? table(alarms.map((a) => alarmLine(a, now, ctx.io.zone)))
          : 'No alarms. Add one with: alarmony alarm add 7:30',
      );
      return EXIT_OK;
    },
  },
  {
    name: 'alarm',
    description: 'Add, change, switch or delete an alarm',
    subcommands: [
      {
        name: 'add',
        description: 'Add an alarm, turned on',
        args: [{ name: 'time', description: 'When it rings: 7, 7:30, 730, 7:30 pm, 19:30' }],
        options: FIELD_OPTIONS,
        run: async (p, ctx) => {
          const loaded = await load(ctx);
          const patch = patchFrom(p);
          const fields: AlarmFields = {
            time: parseTime(p.arg('time')),
            days: patch.days ?? [],
            label: patch.label ?? '',
            sound: patch.sound ?? DEFAULT_SOUND,
            snooze: patch.snooze ?? true,
          };
          const id = newId('a', takenIds(loaded.data));
          const ops = addAlarm(loaded.data, id, fields, ctx.io.now(), ctx.io.zone);
          const { alarm, merged } = await saved(ctx, loaded, ops, id);
          ctx.reply(
            { alarm: alarmView(alarm, ctx.io.now(), ctx.io.zone), merged },
            `Added alarm ${describe(alarm, ctx)}. Id ${id}.`,
          );
          return EXIT_OK;
        },
      },
      {
        name: 'edit',
        description: "Change an alarm's time, days, label, sound or snooze",
        args: [{ name: 'alarm', description: "The alarm's id, label or time" }],
        options: [
          { name: '--time', kind: 'value', value: 'time', description: 'A new time' },
          ...FIELD_OPTIONS,
          { name: '--snooze', kind: 'switch', description: 'Offer Snooze when it rings' },
        ],
        run: async (p, ctx) => {
          const patch = patchFrom(p);
          if (!Object.keys(patch).length)
            throw new UsageError(
              'Nothing to change: give --time, --days, --label, --sound, --snooze or --no-snooze.',
            );
          const loaded = await load(ctx);
          const found = findOne(p.arg('alarm'), alarmSearch(loaded.data, ctx));
          const ops = editAlarm(loaded.data, found.id, patch, ctx.io.now(), ctx.io.zone) ?? [];
          const { alarm, merged } = await saved(ctx, loaded, ops, found.id);
          ctx.reply(
            { alarm: alarmView(alarm, ctx.io.now(), ctx.io.zone), merged },
            `Changed alarm ${describe(alarm, ctx)}.`,
          );
          return EXIT_OK;
        },
      },
      switchCommand(true),
      switchCommand(false),
      {
        name: 'delete',
        description: 'Delete an alarm',
        args: [{ name: 'alarm', description: "The alarm's id, label or time" }],
        run: async (p, ctx) => {
          const loaded = await load(ctx);
          const found = findOne(p.arg('alarm'), alarmSearch(loaded.data, ctx));
          const { merged } = await save(ctx, loaded, deleteAlarm(loaded.data, found.id) ?? []);
          ctx.reply(
            { deleted: alarmView(found, ctx.io.now(), ctx.io.zone), merged },
            `Deleted alarm ${describe(found, ctx)}.`,
          );
          return EXIT_OK;
        },
      },
    ],
  },
];
