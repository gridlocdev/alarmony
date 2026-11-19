---
name: alarmony
description: >-
  Read and change the user's Alarmony world clocks, alarms, timers, presets and stopwatch from the command line with the `alarmony` tool. Use when the user asks to set, list, change, switch on or off or delete an alarm ("wake me at 7 on weekdays"), start, pause or cancel a timer ("a 10 minute pasta timer"), add a world clock for a city, check the time somewhere, or start, lap or reset the stopwatch, and whenever they mention Alarmony or its clock.json. The Alarmony apps ring alarms and timers; this tool only edits the file they share.
---

# Alarms, timers and clocks through `alarmony`

`alarmony` edits the `clock.json` file that the Alarmony desktop and web apps read. The apps pick up every change within a second and do the ringing; the tool never rings an alarm itself. Its full reference is `alarmony man`, and `alarmony schema` prints the shape of every `--json` reply.

## Prerequisite

`alarmony` must be on `PATH`: check with `alarmony --version`. Inside the Alarmony repository, `just cli <args>` runs it from source. If it is missing elsewhere, tell the user rather than building it.

## The folder

The tool reads `clock.json` from `--dir <folder>`, else `$ALARMONY_DIR`, else the folder the desktop app was last pointed at. It never creates the folder. When none is set, it says so and exits 1: ask the user which folder to use. An empty folder gets a new file on the first change.

## Always pass `--json`

Each reply is then one JSON document on stdout: `{"ok": true, …}` on success, `{"ok": false, "error": "…", "exit": n}` on failure. Exit codes: 0 done, 1 an error (a wrong command line too), 2 a conflict (see below).

## Reading

```bash
alarmony clocks --json        # each clock: id, name, zone, time there, offset, day
alarmony alarms --json        # each alarm: id, time, days, repeat, label, sound, snooze, on, nextDue (ISO)
alarmony timers --json        # each timer: id, label, ms, state (idle/running/paused), done, leftMs, endsAt
alarmony presets --json       # each preset: id, label, ms
alarmony stopwatch --json     # state, elapsedMs, laps
```

## Clocks

```bash
alarmony clock add Tokyo --json              # a city, a zone id (Asia/Tokyo) or an abbreviation (EST)
alarmony clock remove Tokyo --json
```

A name that fits several zones lists them and exits 1: run it again with the zone id.

## Alarms

```bash
alarmony alarm add 7:30 --days weekdays --label Wake --json
alarmony alarm add "6:15 pm" --days mon,wed,fri --sound bells --no-snooze --json
alarmony alarm edit Wake --time 6:45 --days daily --json     # only the options given change
alarmony alarm off Wake --json                               # "changed": false when it was already off
alarmony alarm on Wake --json
alarmony alarm delete Wake --json                            # the reply holds what was deleted
```

- Times: `7`, `7:30`, `730`, `7:30 pm`, `19:30`.
- `--days`: `weekdays`, `weekends`, `daily`, `never` (the default: it rings once, today or tomorrow), or day names like `mon,wed,fri`.
- An alarm is named by its id, its label or its time. An exact name wins over a partial one; an id prefix of 4 or more characters also works. When a name fits several alarms the tool lists them and exits 1: use the id.
- Check `nextDue` in the reply to confirm when it will ring.

## Timers and presets

```bash
alarmony timer start 10m --label Pasta --json       # 5 (minutes), 5m, 1h30m, 90s, 25:00, 1:30:00
alarmony timer pause Pasta --json
alarmony timer resume Pasta --json
alarmony timer cancel Pasta --json                  # back to its full length, kept on the list
alarmony timer delete Pasta --json
alarmony timer start 25m --wait                     # counts down here and rings the terminal bell
alarmony preset add 3m --label Tea --json           # a preset needs a label
alarmony preset delete Tea --json
```

Each timer action only looks at the timers it can act on: `pause` at running ones, `resume` at paused or idle ones, `cancel` at running or paused ones. Don't use `--wait` from an agent unless asked: it blocks until the timer ends.

## Stopwatch

```bash
alarmony stopwatch start --json
alarmony stopwatch lap --json
alarmony stopwatch stop --json
alarmony stopwatch reset --json      # stop it first
```

## Changes made elsewhere

If an app changed `clock.json` while a command ran, the tool merges its own edit into the new file and says `"merged": true`. If both changed the same item, it saves nothing and exits 2 with the item names in `items`: read the item again, tell the user what changed, and ask before trying again.

## Other commands

`alarmony man` prints every command and option; `alarmony schema` prints each reply's shape. Every command takes `--help`.
