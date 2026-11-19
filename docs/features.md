# Features

Alarmony is a clock for the desktop and the browser: a stopwatch and timers now, with world clocks and alarms on the way. The desktop app, the browser and (later) the command line all read and write the same `clock.json`. The exact behaviour of each feature is in the [product requirements](plans/prd.md).

## Stopwatch

The Stopwatch tab shows the time to hundredths of a second, an analog dial with a lap hand, and the laps under it, newest first. Press **Space** to start or stop, **L** for a lap and **R** to reset. Once there are three laps the fastest is green and the slowest red, and both say so in words. The stopwatch keeps running when you close the window or restart the app, because its start time is in the file.

## Timers

Press **N** (or the **+** button) for a new timer. Type how long: `5` is five minutes, and `5m`, `1h30m`, `90s`, `25:00` and `1:30:00` all work. Add a label if you like, then press Enter. Run as many timers as you like at once. Each card shows a ring that empties, the time left, the label and when it will end. **Pause**, **Resume** and **Cancel** are on the card, and **Space**, **Enter** and **Delete** work on the selected one.

**Save as Preset** keeps a length and label. Presets show as chips above the timers and as buttons in New Timer; click one to start a timer from it.

## Ringing

When a timer finishes, Alarmony plays a chime that grows louder over 30 seconds and shows a sheet with **Stop** (Enter or Esc). The card then says Done, with **Restart** and **Dismiss**. Ringing stops by itself after 15 minutes and leaves a "Missed" notice. A timer that finished while Alarmony wasn't open rings if it finished in the last 10 minutes, and gives a "Missed" notice if it's older.

Every copy of Alarmony with the file open rings, so turn off **Ring on this device** in Settings on a device that should stay quiet. In a browser, sound starts after your first click on the page, and a tab in the background can ring up to a minute late.

## Keeping your data

Every change saves at once to `clock.json`. On the desktop the file is in `Documents/Alarmony`; in a browser it is in the browser's own storage. Every change can be undone with **⌘Z**. If another window or device changed the file while you had unsaved changes, Alarmony asks whether to keep yours or theirs. A file it can't read is kept aside, never overwritten.

## Commands and shortcuts

Every action is in the command menu (**⌘K**), which also starts presets by name, and in the Keyboard Shortcuts window (**⌘/**). See [controls](controls.md) for the full list.

## Look

Light and dark themes follow the system, or pick one in Settings (**⌘,**). Times use tabular digits so they don't jitter, and reduced motion turns off the animations.
