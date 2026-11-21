# Getting started

Alarmony runs in your browser or as a desktop app. There are no downloads yet, so for now you run it from source.

## What you need

Node 22.18 or later, pnpm (through `corepack enable`) and [just](https://github.com/casey/just).

## Run it

```bash
just setup         # corepack enable, then pnpm install
just run-web       # the web app on http://localhost:5173
just run-desktop   # the desktop app
just cli timers    # the alarmony command, from source (just cli man lists every command)
```

## Where your data is kept

| Runs as | File |
| --- | --- |
| Desktop | `clock.json` in the folder you pick on first start (`Documents/Alarmony` or your own), or the one `ALARMONY_FOLDER` names |
| Browser | The browser's private storage for the site, or in Chrome and Edge a folder you pick with Open Folder… (⌘O) |

It is plain JSON, so you can back it up or sync the folder. In a browser, Export clock.json… and Import clock.json… in the ⌘K menu save and restore a copy. Each device keeps its own settings (theme, time format, volume, whether it rings) and its own record of what it has rung, so two computers sharing the folder never ring each other's timers twice.

## Timers in the browser

A browser plays sound only after you click or press a key on the page, so a timer that finishes before then shows the ringing sheet and asks for a click. A tab in the background can ring up to a minute late. The desktop app has neither limit.

## First run

Alarmony opens on Timers, or on the tab you had open last time. Press `N` to start a timer, `⌘2` for the stopwatch, and `⌘/` to see every shortcut.
