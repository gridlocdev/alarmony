# Changelog

## 1.0.0

- A world clock: add places by city name, rename them, and reorder them by key or by drag.
- Alarms with repeat days, a label, a sound and snooze. They ring until you stop them, on every running copy that has Ring on this device turned on; one missed while Alarmony was closed shows as a notice.
- A stopwatch with laps, and countdown timers with labels and presets, in the browser and as a desktop app. A timer without a label is named by its length ("5 min timer"), shows when it ends, and has **+1 min**, even once it is done.
- On the desktop, closing the window keeps Alarmony in the menu bar with the soonest timer's time left, Stop and Snooze while something rings, and Open at login. Alarms due during sleep ring on wake.
- Everything is saved to one `clock.json`: in a folder you pick on the desktop's first start, or in the browser's own storage. In Chrome and Edge the browser can use a folder too, and every browser can export and import `clock.json`.
- Changes made in another window, on another device or from the command line show up within 15 seconds and merge with yours; Alarmony asks only when both changed the same thing. A file from a newer Alarmony is shown read-only and left as it is.
- The `alarmony` command lists and changes clocks, alarms, timers, presets and the stopwatch from a terminal, with `--json` output.
- Every action is in the ⌘K command menu, on right-click and behind the ⋯ button on each timer, alarm and clock (⇧F10 from the keyboard), with the shortcuts under ⌘/. Undo and redo take back any change.
- Light and dark themes with AA contrast, and a 12- or 24-hour clock.
