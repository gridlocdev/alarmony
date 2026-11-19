# Alarmony

A clock app for your desktop and your browser: a world clock, alarms, timers and a stopwatch, plus an `alarmony` command for the terminal. Everything lives in one plain `clock.json` in a folder you choose, so you can back it up, sync it, or read it with other tools.

- **Alarms and timers** that ring until you stop them, with snooze, repeat days and presets; on the desktop they keep ringing from the menu bar after the window closes.
- **World clock and stopwatch**: places by city name with their offset from you, and laps with the fastest and slowest marked.
- **Keyboard first**: every action is a command in the ⌘K menu and on right-click, with shortcuts listed under ⌘/. Undo takes back anything, including changes made in another window or from the command line.

## Getting started

There are no downloads yet. To run it from source you need Node 22.18 or later, pnpm (through `corepack enable`) and [just](https://github.com/casey/just):

```bash
just setup         # corepack enable, then pnpm install
just run-web       # the web app on http://localhost:5173
just run-desktop   # the desktop app
just cli timers    # the command line
```

See [Getting started](docs/getting-started.md) for where your data is kept.

## Learn more

- [Documentation](docs/README.md): features, controls, development and architecture.
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE)
