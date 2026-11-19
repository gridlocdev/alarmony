# Alarmony

A clock app for your desktop and your browser: a stopwatch and countdown timers now, with a world clock and alarms on the way. Everything lives in one plain `clock.json` in a folder you choose, so you can back it up, sync it, or read it with other tools.

- **Stopwatch** with laps, the fastest and slowest marked, and an analog dial.
- **Timers**: as many as you like at once, each with a label, plus presets you start with one click. A finished timer rings until you stop it.
- **Keyboard first**: every action is a command in the ⌘K menu, with shortcuts listed under ⌘/. Undo takes back anything.

## Getting started

Alarmony isn't packaged yet. To run it from source you need Node 22.18 or later, pnpm (through `corepack enable`) and [just](https://github.com/casey/just):

```bash
just setup         # corepack enable, then pnpm install
just run-web       # the web app on http://localhost:5173
just run-desktop   # the desktop app
```

See [Getting started](docs/getting-started.md) for where your data is kept.

## Learn more

- [Documentation](docs/README.md): features, controls, development and architecture.
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE)
