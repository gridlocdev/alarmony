# Alarmony — agent guide

Alarmony is a clock app for one person: world clock, alarms, stopwatch and timers. One UI runs in the browser and in the Electron app, and a CLI runs in Node, all on one `clock.json`. The spec is [docs/plans/prd.md](docs/plans/prd.md), the code layout is [docs/architecture.md](docs/architecture.md), and the commands are in [docs/development.md](docs/development.md).

Use the terms in [GLOSSARY.md](GLOSSARY.md) in code, docs and commit messages, and add a term there when a new concept appears.

## Gates

- `just check` (= `pnpm check`) must pass before you commit: Prettier check, ESLint, `tsc -b`, Vitest (including the architecture rules in `test/architecture.test.ts`), and the build.
- When the owner corrects something, turn the correction into a rule in `test/architecture.test.ts` or a test, not a comment or a line here.
- Never add to `test/architecture-baseline.json`. Fix the violation; lower or delete its entry when you do. A comment is never permission: a deliberate exception (`ignoreError(promise, 'why')`, an `eslint-disable`, a `@ts-expect-error`) goes in `test/architecture-exceptions.json` only after the owner agrees.
- Page timers go through `packages/ui/src/schedule.ts` (`wait`, `after`, `every`, `debounce`), never `setTimeout` directly.
- When you change behaviour, add or update a test in the package's `test/` folder, and update the PRD section the code cites (`PRD §n`).
- Check UI changes headlessly (headless Playwright, `just drive`, or the desktop app with `ALARMONY_HEADLESS=1` / `--headless`: no window, Dock icon or sound). Never open a visible window, dialog or browser to check your work, never use `open` on the web build, and make sure every Electron process a check started has exited. A native dialog (Electron `dialog`, `alert`, `confirm`) in a headless run would land on the owner's screen; the architecture test rejects them.
- Never point a check at the real data file. Use `ALARMONY_USER_DATA=<temp dir>` (and `ALARMONY_FOLDER`) for the desktop app; scenarios use a fresh browser's empty storage.

## Layout

| Path | What it is |
| --- | --- |
| `packages/core` | The pure engine: the `clock.json` format, operations and undo, stopwatch and timer arithmetic, durations, what is due to ring, the sounds. No DOM or Node (ESLint enforces it). |
| `packages/node-files` | Atomic, versioned reads and writes of the data file, and where the desktop app keeps its data folder, for the desktop app and the CLI. |
| `packages/ui` | Preact and signals: the command catalog, dialogs, ⌘K, icons, sound, the save session and the `ClockStore` adapters. |
| `apps/web` | The app shell, the list of commands and the Vite entry point. One static build serves the browser and the desktop app. |
| `apps/desktop` | The Electron shell: main process, sandboxed preload bridge, native menu. |
| `apps/cli` | The `alarmony` command (Node, run from TypeScript source): one `CommandSpec` tree feeds the parser, help, `man` and `schema`. `skill/SKILL.md` is its guide for agents; a test checks it names every command. |

## Golden rules

1. **The engine stays pure.** It has no UI, DOM or Node APIs, and runs the same in a browser, a worker or Node tests.
2. **The file is the source of truth.** No database. A save writes exactly what the user has, and keeps items it couldn't read (PRD §3.2). What one device keeps for itself (settings, what it has rung) stays out of the file.
3. **One command catalog.** The command menu, shortcuts, context menus, the Electron menu bar, the Keyboard Shortcuts window and `docs/controls.md` all read it. Don't wire a key or a menu item past it.
4. **The UI reaches the file only through `ClockStore`.** It never knows whether data is in memory, in the browser or on disk.
5. **Never lose data.** Saves are atomic everywhere. Unsaved changes are replayed onto a file changed elsewhere, field by field; where both sides changed the same thing the user chooses, and nothing is overwritten silently. Every change, including one picked up from elsewhere, can be undone.
6. **Time comes from the clock, never from counting.** Running timers and the stopwatch store when they end or started; the view and the ringing check compute from the time now, so a sleeping laptop or a throttled tab is right as soon as it looks.
7. **Security.** The Electron renderer is sandboxed with context isolation; its only native access is the `alarmonyNative` bridge, which reaches only the data file.
8. **Dependencies.** The runtime dependencies are Preact and `@preact/signals`. Don't add a package without the owner's approval. Pin versions exactly.
9. **Nothing left to interpretation.** If a behaviour isn't in the PRD, stop and ask, then record the answer in the PRD.

## TypeScript conventions

- Strict mode with `noUncheckedIndexedAccess` and `erasableSyntaxOnly`: no enums, parameter properties or namespaces. Use union types and `const` objects.
- Relative imports end in `.ts`. Use `import type` for types only.
- Each package's `src/index.ts` names its exports one by one. Other packages import only through `@alarmony/<package>`; ESLint and the architecture test reject deep imports.

## Git workflow

- Keep commits small and coherent. Write the message as a plain sentence about the user-visible effect.
- Commit only when `just check` is green and no questions are outstanding.
