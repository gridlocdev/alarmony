/**
 * World clocks (PRD §6): naming a zone, finding one by what a person types, and how a place's time compares with
 * this device's. Zone rules come from the system through Intl.
 */
import type { WorldClock } from './format.ts';
import { knownZone, offsetAt, wallAt, type Wall } from './zoneTime.ts';

const MINUTE = 60_000;

/** "New York" from `America/New_York`, "Buenos Aires" from `America/Argentina/Buenos_Aires`. */
export function zoneCity(zone: string): string {
  return (zone.split('/').pop() ?? zone).replace(/_/g, ' ');
}

/** "America" from `America/New_York`; empty for `UTC`. */
export function zoneRegion(zone: string): string {
  const parts = zone.split('/');
  return parts.length > 1 ? (parts[0] ?? '').replace(/_/g, ' ') : '';
}

/** What a clock is called: its label, or its city. */
export function clockName(clock: WorldClock): string {
  return clock.label || zoneCity(clock.zone);
}

/** "UTC", "UTC+9", "UTC−5", "UTC+5:30". */
export function offsetText(offsetMs: number): string {
  if (offsetMs === 0) return 'UTC';
  const minutes = Math.round(Math.abs(offsetMs) / MINUTE);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `UTC${offsetMs < 0 ? '−' : '+'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** Every zone the system knows, plus UTC (PRD §3.2). */
export function systemZones(): readonly string[] {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return zones.includes('UTC') ? zones : [...zones, 'UTC'];
}

const abbrFormatters = new Map<string, Intl.DateTimeFormat>();

/** The short name the system gives the zone at `at` ("EST", "GMT+9"), or empty. */
function zoneAbbr(zone: string, at: number): string {
  let f = abbrFormatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' });
    abbrFormatters.set(zone, f);
  }
  return f.formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? '';
}

/** Lower case with accents taken off, for matching ("São Paulo" → "sao paulo"). */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export interface ZoneChoice {
  readonly zone: string;
  readonly city: string;
  readonly region: string;
  readonly offset: number;
  /** "America · UTC−5". */
  readonly detail: string;
  /** City, region, zone id and abbreviation, folded, for matching. */
  readonly key: string;
}

/** The zones as a person picks them: west to east, then by city. */
export function zoneChoices(zones: readonly string[], at: number): readonly ZoneChoice[] {
  return zones
    .filter(knownZone)
    .map((zone) => {
      const city = zoneCity(zone);
      const region = zoneRegion(zone);
      const offset = offsetAt(at, zone);
      const detail = [region, offsetText(offset)].filter(Boolean).join(' · ');
      return {
        zone,
        city,
        region,
        offset,
        detail,
        key: fold(`${city} ${region} ${zone} ${zoneAbbr(zone, at)}`),
      };
    })
    .sort((a, b) => a.offset - b.offset || a.city.localeCompare(b.city));
}

/** With nothing typed, the list starts at the zones on the same offset as here and runs east, wrapping round (PRD §6.1). */
export function fromHere(choices: readonly ZoneChoice[], here: number): readonly ZoneChoice[] {
  const at = choices.findIndex((c) => c.offset >= here);
  return at <= 0 ? choices : [...choices.slice(at), ...choices.slice(0, at)];
}

/** The choices that match every word typed; cities that start with what was typed come first (PRD §6.1). */
export function searchZones(choices: readonly ZoneChoice[], query: string): readonly ZoneChoice[] {
  const q = fold(query.trim());
  if (!q) return choices;
  const words = q.split(/\s+/);
  const hits = choices.filter((c) => words.every((w) => c.key.includes(w)));
  const starts = (c: ZoneChoice) => fold(c.city).startsWith(q);
  return [...hits.filter(starts), ...hits.filter((c) => !starts(c))];
}

const dayNumber = (w: Wall) => Date.UTC(w.year, w.month - 1, w.day) / 86_400_000;

/** "Today, +9 hrs", "Yesterday, −8 hrs", "Tomorrow, +13:30 hrs", "Today, same time" (PRD §6.2). */
export function compareToHere(at: number, zone: string, here: string): string {
  const days = dayNumber(wallAt(at, zone)) - dayNumber(wallAt(at, here));
  const day = days === 0 ? 'Today' : days > 0 ? 'Tomorrow' : 'Yesterday';
  const diff = offsetAt(at, zone) - offsetAt(at, here);
  if (diff === 0) return `${day}, same time`;
  const minutes = Math.round(Math.abs(diff) / MINUTE);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const amount = m ? `${h}:${String(m).padStart(2, '0')}` : String(h);
  return `${day}, ${diff < 0 ? '−' : '+'}${amount} ${h === 1 && !m ? 'hr' : 'hrs'}`;
}

/** Daytime is 06:00–17:59 in that place: the face is light then (PRD §6.2). */
export function isDaytime(at: number, zone: string): boolean {
  const { hour } = wallAt(at, zone);
  return hour >= 6 && hour < 18;
}

/** Hour, minute and second hand angles in degrees for the wall clock in `zone` at `at`. */
export function handAngles(at: number, zone: string): { hour: number; minute: number; second: number } {
  const w = wallAt(at, zone);
  const second = Math.floor((((at % MINUTE) + MINUTE) % MINUTE) / 1000);
  return {
    hour: ((w.hour % 12) + w.minute / 60) * 30,
    minute: (w.minute + second / 60) * 6,
    second: second * 6,
  };
}
