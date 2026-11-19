# Architecture

Alarmony is one TypeScript code base with two hosts and a command line. The browser and the Electron app run the same UI from one static build; the only thing that differs between them is where `clock.json` comes from. The CLI runs the same engine in Node.

```
     ┌──────────────── apps/web (Preact + signals, one Vite build) ────────────────┐
     │  App · StopwatchView · TimersView · RingingSheet · CommandMenu · Dialogs      │
     │  AppController (tab, selection, dialogs, notices, ringing) · commands.ts      │
     └──────────────────────────────────────┬───────────────────────────────────────┘
                                            │ imports
     ┌─────────────────── packages/ui (Preact + signals) ───────────────────┐
     │  CommandCatalog · Dialog · ListPopup · icons · SoundPlayer            │
     │  ClockSession (saving, retries, conflicts, recovery)                  │
     │  ClockStore ─┬─ BrowserStore  (the browser's private file system)     │
     │              ├─ NativeStore   (window.alarmonyNative IPC)              │
     │              └─ MemoryStore   (tests, and browsers with no storage)   │
     │  deviceSettings (this device's settings and ringing log)              │
     └──────────────────────────────────────┬───────────────────────────────┘
                                            │
     ┌─────────────────── packages/core (pure TS) ───────────────────┐
     │  format (read, serialize) · ClockDoc (changes, undo) · edits   │
     │  stopwatch and timer arithmetic · durations · ringing · sounds │
     └────────────────────────────────────────────────────────────────┘
     ┌──────────── packages/node-files (Node) ────────────┐
     │  readDataFile · writeDataFile (atomic, versioned)  │◄──── apps/desktop, apps/cli
     └────────────────────────────────────────────────────┘
```

## Layering

- `packages/core` has no DOM and no Node APIs. ESLint rejects `window`, `document`, `localStorage` and `process` there, so the engine runs the same in a browser and in the tests.
- `packages/ui` knows the DOM but not where the file lives: it only sees a `ClockStore`.
- `packages/node-files` is the only code that touches the disk.
- Other packages import only through `@alarmony/<package>`. `test/architecture.test.ts` checks the layers and where page timers, key listeners, storage and dialogs may appear.

## Core (`packages/core`)

- `format.ts`: the file format (PRD §3.2). `classifyFile` reads a file as ok, corrupt, empty or newer, keeping items it can't read so they are written back unchanged; `serialize` writes it pretty-printed.
- `ops.ts` and `clockDoc.ts`: every change is a list of operations, applied as one undo step (PRD §11). An edit that changes nothing records nothing. An update changes only the fields it changed (with the fields grouped with them: an alarm's time, days and on/off; a timer's run state), so it can be replayed onto a copy someone else changed.
- `merge.ts`: changes made elsewhere (PRD §3.5). `findClashes` lists what both sides changed since the file was last read here; `replay` puts this window's net changes onto the other copy, with Keep Mine or Use Theirs deciding the clashes; `diffOps` turns a change picked up from the file into operations, so it is one undo step.
- `edits.ts`: the edits the app makes (add, start, pause, edit and delete a timer; presets; the stopwatch).
- `stopwatch.ts`, `timers.ts`, `duration.ts`: the arithmetic and the text for times. Running things store when they started or end, never a count that ticks.
- `ringing.ts`: what is due at a given time, and which of those this device has already rung. `sounds.ts`: the sounds, as notes.

## UI (`packages/ui`)

- `store/`: the `ClockStore` contract and its adapters. A version is the SHA-256 of the file's text; a save sends the version it last saw and fails with `ConflictError` if the file changed (PRD §3.4). `deviceSettings.ts` keeps what each device keeps for itself in page storage: settings, the ringing log and the crash snapshots, one slot per window, each held by a Web Lock while its window is open so a start only offers what a closed or crashed window left.
- `session/clockSession.ts`: one open file. It keeps the file as last read (`base`) and this window's operations not yet saved. It saves every change at once, never two saves at a time, and retries a failed save. A save that finds the file changed reads it and replays the unsaved operations onto it; only when both sides changed the same thing does it stop and ask. The crash snapshot holds the base, its version and the operations, so Restore replays them through the same merge. What happens when is the table in `session/saveChart.ts`, drawn below.
- `commands/`: the `CommandCatalog`, and the page's one key listener (`keys.ts`).
- `components/`: `Dialog` (modal, focus trap, Escape), `ListPopup` and the `Icon` set. `sound/player.ts` plays the sounds with Web Audio. `schedule.ts` holds every page timer.

### Saving

Every move the save session can make, from `toMermaid()` in `session/saveChart.ts`; a test checks this drawing matches the table. An event with no arrow from the current state changes nothing. To review a change to saving, read this diagram's diff and ask what happens to an edit in each state.

```mermaid
stateDiagram-v2
  [*] --> clean
  clean --> saving : edit / snapshot, writeFile
  clean --> refreshing : refresh / readFile
  refreshing --> saving : edit / snapshot, dropRead, writeFile
  refreshing --> clean : refreshRead / takeFile
  saving --> savingDirty : edit / snapshot
  saving --> clean : saved / clearSnapshot
  saving --> failed : failed
  saving --> merging : versionChanged / readToMerge
  savingDirty --> savingDirty : edit / snapshot
  savingDirty --> saving : saved / writeFile
  savingDirty --> failed : failed
  savingDirty --> merging : versionChanged / readToMerge
  merging --> merging : edit / snapshot
  merging --> saving : merged / mergeFile, snapshot, writeFile
  merging --> conflict : clashed / showConflict
  merging --> failed : mergeFailed
  failed --> saving : edit / snapshot, writeFile
  failed --> saving : retry / writeFile
  conflict --> conflict : edit / snapshot
  conflict --> choosing : choose
  choosing --> choosing : edit / snapshot
  choosing --> conflict : chooseFailed
  choosing --> saving : chosen / mergeFile, snapshot, writeFile
```

- `snapshot` keeps the unsaved operations in the recovery slot at every edit and after every merge, so a crash or a conflict never loses a change.
- `dropRead`: an edit during a refresh wins; the file read is ignored and the save merges with the file.
- `takeFile` takes the file as one undo step ("Changes made elsewhere").
- `merging`: a write found another version. `merged` replays this window's operations onto the file read and writes the result; a missing or unreadable file (kept aside first) is written again from this window's data. `clashed` shows the conflict. Edits made meanwhile join the operations being replayed.
- `chosen`: Keep Mine replays everything, this window's fields winning; Use Theirs drops this window's operations on the clashing items and keeps the rest. When it drops any, the undo history goes, since it no longer fits.
- `choosing`: a conflict choice is reading the file. The dialog's buttons wait, so a second click can't apply an old read to a later conflict; if the read fails, the dialog is back.

## Web (`apps/web`)

- `main.tsx` picks a store (the native bridge in Electron, else the browser's storage, else memory), opens the session, and drives the controller: a tick every second, a frame loop while the stopwatch runs, and a refresh when the window comes back, every 15 seconds while it is in front and every minute while it is hidden.
- `app/controller.ts`: the app's state as signals, and no timers of its own, so the tests drive it with a clock they move. `tick()` checks what is due and starts or stops ringing (PRD §9).
- `app/commands.ts`: every command. ⌘K, the keys, the toolbar, the native menu bar (`nativeMenu.ts`) and the Keyboard Shortcuts window (`shortcuts.ts`) all read it.

## Desktop (`apps/desktop`)

- `main.ts`: one window, loading the web build from `app://alarmony/`. The renderer is sandboxed with context isolation, IPC is accepted only from that origin, background throttling is off so a hidden window still rings on time, and sound plays without a click. Closing the window hides it; the page keeps running and the menu bar icon (tray) brings it back. While an alarm is on or a timer runs, it holds a power-save blocker against App Nap, and quitting asks first. A wake from sleep tells the page to check what is due.
- `preload.cts` exposes `alarmonyNative`: load, save and save a copy of `clock.json`, set the menu bar and the tray (the page works out what it shows in `app/tray.ts`), open at login, Open Folder…, send menu commands, wake and full-screen changes to the page, and say whether the window uses the unified toolbar (`chrome`; macOS). The channels are listed in `bridge.ts`.
- `paths.ts`: where the data lives, and whether the first start has to ask (`folder.json` remembers the answer). `background.ts`: the tray's menu and the questions you can turn off (`prefs.json`). `dialogs.ts`: every system dialog; a headless run skips them and lists them in `alarmonySkippedDialogs`, and the architecture test allows `dialog.*` nowhere else. `menu.ts`: the menu bar from the catalog plus the standard menus, and the edit menu for right-clicked text. `windowState.ts`: the window's size and place.

## CLI (`apps/cli`)

- `spec.ts`: one `CommandSpec` tree (`index.ts`) feeds the parser, `--help`, `man` and `runnable`, so a command can't exist without its help. `cli.ts` turns errors into exit codes and the `--json` error reply.
- `store.ts`: finds the folder, loads `clock.json`, and saves a list of operations with the version check; a changed file is re-read and the operations replayed (`findClashes`, `replay` from `merge.ts`), and a clash exits 2. `find.ts` names one item from what the user typed. `view.ts` is every reply's shape and its text.
- `commands/`: clocks, alarms, timers and presets, the stopwatch, `man` and `schema`. Each takes a `Context` whose `CliIo` holds the output, the environment, the clock and the wait, so the tests run every command in-process.

## Testing

Vitest runs every package's `test/` folder in Node. The store adapters share one contract test; the engine and the save session have seeded random-operation tests; the web app's tests drive the `AppController` and the catalog against a `MemoryStore` with a clock they move; `controls.test.ts` checks [Controls](controls.md) against the catalog. Playwright runs the scenarios in `e2e/` in headless Chromium, and the desktop smoke test starts Electron headless on a throwaway folder.
