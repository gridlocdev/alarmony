import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { classifyFile, type ClockData } from '@alarmony/core';
import { runCli } from '../src/cli.ts';
import type { CliIo } from '../src/context.ts';
import { ROOT } from '../src/index.ts';
import { runnable } from '../src/spec.ts';

/** Runs the CLI in-process on a temp folder, a fixed clock (Thursday 2026-11-19 18:00 UTC) and UTC. */

const T0 = Date.parse('2026-11-19T18:00:00.000Z');

let dir: string;
let home: string;
let now: number;
let env: Record<string, string | undefined>;
/** Runs before each write; a test sets it to change the file the way another copy would. */
let beforeWrite: (() => Promise<void>) | undefined;
/** How many waits succeed before Ctrl-C; Infinity for none. */
let waitsLeft: number;
/** Runs on each wait, after the clock moves on. */
let onWait: (() => Promise<void>) | undefined;

/** clock.json as another copy edits it. */
interface RawFile {
  alarms: { label: string; time: string }[];
  timers: Record<string, unknown>[];
}

interface Result {
  readonly exit: number;
  readonly out: string;
  readonly err: string;
}

async function run(...argv: string[]): Promise<Result> {
  let out = '';
  let err = '';
  const io: CliIo = {
    stdout: (t) => void (out += t),
    stderr: (t) => void (err += t),
    env,
    platform: 'darwin',
    homeDir: home,
    zone: 'UTC',
    now: () => now,
    wait: async (ms) => {
      if (waitsLeft-- <= 0) return false;
      now += ms;
      await onWait?.();
      return true;
    },
    beforeWrite: async () => {
      const once = beforeWrite;
      beforeWrite = undefined;
      await once?.();
    },
  };
  const exit = await runCli(argv, io, '1.2.3');
  return { exit, out, err };
}

/** Runs on the temp folder, with --json, and reads the reply. */
async function json(...argv: string[]) {
  const r = await run(...argv, '--dir', dir, '--json');
  // Each test checks the fields of the reply it needs.
  const body = JSON.parse(r.out);
  return { ...r, body };
}

const cli = (...argv: string[]) => run(...argv, '--dir', dir);
const file = () => path.join(dir, 'clock.json');

async function readClock(): Promise<ClockData> {
  const read = classifyFile(await readFile(file(), 'utf8'));
  if (read.kind !== 'ok') throw new Error(read.kind);
  return read.data;
}

/** Another copy's edit: changes the file on disk directly. */
/** The first item of a list in the file, which the test put there. */
function first<T>(list: T[]): T {
  const item = list[0];
  if (item === undefined) throw new Error('the list is empty');
  return item;
}

async function editFile(change: (raw: RawFile) => void): Promise<void> {
  const raw = JSON.parse(await readFile(file(), 'utf8')) as RawFile;
  change(raw);
  await writeFile(file(), JSON.stringify(raw, null, 2) + '\n');
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'alarmony-cli-'));
  home = await mkdtemp(path.join(os.tmpdir(), 'alarmony-home-'));
  now = T0;
  env = {};
  beforeWrite = undefined;
  waitsLeft = Infinity;
  onWait = undefined;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

describe('the folder', () => {
  it('takes --dir, else ALARMONY_DIR, else the folder the desktop app remembers', async () => {
    await cli('alarm', 'add', '7');
    env.ALARMONY_DIR = dir;
    expect((await run('alarms')).out).toContain('07:00');
    delete env.ALARMONY_DIR;
    const data = path.join(home, 'Library', 'Application Support', 'Alarmony');
    await mkdir(data, { recursive: true });
    await writeFile(path.join(data, 'folder.json'), JSON.stringify({ folder: dir }));
    expect((await run('alarms')).out).toContain('07:00');
  });

  it('says how to name a folder when there is none, and never makes one', async () => {
    const none = await run('alarms');
    expect(none.exit).toBe(1);
    expect(none.err).toContain('Pass --dir');
    const gone = await run('alarm', 'add', '7', '--dir', path.join(dir, 'gone'));
    expect(gone.exit).toBe(1);
    expect(gone.err).toContain("isn't there");
  });

  it('starts a new file in an empty folder with one clock for this zone', async () => {
    expect((await json('clocks')).body.clocks.map((c: { zone: string }) => c.zone)).toEqual(['UTC']);
    await cli('timer', 'start', '5');
    expect((await readClock()).clocks.map((c: { zone: string }) => c.zone)).toEqual(['UTC']);
  });

  it("leaves a file it can't read alone, and refuses a newer one", async () => {
    await writeFile(file(), '{ not json');
    const bad = await cli('alarm', 'add', '7');
    expect(bad.exit).toBe(1);
    expect(bad.err).toContain("can't be read");
    expect(await readFile(file(), 'utf8')).toBe('{ not json');
    await writeFile(file(), JSON.stringify({ format: 99 }));
    expect((await cli('alarms')).err).toContain('newer Alarmony');
  });
});

describe('clocks', () => {
  it('adds a city, lists the time there, and removes it', async () => {
    const added = await json('clock', 'add', 'Tokyo');
    expect(added.body.clock).toMatchObject({
      zone: 'Asia/Tokyo',
      name: 'Tokyo',
      time: '03:00',
      day: 'Tomorrow, +9 hrs',
    });
    expect((await cli('clocks')).out).toMatch(/03:00\s+Tokyo/);
    expect((await cli('clock', 'add', 'asia/tokyo')).err).toContain('already on the list');
    const removed = await json('clock', 'remove', 'tokyo');
    expect(removed.body.deleted.zone).toBe('Asia/Tokyo');
    expect((await readClock()).clocks.map((c: { zone: string }) => c.zone)).toEqual(['UTC']);
  });

  it('lists the places a name could be and exits 1', async () => {
    const r = await cli('clock', 'add', 'new');
    expect(r.exit).toBe(1);
    expect(r.err).toContain('America/New_York');
    expect((await cli('clock', 'add', 'Atlantis')).err).toContain('No time zone matches');
  });
});

describe('alarms', () => {
  it('adds an alarm the way you would type it, with its options', async () => {
    const r = await json(
      'alarm',
      'add',
      '7:30 pm',
      '--days',
      'mon,wed',
      '--label',
      'Gym',
      '--sound',
      'Bells',
      '--no-snooze',
    );
    expect(r.body.alarm).toMatchObject({
      time: '19:30',
      days: [1, 3],
      repeat: 'Mon, Wed',
      label: 'Gym',
      sound: 'bells',
      snooze: false,
      on: true,
      nextDue: '2026-11-23T19:30:00.000Z',
    });
    const text = await cli('alarms');
    expect(text.out).toMatch(
      /19:30\s+on\s+Mon, Wed\s+Gym\s+next Mon 19:30, in 4 days|19:30\s+on\s+Mon, Wed\s+Gym\s+next Mon 19:30/,
    );
  });

  it('rings once by default: today if the time is still to come', async () => {
    const r = await json('alarm', 'add', '23:00');
    expect(r.body.alarm).toMatchObject({ repeat: 'Today', on: true, nextDue: '2026-11-19T23:00:00.000Z' });
  });

  it('turns alarms on and off, saying so when nothing changes', async () => {
    await cli('alarm', 'add', '7', '--label', 'Wake', '--days', 'daily');
    const off = await json('alarm', 'off', 'wake');
    expect(off.body).toMatchObject({ changed: true, alarm: { on: false } });
    expect((await cli('alarm', 'off', 'Wake')).out).toContain('already off');
    expect((await json('alarm', 'on', '07:00')).body.alarm.on).toBe(true);
  });

  it('edits only the fields given', async () => {
    await cli('alarm', 'add', '7', '--label', 'Wake', '--days', 'weekdays');
    const r = await json('alarm', 'edit', 'Wake', '--time', '6:45', '--snooze');
    expect(r.body.alarm).toMatchObject({ time: '06:45', label: 'Wake', days: [1, 2, 3, 4, 5], snooze: true });
    const nothing = await cli('alarm', 'edit', 'Wake');
    expect(nothing.exit).toBe(1);
    expect(nothing.err).toContain('Nothing to change');
  });

  it('prints what it deleted', async () => {
    await cli('alarm', 'add', '7', '--label', 'Wake');
    const r = await json('alarm', 'delete', 'Wake');
    expect(r.body.deleted).toMatchObject({ time: '07:00', label: 'Wake' });
    expect((await readClock()).alarms).toEqual([]);
  });

  it('explains a time, days or sound it cannot read', async () => {
    expect((await cli('alarm', 'add', '25:00')).err).toContain("isn't a time");
    expect((await cli('alarm', 'add', '7', '--days', 'someday')).err).toContain("isn't a repeat");
    expect((await cli('alarm', 'add', '7', '--sound', 'gong')).err).toContain('The sounds are chimes');
  });
});

describe('naming an item', () => {
  it('prefers an exact name, then a name containing the text, then an id prefix; several are listed', async () => {
    await cli('alarm', 'add', '7', '--label', 'Run');
    await cli('alarm', 'add', '8', '--label', 'Run club');
    await cli('alarm', 'add', '9', '--label', 'Lunch club');
    expect((await json('alarm', 'off', 'run')).body.alarm.time).toBe('07:00');
    const many = await cli('alarm', 'off', 'club');
    expect(many.exit).toBe(1);
    expect(many.err).toContain('matches 2 alarms');
    expect(many.err).toContain('Run club');
    const id = (await readClock()).alarms[2]?.id ?? '';
    expect((await json('alarm', 'off', id.slice(2, 7))).body.alarm.label).toBe('Lunch club');
    expect((await cli('alarm', 'off', id.slice(2, 4))).err).toContain('No alarm matches');
  });
});

describe('timers and presets', () => {
  it('starts, pauses, resumes, cancels and deletes a timer', async () => {
    const started = await json('timer', 'start', '10m', '--label', 'Pasta');
    expect(started.body.timer).toMatchObject({
      state: 'running',
      ms: 600_000,
      endsAt: '2026-11-19T18:10:00.000Z',
    });
    now += 61_000;
    expect((await cli('timers')).out).toMatch(/8:59\s+running\s+Pasta\s+ends 18:10/);
    expect((await json('timer', 'pause', 'pasta')).body.timer).toMatchObject({
      state: 'paused',
      leftMs: 539_000,
    });
    // Only running timers can be paused, so a paused one isn't found.
    expect((await cli('timer', 'pause', 'pasta')).err).toContain('No running timer matches');
    expect((await json('timer', 'resume', 'pasta')).body.timer.state).toBe('running');
    expect((await json('timer', 'cancel', 'pasta')).body.timer).toMatchObject({
      state: 'idle',
      left: '10:00',
    });
    expect((await json('timer', 'delete', 'pasta')).body.deleted.label).toBe('Pasta');
    expect((await readClock()).timers).toEqual([]);
  });

  it('with --wait, counts down and rings the bell at the end, leaving the timer in the file', async () => {
    const r = await cli('timer', 'start', '3s', '--wait');
    expect(r.exit).toBe(0);
    expect(r.err).toContain('0:02 left');
    expect(r.err).toContain('is done.\u0007');
    expect(now).toBe(T0 + 3000);
    expect((await readClock()).timers[0]?.state).toBe('running');
  });

  it('Ctrl-C stops waiting and leaves the timer running', async () => {
    waitsLeft = 1;
    const r = await json('timer', 'start', '5m', '--wait');
    expect(r.body).toMatchObject({ finished: false, timer: { state: 'running' } });
    expect(r.err).toContain('keeps running');
  });

  it('stops waiting when the timer is cancelled somewhere else', async () => {
    onWait = () =>
      editFile((raw) => {
        Object.assign(first(raw.timers), { state: 'idle', endsAt: null, leftMs: null });
      });
    const r = await cli('timer', 'start', '5m', '--wait');
    expect(r.err).toContain('cancelled somewhere else');
  });

  it('keeps presets, which need a label', async () => {
    expect((await cli('preset', 'add', '3m')).err).toContain('needs a label');
    expect((await json('preset', 'add', '3m', '--label', 'Tea')).body.preset).toMatchObject({
      ms: 180_000,
      length: '3:00',
    });
    expect((await cli('presets')).out).toMatch(/3:00\s+Tea/);
    expect((await json('preset', 'delete', 'tea')).body.deleted.label).toBe('Tea');
    expect((await cli('timer', 'start', '100h')).err).toContain("isn't a duration");
  });
});

describe('the stopwatch', () => {
  it('starts, laps, stops, shows and resets', async () => {
    await cli('stopwatch', 'start');
    expect((await cli('stopwatch', 'start')).err).toContain('already running');
    now += 61_230;
    await cli('stopwatch', 'lap');
    now += 1000;
    expect((await cli('stopwatch', 'reset')).err).toContain('Stop the stopwatch');
    await cli('stopwatch', 'stop');
    const shown = await json('stopwatch');
    expect(shown.body.stopwatch).toMatchObject({
      state: 'paused',
      elapsed: '01:02.23',
      laps: [{ lap: 1, ms: 61_230 }],
    });
    expect((await cli('stopwatch')).out).toContain('Lap 1  01:01.23');
    expect((await json('stopwatch', 'reset')).body.stopwatch.elapsedMs).toBe(0);
    expect((await cli('stopwatch', 'reset')).out).toContain('Already at zero');
  });
});

describe('changes made elsewhere', () => {
  it('replays this edit onto a file changed meanwhile', async () => {
    await cli('alarm', 'add', '7', '--label', 'Wake');
    beforeWrite = () => editFile((raw) => (first(raw.alarms).label = 'Run'));
    const r = await cli('alarm', 'edit', 'Wake', '--sound', 'harp');
    expect(r.exit).toBe(0);
    expect(r.err).toContain('Merged with changes made elsewhere.');
    expect((await readClock()).alarms[0]).toMatchObject({ label: 'Run', sound: 'harp' });
  });

  it('exits 2 and saves nothing when both changed the same thing', async () => {
    await cli('alarm', 'add', '7', '--label', 'Wake');
    beforeWrite = () => editFile((raw) => (first(raw.alarms).time = '05:00'));
    const r = await json('alarm', 'edit', 'Wake', '--time', '6');
    expect(r.exit).toBe(2);
    expect(r.body).toMatchObject({ ok: false, exit: 2, items: ['Wake'] });
    expect((await readClock()).alarms[0]?.time).toBe('05:00');
  });

  it('writes the file again when it was deleted meanwhile', async () => {
    await cli('alarm', 'add', '7');
    beforeWrite = () => rm(file());
    expect((await cli('alarm', 'add', '8')).exit).toBe(0);
    expect((await readClock()).alarms.map((a) => a.time)).toEqual(['07:00', '08:00']);
  });
});

describe('the command line', () => {
  it('prints help for every command and exits 1 on a wrong command line, with JSON under --json', async () => {
    for (const { path: p } of runnable(ROOT)) {
      const r = await run(...p, '--help');
      expect(r.exit).toBe(0);
      expect(r.out).toContain(`Usage: alarmony ${p.join(' ')}`.trimEnd());
    }
    expect((await run('--version')).out).toBe('1.2.3\n');
    const bad = await run('alarm', 'snooze', '--json');
    expect(bad.exit).toBe(1);
    expect(bad.err).toContain("See 'alarmony alarm --help'");
    expect(JSON.parse(bad.out)).toMatchObject({ ok: false, exit: 1 });
    expect((await run('alarms', '--frobnicate')).err).toContain("no option '--frobnicate'");
  });

  it('man lists every command; schema has a reply for each', async () => {
    const man = (await run('man')).out;
    const schema = JSON.parse((await run('schema')).out) as Record<string, unknown>;
    const keys = Object.keys(schema).flatMap((k) => k.split(' | '));
    for (const { path: p } of runnable(ROOT)) {
      if (!p.length) continue;
      expect(man).toContain(`alarmony ${p.join(' ')}`);
      if (p[0] !== 'man' && p[0] !== 'schema')
        expect(keys.some((k) => k === p.join(' ') || k === p.at(-1) || k.startsWith(p.join(' ')))).toBe(true);
    }
  });

  it('the agent skill file names every command', async () => {
    const skill = await readFile(new URL('../skill/SKILL.md', import.meta.url), 'utf8');
    for (const { path: p } of runnable(ROOT))
      if (p.length) expect(skill).toContain(`alarmony ${p.join(' ')}`);
  });
});
