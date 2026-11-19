/** `clocks`, `clock add`, `clock remove` (PRD §12, §6.1). */
import {
  addClock,
  clockName,
  deleteClock,
  fold,
  knownZone,
  newId,
  searchZones,
  systemZones,
  zoneChoices,
  type ClockData,
  type WorldClock,
} from '@alarmony/core';
import type { Context } from '../context.ts';
import { CliError, EXIT_OK } from '../errors.ts';
import { findOne } from '../find.ts';
import type { CommandSpec } from '../spec.ts';
import { load, save } from '../store.ts';
import { clockLine, clockView, table } from '../view.ts';

export function takenIds(data: ClockData): Set<string> {
  return new Set([...data.clocks, ...data.alarms, ...data.timers, ...data.presets].map((i) => i.id));
}

/** A typed zone id, or the one place a city or abbreviation names (PRD §6.1). */
export function pickZone(query: string, now: number): string {
  const q = query.trim();
  const exact = systemZones().find((z) => z.toLowerCase() === q.toLowerCase());
  if (exact) return exact;
  if (knownZone(q) && q.includes('/')) return q;
  const hits = searchZones(zoneChoices(systemZones(), now), q);
  if (!q || !hits.length) throw new CliError(`No time zone matches “${query}”.`);
  const cities = hits.filter((h) => fold(h.city) === fold(q));
  const pick = cities.length === 1 ? cities[0] : hits.length === 1 ? hits[0] : undefined;
  if (pick) return pick.zone;
  const shown = hits.slice(0, 20).map((h) => `  ${h.zone}  ${h.city} (${h.detail})`);
  const more = hits.length > 20 ? [`  …and ${hits.length - 20} more`] : [];
  throw new CliError(
    `“${query}” matches ${hits.length} time zones:\n${[...shown, ...more].join('\n')}\nName one by its zone id.`,
  );
}

function clockSearch(data: ClockData, ctx: Context) {
  const now = ctx.io.now();
  return {
    what: 'clock',
    items: data.clocks,
    names: (c: WorldClock) => [clockName(c), c.zone],
    line: (c: WorldClock) => clockLine(c, now, ctx.io.zone).slice(1).join('  '),
  };
}

export const clockCommands: CommandSpec[] = [
  {
    name: 'clocks',
    description: 'List the world clocks with the time there now',
    run: async (_p, ctx) => {
      const { data } = await load(ctx);
      const now = ctx.io.now();
      ctx.reply(
        { clocks: data.clocks.map((c) => clockView(c, now, ctx.io.zone)) },
        data.clocks.length
          ? table(data.clocks.map((c) => clockLine(c, now, ctx.io.zone)))
          : 'No clocks. Add one with: alarmony clock add <city>',
      );
      return EXIT_OK;
    },
  },
  {
    name: 'clock',
    description: 'Add or remove a world clock',
    subcommands: [
      {
        name: 'add',
        description: 'Add a clock for a time zone or a city (Tokyo, America/New_York, EST)',
        args: [{ name: 'place', description: 'A zone id, a city, a region or an abbreviation' }],
        run: async (p, ctx) => {
          const loaded = await load(ctx);
          const now = ctx.io.now();
          const zone = pickZone(p.arg('place'), now);
          const id = newId('c', takenIds(loaded.data));
          const ops = addClock(loaded.data, id, zone);
          if (!ops) {
            const there = loaded.data.clocks.find((c) => c.zone === zone);
            throw new CliError(`${there ? clockName(there) : zone} is already on the list.`);
          }
          const { data, merged } = await save(ctx, loaded, ops);
          const clock = data.clocks.find((c) => c.id === id) as WorldClock;
          const v = clockView(clock, now, ctx.io.zone);
          ctx.reply({ clock: v, merged }, `Added ${v.name} (${v.zone}), ${v.time} there. Id ${v.id}.`);
          return EXIT_OK;
        },
      },
      {
        name: 'remove',
        description: 'Remove a clock',
        args: [{ name: 'clock', description: "The clock's id, name or zone" }],
        run: async (p, ctx) => {
          const loaded = await load(ctx);
          const clock = findOne(p.arg('clock'), clockSearch(loaded.data, ctx));
          const { merged } = await save(ctx, loaded, deleteClock(loaded.data, clock.id) ?? []);
          const v = clockView(clock, ctx.io.now(), ctx.io.zone);
          ctx.reply({ deleted: v, merged }, `Removed ${v.name} (${v.zone}).`);
          return EXIT_OK;
        },
      },
    ],
  },
];
