// World clocks: names, search, comparing with this device, and the clock edits (PRD §6).
import { describe, expect, it } from 'vitest';
import {
  addClock,
  applyOps,
  compareToHere,
  deleteClock,
  emptyData,
  fromHere,
  handAngles,
  invertOps,
  isDaytime,
  moveClock,
  moveClockBeside,
  offsetText,
  renameClock,
  searchZones,
  systemZones,
  zoneChoices,
  zoneCity,
  zoneRegion,
} from '../src/index.ts';

const AT = Date.UTC(2027, 0, 15, 9, 0); // Friday 15 January 2027, 09:00 UTC

describe('zone names', () => {
  it('names a zone by its city and region', () => {
    expect(zoneCity('America/New_York')).toBe('New York');
    expect(zoneCity('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(zoneRegion('America/Argentina/Buenos_Aires')).toBe('America');
    expect(zoneCity('UTC')).toBe('UTC');
    expect(zoneRegion('UTC')).toBe('');
  });

  it('writes offsets with a real minus sign and minutes only when there are some', () => {
    expect(offsetText(0)).toBe('UTC');
    expect(offsetText(9 * 3_600_000)).toBe('UTC+9');
    expect(offsetText(-5 * 3_600_000)).toBe('UTC−5');
    expect(offsetText(5.5 * 3_600_000)).toBe('UTC+5:30');
  });
});

describe('searchZones', () => {
  const choices = zoneChoices(systemZones(), AT);

  it('lists every zone the system knows, plus UTC, west to east', () => {
    expect(choices.some((c) => c.zone === 'UTC')).toBe(true);
    expect(choices.length).toBeGreaterThan(300);
    expect(choices.every((c, i) => i === 0 || choices[i - 1]!.offset <= c.offset)).toBe(true);
  });

  it('starts the unsearched list at the zones here and wraps round to the far west', () => {
    const tokyo = 9 * 3_600_000;
    const list = fromHere(choices, tokyo);
    expect(list).toHaveLength(choices.length);
    expect(list[0]?.offset).toBe(tokyo);
    expect(list.at(-1)!.offset).toBeLessThan(tokyo);
    expect(fromHere(choices, -100 * 3_600_000)).toBe(choices);
  });

  it('matches city, region and abbreviation, ignoring case and accents', () => {
    expect(searchZones(choices, 'tokyo')[0]?.zone).toBe('Asia/Tokyo');
    expect(searchZones(choices, 'sao paulo')[0]?.zone).toBe('America/Sao_Paulo');
    expect(searchZones(choices, 'NEW YORK')[0]?.detail).toBe('America · UTC−5');
    expect(searchZones(choices, 'est').some((c) => c.zone === 'America/New_York')).toBe(true);
  });

  it('puts cities that start with the words first', () => {
    const hits = searchZones(choices, 'san');
    expect(hits[0]?.city.toLowerCase().startsWith('san')).toBe(true);
  });
});

describe('compareToHere', () => {
  it('says the day and the difference', () => {
    expect(compareToHere(AT, 'Asia/Tokyo', 'UTC')).toBe('Today, +9 hrs');
    expect(compareToHere(AT, 'America/Los_Angeles', 'UTC')).toBe('Today, −8 hrs');
    expect(compareToHere(AT, 'Asia/Kolkata', 'UTC')).toBe('Today, +5:30 hrs');
    expect(compareToHere(AT, 'Europe/London', 'UTC')).toBe('Today, same time');
    expect(compareToHere(AT, 'Europe/Paris', 'UTC')).toBe('Today, +1 hr');
    const lateEvening = Date.UTC(2027, 0, 15, 20, 0);
    expect(compareToHere(lateEvening, 'Pacific/Auckland', 'America/Los_Angeles')).toBe('Tomorrow, +21 hrs');
    expect(compareToHere(lateEvening, 'America/Los_Angeles', 'Pacific/Auckland')).toBe('Yesterday, −21 hrs');
  });

  it('knows day from night, and where the hands point', () => {
    expect(isDaytime(AT, 'UTC')).toBe(true);
    expect(isDaytime(AT, 'Asia/Tokyo')).toBe(false);
    expect(handAngles(Date.UTC(2027, 0, 15, 15, 30, 15), 'UTC')).toEqual({
      hour: 105,
      minute: 181.5,
      second: 90,
    });
  });
});

describe('clock edits', () => {
  const start = emptyData('UTC');

  it('adds a zone once, renames, moves and deletes, and each undoes', () => {
    const add = addClock(start, 'c_2', 'Asia/Tokyo')!;
    const two = applyOps(start, add);
    expect(two.clocks.map((c) => c.zone)).toEqual(['UTC', 'Asia/Tokyo']);
    expect(addClock(two, 'c_3', 'Asia/Tokyo')).toBeNull();

    const renamed = applyOps(two, renameClock(two, 'c_2', '  Office  ')!);
    expect(renamed.clocks[1]!.label).toBe('Office');
    expect(renameClock(renamed, 'c_2', 'Office')).toBeNull();

    expect(moveClock(renamed, 'c_2', 1)).toBeNull();
    const move = moveClock(renamed, 'c_2', -1)!;
    const moved = applyOps(renamed, move);
    expect(moved.clocks.map((c) => c.id)).toEqual(['c_2', 'c_local']);
    expect(applyOps(moved, invertOps(move)).clocks.map((c) => c.id)).toEqual(['c_local', 'c_2']);

    const del = deleteClock(moved, 'c_local')!;
    // Dragging onto a clock puts it on that side of it; onto its own place, nothing.
    const three = applyOps(moved, addClock(moved, 'c_3', 'Europe/Paris')!);
    const order = (ops: ReturnType<typeof moveClockBeside>) =>
      applyOps(three, ops ?? []).clocks.map((c) => c.id);
    expect(order(moveClockBeside(three, 'c_2', 'c_3', true))).toEqual(['c_local', 'c_3', 'c_2']);
    expect(order(moveClockBeside(three, 'c_2', 'c_3', false))).toEqual(['c_local', 'c_2', 'c_3']);
    expect(order(moveClockBeside(three, 'c_3', 'c_2', false))).toEqual(['c_3', 'c_2', 'c_local']);
    expect(order(moveClockBeside(three, 'c_3', 'c_local', true))).toEqual(['c_2', 'c_local', 'c_3']);
    expect(moveClockBeside(three, 'c_2', 'c_local', false)).toBeNull();
    expect(moveClockBeside(three, 'c_2', 'c_2', true)).toBeNull();
    expect(moveClockBeside(three, 'c_2', 'gone', true)).toBeNull();
    const one = applyOps(moved, del);
    expect(one.clocks.map((c) => c.id)).toEqual(['c_2']);
    expect(applyOps(one, invertOps(del))).toEqual(moved);
  });
});
