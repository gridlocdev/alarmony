# Alarmony — product requirements

Alarmony is a clock for one person: world clocks, alarms, a stopwatch and timers. It replaces the macOS Clock app. It runs as a desktop app (Electron) that keeps ringing from the menu bar when its window is closed, in the browser, and as an `alarmony` command line, all on the same engine and the same `clock.json` file. Code cites this document as `PRD §n`.

## §1 Goals

1. An alarm or a timer always rings while the desktop app runs, window open or not, and says so when it couldn't (the Mac was asleep, the app was quit).
2. Set an alarm, start a timer or time a lap in a couple of keys, without the mouse.
3. See what time it is anywhere at a glance.
4. Keep everything in one plain JSON file that the desktop app, the browser and the CLI share, so a synced folder carries alarms between Macs.
5. Never lose an alarm: atomic saves, other devices' edits merged by replaying operations, a dialog when both sides changed the same item, undo for every edit.

## §2 Non-goals for 1.0

- The NAS server. A server can't ring on the user's devices, and a browser tab only rings while it is open, so it adds little. Leave the CLI's and the store's shape ready for it; it may come later.
- Waking a sleeping Mac to ring (needs root `pmset`). §9.4 says what happens instead.
- Stopping or snoozing an alarm on one device stops it on the others. Each running copy rings and is stopped on its own (§9.3).
- Bedtime, sleep tracking, Focus modes, a world map, a bundled city list (§6.1 uses the system's time zones), iOS.
- Audio files. Every sound is made in code (§10).
- Accounts, sharing, sync services. Syncing is the user's folder sync (iCloud Drive, Dropbox, Syncthing).

## §3 Data

### §3.1 The folder and its file

- The user picks one folder. Alarmony keeps one file in it, `clock.json`. Other files in the folder are left alone.
- An empty folder gets a new `clock.json` on first start, with one world clock for the system's time zone and nothing else (no welcome card, no sample alarms).
- The file is UTF-8 JSON, written with two-space indentation and a trailing newline, keys in a fixed order, so it diffs well and a person can read it.

### §3.2 The format

```json
{
  "format": 1,
  "settings": { "snoozeMinutes": 9 },
  "clocks": [{ "id": "c_x1", "zone": "Asia/Tokyo", "label": "" }],
  "alarms": [
    {
      "id": "a_x2",
      "time": "07:00",
      "days": [1, 2, 3, 4, 5],
      "label": "Wake up",
      "sound": "chimes",
      "snooze": true,
      "enabled": true,
      "once": null
    }
  ],
  "presets": [{ "id": "p_x3", "label": "Tea", "ms": 240000 }],
  "timers": [
    { "id": "t_x4", "label": "Pasta", "ms": 600000, "state": "running", "endsAt": "2026-11-19T18:20:00.000Z", "leftMs": null }
  ],
  "stopwatch": { "state": "running", "startedAt": "2026-11-19T18:00:00.000Z", "elapsedMs": 0, "laps": [61234, 59877] }
}
```

- `id`: a short random id, unique in its list. A second item read with an id already taken is shown with `<id>-2` (the next free number), so both stay visible. `label`: free text, up to 100 characters, may be empty.
- Clocks: `zone` is an IANA zone the system knows (`Intl.supportedValuesOf('timeZone')`, plus `UTC`). A zone the system doesn't know is kept and shown greyed with "Unknown time zone <zone>".
- Alarms: `time` is `HH:MM` (24-hour) on the clock of the device that rings it (§9.1). `days` holds 1–7 (Monday = 1), sorted, no repeats; empty means once. `sound` is a name from §10; an unknown name plays the default and is kept. `once` is set only for a one-off alarm: the local date-time it rings at, `YYYY-MM-DDTHH:MM`, filled in when the alarm is turned on (§7.2).
- Presets: `ms` is 1 s to 99 h 59 m 59 s, in whole seconds.
- Timers: `state` is `idle`, `running` or `paused`. `ms` is the length it was set to. `running` has `endsAt` (UTC); `paused` has `leftMs`; `idle` has neither. A running timer whose `endsAt` has passed is finished (§8.2); finishing writes nothing.
- Stopwatch: `state` is `idle`, `running` or `paused`. Elapsed time is `elapsedMs` plus, while running, now minus `startedAt`. `laps` holds each lap's own length in ms, oldest first, at most 999.
- Unknown keys, at the top and in every item, are kept and written back unchanged.

### §3.3 Reading the file

- One engine function, `classifyFile(text)`, is the only way any code reads `clock.json`. It returns ok with the data, newer (`format` above what this version knows), or corrupt.
- It strips a leading byte-order mark. Valid JSON of the wrong shape (`null`, `[]`, a missing list) is corrupt. Single bad items (an alarm with `time: "25:00"`) are kept as raw JSON, written back unchanged, not shown, and the status bar says "Skipped 1 alarm Alarmony couldn't read." once per load.
- A newer file is never written. The app shows its contents read-only, with "This file was made by a newer Alarmony. Update to change it." Alarms in it still ring.
- A corrupt file is copied aside as `clock unreadable <YYYY-MM-DD-HHmmss>.json`, never written over, a new empty file is started, and a notice says so with the copy's name.

### §3.4 Saving

- Every edit saves at once. Saves never overlap: an edit during a save is saved right after it.
- Saves are atomic: a temp file beside the target, flush, rename over it. A symlink stays a symlink.
- Every read returns a version (SHA-256 of the bytes). Every save sends the version it read. The desktop app and the CLI hold `.clock.json.lock` while they check and write; a lock older than 10 s is taken over. Browser tabs use a Web Lock.
- A failed save is retried twice (300 ms, 600 ms), then the status bar shows "Couldn't save." with **Try Again** until a save works. Unsaved edits stay in the crash snapshot (§3.6) until then.
- Settings in the file (`snoozeMinutes`) are saved but aren't undo steps.

### §3.5 Changes made elsewhere

- Each edit is an operation on one item (add, change fields, delete, move, start, pause, reset, lap…). The session keeps the operations not yet saved.
- When a save finds a different version, the session reads the file again and replays the unsaved operations onto it, then saves that. The notice says "Merged with changes made elsewhere."
- An operation conflicts when the item it changes was changed or deleted on the other side since this window last read it (compared field by field: two sides changing different fields of one alarm don't conflict; fields that only make sense together count as one: an alarm's time, days, on/off and one-time date, a timer's length and run state). On any conflict, the dialog "Clock changed somewhere else" lists the items both sides changed (by label or time) and offers **Keep Mine** (default: replay everything, my fields win) and **Use Theirs** (drop my conflicting operations, keep the rest). Edits go on while it's open and are kept; nothing saves until the user chooses.
- A file deleted elsewhere is written again from this window's data, with the notice "clock.json was missing, so it was saved again."
- Changes are picked up when the window comes to the front, every 15 s while it's in front, and every 60 s while it's hidden or closed (so a hidden desktop app rings alarms added on another Mac). A refresh takes the file only if no save started or finished while it read, and never while an editor holds typed text. A picked-up change is one undo step, with "Updated with changes made elsewhere." and Undo.

### §3.6 Recovery

- Every edit not yet saved is written to a per-window snapshot (browser storage; desktop: the app's data folder) along with the version it was based on.
- On start, a snapshot newer than the file opens "Restore unsaved changes?": **Restore** (default; replays the snapshot's operations onto the file through §3.5) or **Discard**. The snapshot is read before anything can save. A snapshot from a window still open is never offered. A snapshot write that fails shows a status-bar warning.

### §3.7 Where the folder lives

- Desktop: **Open Folder…** (⌘O); the last one reopens, remembered in `folder.json` in the app's data folder. First start asks before showing anything: **Use Documents/Alarmony** (created when chosen) or **Choose Folder…**, or Quit. When the remembered folder is gone, the same question names it and nothing is created in its place. The status bar shows the folder's name, with its path on hover.
- Browser: a folder through the File System Access API where the browser has it (**Open Folder…**, ⌘O); otherwise the file lives in the browser's storage and the status bar says "Stored in this browser". A browser with no storage it can open (none at all, or a private file system that refuses to open) keeps the clock in memory for the tab, with a notice that nothing is saved after the tab closes; it never fails to start. A picked folder with no `clock.json` gets a copy of the current one; one that has a `clock.json` is opened as it is. The folder is remembered in IndexedDB. When the browser wants to ask again, the next start shows the folder's name with **Open “name”** and **Use This Browser Instead** before anything else; refused or gone, the clock is kept in the browser and a notice says so. **Use This Browser's Storage** copies the folder's clock back into the browser and forgets the folder. The status bar shows the folder's name.
- Browser without the File System Access API (Firefox, Safari): **Open Folder…** picks a folder with the file input (`webkitdirectory`) and opens its top-level `clock.json` read-only, because the browser gives a copy of the files and no way to write back. The status bar shows "name (read-only)" and a sticky notice says the folder is read-only in this browser and the desktop app can change it. Every command that writes `clock.json` is disabled with that reason on hover (new items, Import, edits, toggles, timer and stopwatch controls, presets, Undo and Redo); viewing, ringing, **Stop** and **Snooze**, Export, settings and **Use This Browser's Storage** still work. A folder without `clock.json`, or with one that can't be read, is refused with a notice and nothing changes. The copy lasts until the tab closes (session storage); **Use This Browser's Storage** forgets it without copying, and the browser's own clock, untouched meanwhile, comes back. A browser that can't pick a folder at all says so and points to the desktop app and Export and Import.
- **Export clock.json…** downloads the clock as it is (a newer Alarmony's file exactly as stored). **Import clock.json…** replaces everything with the picked file as one change that Undo takes back; a newer or unreadable file is refused, and the same file says so. Both are in every browser, not on the desktop, where the file is already in a folder.
- Paths outside the folder, `..` and symlinks that lead out are refused.

## §4 Engine

### §4.1 Model

- `packages/core` holds the format (§3.2), `classifyFile`, the operations, replay and conflict detection (§3.5), undo, alarm scheduling (§7.3), timer and stopwatch arithmetic (§8), zone names and offsets (§6.1), duration parsing and formatting, and the sound recipes as data (§10). It never reads the clock itself: every function that needs "now" takes it as an argument.
- Undo stores each operation's before and after, 100 steps deep, per window. An edit that changes nothing records nothing.

### §4.2 Invariants (`checkInvariants` in tests)

- Ids are unique in each list. `days` is sorted 1–7 without repeats. A one-off enabled alarm has `once`; a repeating or disabled one has `once: null`. A timer's fields match its state; `leftMs` is 0 < leftMs ≤ ms. The stopwatch's fields match its state, laps ≤ 999. Labels ≤ 100 characters.

## §5 Layout and look

### §5.1 Window

- One window. A toolbar of four tabs: **Timers**, **Stopwatch**, **Alarms**, **World Clock** (⌘1–⌘4), most used first, the **+** button on the right, which adds to the open tab and is greyed on Stopwatch so it doesn't jump in and out. The first start opens on Timers; after that the last tab reopens.
- Default 760 × 560, minimum 420 × 420. Timers and world clocks share one grid, at most 900 px wide and centred; below 600 px wide the world clock grid becomes one column.
- On macOS the title bar is hidden; the tab row is the toolbar, with the traffic lights at its left and drag regions around the tabs.
- A status bar at the bottom: notices (§5.3), the folder name and, in a browser while an alarm or timer is set, "Keep this tab open to ring" (§9.4).

### §5.2 Theme

- Plain CSS, tokens `--al-*`. Theme: System, Light, Dark. Accent: amber-orange. System font; digits use `font-variant-numeric: tabular-nums` so running times don't jitter. Reduced motion turns the analog second hand's sweep into a tick and drops transitions.

### §5.3 Notices

- One status-bar slot, short past-tense text, gone after 5 s or on the next action. An undoable action puts **Undo** in the notice; it drops the button when another edit lands first. A screen-reader live region says the same.

## §6 World Clock

### §6.1 Places

- **Add Clock…** (N on this tab, ⌘N, the + button) opens a search over the system's zones. Each zone shows as its city (the last part of the id, underscores as spaces: `America/New_York` → "New York"), with the region and the current offset ("America · UTC−5"). Typing matches city, region and abbreviations the system gives (`EST`, `JST`), accent- and case-insensitive. With nothing typed the list starts at the zones on this device's offset and runs east, wrapping round. Enter adds the first match; the list stays open for another. A zone already shown is marked "Added" and can't be added twice.
- A clock can be renamed (its label shows instead of the city, with the city under it), moved (drag, or ⌥↑/⌥↓), and deleted (Delete, with Undo). The local clock is an ordinary clock: it can be deleted too.
- After the clocks, a faded **+ Add Clock** card (a row in the list view) opens Add Clock. Empty: "No clocks." and an **Add Clock** button.

### §6.2 Cards

- Cards in a grid, in the file's order. Each: an analog face (light by day 06:00–17:59 in that zone, dark otherwise), the name, "Today, +9 hrs" / "Yesterday, −8 hrs" / "Tomorrow, +13:30 hrs" / "Today, same time" against this device's zone, and the digital time in the chosen format (§13). The second hand sweeps; everything updates each second while the window shows and stops while hidden.
- **List view** (View menu, ⌘L toggles, remembered per device): one row per clock with name, day and offset, digital time.
- Arrow keys move the selection; Enter renames.

## §7 Alarms

### §7.1 The list

- Rows sorted by time of day, then label. Each: the time large, the label and the repeat in words under it ("Wake up, weekdays", "Every day", "Mon, Wed, Fri", "Tomorrow" / "Today" for a one-off), and a switch. Disabled alarms are greyed. The row of the next alarm to ring says "in 7 hr 12 min" while the window shows.
- After the alarms, a faded **+ New Alarm** row opens New Alarm. Empty: "No alarms." and a **New Alarm** button.
- Arrow keys select, Space toggles the switch, Enter edits, Delete deletes with Undo.

### §7.2 Editing

- **New Alarm** (N, ⌘N, +) opens the editor with the time empty, repeat Never, label empty, sound Chimes, snooze on. The editor: time (typed `7`, `7:30`, `730`, `7:30 pm`, `19:30`, or arrow keys on hours and minutes; ↑ or ↓ in the empty field fills in the next whole hour; the time read back shows under the field only when it differs from what was typed), repeat (seven two-letter day toggles, Mo to Su, starting on the locale's first day of the week, plus Never, Weekdays, Weekends and Every Day shortcuts, the one that matches the days shown as pressed), label, sound (a list; picking one plays it once), snooze switch. **Save** (Enter, once a time is typed) adds it enabled; Escape or Cancel discards. Editing an existing alarm saves each change as you go (draft in the model, flushed before anything replaces the dialog), and has **Delete Alarm**.
- Turning a one-off alarm on (adding it, switching it on, or changing its time while on) sets `once` to the next time its `time` comes on this device's clock. Turning it off clears `once`.

### §7.3 When an alarm is due

- A repeating enabled alarm is due at `time` on each day in `days`, on this device's clock. A one-off enabled alarm is due at `once`. On a daylight-saving change, a time that doesn't exist that day rings at the first minute after the gap; a time that happens twice rings once, the first time.
- A one-off alarm whose `once` has passed shows as off. No device writes that: the next edit or the next time it is switched on clears or replaces `once`.
- The engine's `nextDue(alarm, now, zone)` finds the next due time arithmetically, never by stepping minute by minute.

## §8 Stopwatch and timers

### §8.1 Stopwatch

- A large `MM:SS.cc` display (hours appear after an hour: `H:MM:SS.cc`), updating every animation frame while shown, an analog dial with a lap hand, and the laps list under it: lap number, lap time, newest first, the fastest green and the slowest red once there are three laps.
- **Start/Stop** (Space), **Lap** (L, while running), **Reset** (R, while stopped and not zero; Undo brings it back). The stopwatch keeps running across window closes and restarts (§3.2). Above 999 laps, Lap is disabled with "The lap list is full."

### §8.2 Timers

- **New Timer** (N, ⌘N, +): a duration field (`5`, `5m`, `1h30m`, `90s`, `1:30:00`, `25:00`; a bare number is minutes), a label, and the presets as buttons under it. Enter starts it. **Save as Preset** keeps the duration and label.
- Each timer is a card: a ring that empties, the time left (`H:MM:SS` or `M:SS`), its name (the label, or its length: "5 min timer"), the time it will end ("Ends 6:20 PM"), **Cancel** (a quiet button: back to idle with its length kept), **+1 min** and **Pause/Resume**. **+1 min** adds a minute to the time left and to the length. Delete removes a timer, with Undo. An ⋯ button on each card opens its context menu. An idle timer shows its length and **Start**. Any number run at once. Space pauses or resumes the selected timer.
- After the timers, a faded **New Timer** card: one button per preset (its label and length), then the common lengths 1, 3, 5 and 10 min that no preset already has, each starting a timer in one click, and **+ Custom…**, which opens New Timer. Right-click on a preset: Start, Rename, Delete.
- A finished timer rings (§9) and its card shows "Done" and the minutes since, with **Dismiss**, which closes the timer (removes it, with Undo), **+1 min**, which runs it again for a minute, and **Restart**. **Cancel** is only for a timer still running or paused, and puts it back to idle. Dismissing writes the file; the ringing itself doesn't.
- Empty: the New Timer card alone.

## §9 Ringing

### §9.1 Who rings

- Every running copy of Alarmony that has the file open rings its due alarms and finished timers: the desktop app with its window closed, a browser tab while it's open, never the CLI except `timer start --wait` (§12). Alarm times are on each device's own clock and zone.
- Per device: **Ring on this device** (on by default) and **Show notifications** (on). A device with Ring off shows alarms and timers but never sounds or notifies.

### §9.2 What ringing looks like

- The sound plays, rising from 20% to the set volume over 30 s, looped. The window (when shown) shows a ringing sheet over the tab: the alarm's time and label or the timer's label, **Stop** (default, Enter or Escape) and **Snooze** (S, only for alarms with snooze on). Several due at once stack in one sheet, newest first, each with its buttons, and one sound plays.
- A native notification ("Wake up · 7:00 AM" / "Pasta · Timer done"); clicking it shows the window with the sheet.
- Desktop: the menu-bar menu gains **Stop** and **Snooze** at its top while anything rings, so the window needn't open.
- Ringing stops by itself after 15 minutes. The notice then says "Missed: Wake up at 7:00 AM", and stays until dismissed.
- Snooze rings that alarm again after `snoozeMinutes` (1–60, default 9) on this device only. A snooze is remembered on this device until it rings, across a restart.

### §9.3 Rung, stopped and snoozed are per device

- Ringing, stopping and snoozing never write the file. Each device remembers in its own storage what it rang (by alarm id and due time, or timer id and `endsAt`), for 3 days, so nothing rings twice. Moving an alarm's time or restarting a timer makes it ring again at the new time.

### §9.4 Missed while not running

- On start, waking from sleep or reopening a tab, an alarm or timer that came due in the last 10 minutes rings now. Older ones, back to the last time this device was running (at most 24 h), each give one notice "Missed: Wake up at 7:00 AM" that stays until dismissed.
- Browser: background tabs throttle timers, so a tab rings up to a minute late; the status bar's "Keep this tab open to ring" says so on hover, and the Settings page too. Sound in a browser needs one click on the page first; until then a due alarm shows the sheet and a notification, and the sheet's first click starts the sound.

### §9.5 Scheduling

- The UI keeps one scheduler: a timer set to the next due moment across all alarms, snoozes and timers, recomputed on every change, on a zone change and on waking; plus a 1 s check while anything is due within a minute. It uses `nextDue` and `Date.now()` only through the scheduler module.

## §10 Sounds

- Made with Web Audio from recipes in the engine (notes, envelopes, waveforms, repeat gap): **Chimes** (default), **Bells**, **Marimba**, **Digital** (beeps), **Rising** (soft swell), **Harp**, **Radar**, **Gentle** (one sine note). A volume setting per device (default 80%). Picking a sound in the editor or Settings plays one cycle.

## §11 Undo

- Every edit is one undo step: add, edit, delete, reorder, enable or disable, start, pause, resume, cancel, dismiss, lap, reset, presets. ⌘Z / ⇧⌘Z. A picked-up outside change is one step (§3.5). Undo after a merge applies to this window's own operations only.

## §12 CLI

- `alarmony` on the same engine, against a folder (`--dir`, else `ALARMONY_DIR`, else the desktop app's `folder.json`). `--json` on every command.
  - `clocks` lists clocks with their current time; `clock add <zone or city>` (a city matches as in §6.1; several matches list them and exit 1); `clock remove <id or name>`.
  - `alarms` lists alarms (id, time, repeat, label, on/off, next due); `alarm add <time> [--days weekdays|weekends|daily|mon,wed] [--label] [--sound] [--no-snooze]`; `alarm on|off|delete <id or label>`; `alarm edit <id> [same options] [--time]`.
  - `timers` lists timers with time left; `timer start <duration> [--label] [--wait]` adds a running timer the apps ring; with `--wait` it also counts down in the terminal and rings the terminal bell at the end (Ctrl-C leaves the timer running in the file). `timer pause|resume|cancel|delete <id or label>`. `presets`, `preset add <duration> --label`, `preset delete`.
  - `stopwatch [start|stop|lap|reset]`, without an argument shows the time and laps.
  - Times and durations parse as in §7.2 and §8.2. Deleting prints what was deleted, as JSON with `--json`.
- Saves go through the same operations, lock file and replay (§3.5); a conflict on the same item after one retry exits 2. Exit codes: 0 ok, 1 error (message on stderr), 2 conflict. A wrong command line (an unknown command or option, a missing argument) is an error: exit 1, with a pointer to `--help`.
- An item is named by its id, its exact name (label, city or time), a name containing the text, or an id prefix of 4 or more characters, in that order, among only the items the command can act on (`timer pause` looks at running timers). Several matches are listed with their ids and exit 1.
- The CLI never creates the folder. An empty folder gets a new file, with one clock for this device's zone (§6.1), on the first change. A corrupt or newer file is left alone and exits 1.
- Turning an alarm on that is already on, or resetting a stopwatch at zero, changes nothing and exits 0, saying so (`"changed": false`).
- `man` prints every command and option; `schema` prints the shape of each `--json` reply. Under `--json` an error is `{"ok": false, "error", "exit"}` on stdout as well as the message on stderr.

## §13 Settings (⌘,)

- Per device: theme, time format (system, 12-hour, 24-hour), show seconds on world clocks, world clock view (cards, list), ring on this device, show notifications, volume, open at login (desktop), show countdown in the menu bar (desktop, default on), last tab.
- In the file: snooze length (§9.2).

## §14 Commands and keys

Every action is a command in one catalog that feeds the keyboard, ⌘K, context menus, the native menu bar, the toolbar, the Keyboard Shortcuts window (⌘/) and `docs/controls.md`. Single-letter keys work only when focus isn't in a text field.

The Keyboard Shortcuts window has **Press a Shortcut…**: while it's on, a key press (or, on the desktop, a menu bar shortcut) shows which command it runs, or "runs no command", and runs nothing. Esc always leaves it and is never taken, so it also closes the window; **Stop** leaves it and keeps the window open. Closing the window ends it, and so does any error while it's on, so no key stays swallowed.

| Key | Command |
| --- | --- |
| ⌘1–⌘4 | Timers, Stopwatch, Alarms, World Clock |
| N, ⌘N | New clock, alarm or timer on the current tab |
| Enter | Edit the selected item |
| Delete, ⌫ | Delete the selected item |
| Space | Toggle the selected alarm; start/stop the stopwatch; pause/resume the selected timer |
| L / R | Lap / Reset (Stopwatch) |
| ⌥↑ ⌥↓ | Move the selected clock |
| ⌘L | Cards or list (World Clock) |
| S | Snooze (while ringing) |
| ⌘Z ⇧⌘Z | Undo, redo |
| ⌘K | Command menu |
| ⌘/ | Keyboard Shortcuts |
| ⌘, | Settings |
| ⌘O | Open Folder… (desktop) |

On a tab, the arrow keys move focus between its items: the clocks, the alarms, the timers, the buttons on the add cards and rows, or the stopwatch's buttons. ← → step through them in order, ↑ ↓ go to the row above or below, and both wrap at the ends. From the page or the tab row (↓), an arrow goes to the selected item, else the first or the last.

Context menus: a clock (Rename, Move Up, Move Down, Delete); an alarm (Edit, Turn On/Off, Duplicate, Delete); a timer (Start/Pause/Resume, Edit, Add 1 Minute, Cancel, Dismiss, Save as Preset, Delete); a preset (Start, Rename, Delete); a lap (Copy Time). Shift+F10, or the ⋯ button on a clock, alarm or timer, opens its menu; arrows move in it and Escape closes it.

## §15 Desktop

- Electron, the shared static build, `app://alarmony/`, sandboxed renderer with one `alarmonyNative` bridge. Native menu from the catalog (Alarmony, File, Edit, View, Window, Help).
- **Menu bar (tray) icon** on every platform, a template image. Its title shows the soonest running timer's time left (`9:41`) when that setting is on, else nothing. Its menu: Stop / Snooze while ringing, the next alarm ("Next: Wake up, 7:00 AM"), running timers with time left, Show Alarmony, Pause All Timers, Settings…, Quit Alarmony.
- **Closing the window** hides it and keeps its page running, on every platform, so the scheduler, sounds and notifications go on. The first close shows a sheet before hiding: "Alarmony keeps running in the menu bar so alarms ring." with **OK**, **Cancel** (keeps the window open; the note shows again on the next close) and Don't Show Again. The Dock icon stays on macOS; clicking it, the tray's Show, or a notification shows the window.
- **Quitting** (⌘Q, the tray's Quit) while an alarm is on or a timer runs asks "Quit Alarmony? Alarms won't ring until you open it again." with **Keep Running** (default) and **Quit**, plus Don't Ask Again. It finishes saves first (2.5 s, then a snapshot).
- **Open at login** uses the system's login items, opening hidden in the menu bar.
- The renderer runs with `backgroundThrottling: false`, and while any alarm is on or timer runs the app holds `powerSaveBlocker('prevent-app-suspension')` so App Nap doesn't delay ringing. It doesn't keep the Mac awake. Sound plays with no click first (`autoplayPolicy: 'no-user-gesture-required'`).
- On waking from sleep (`powerMonitor` resume), the scheduler re-checks at once (§9.4).
- `ALARMONY_HEADLESS=1` runs it with no window, tray or Dock icon, for checks. `ALARMONY_USER_DATA` moves its own files (window place) and `ALARMONY_FOLDER` the data folder. With `ALARMONY_USER_DATA` and no `ALARMONY_FOLDER`, the data folder is `Alarmony` inside it, so a check never touches Documents.
- Window size and place remembered, clamped to a visible display. Update checks notify only.
- The icon is `assets/icon.svg`, rendered by `just icons` into `apps/desktop/build`.

## §16 Accessibility

- Tabs are a `tablist`. Every control has a label ("Wake up, 7:00 AM, weekdays, on"). The ringing sheet is an `alertdialog` and the live region announces it. Running numbers are `aria-hidden` with a label that updates each second (each minute for timers above 10 minutes) so screen readers aren't flooded. Focus always visible. Contrast AA in both themes. Colour is never the only signal (fastest and slowest laps also say so).

## §17 Decisions and the heuristics behind them

1. **One file, operations replayed on conflict** (§3.5). Records are tiny and independent; asking about two unrelated alarms added on two Macs would be noise (aesthetic and minimalist design). Conflicts on the same item still ask (user control and freedom).
2. **Ringing never writes the file** (§9.3). Several devices ring the same alarm; if each wrote "stopped", every alarm would end in a conflict. One-off alarms that have passed read as off from `once`, so nothing has to switch them off.
3. **Undo instead of a Trash** (§11). An alarm is one line; a status-bar Undo and ⌘Z bring it back without a Trash view to manage (recognition rather than recall, minimalist design).
4. **Keep running in the menu bar on close** (§15). An alarm clock that stops when its window closes fails its one job (error prevention); quitting warns.
5. **No NAS in 1.0** (§2). A server can't make a sound on the user's phone or Mac.

## Open questions

None.
