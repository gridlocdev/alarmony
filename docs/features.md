# Features

Alarmony is a clock for the desktop and the browser: world clocks, alarms, a stopwatch and timers. The desktop app, the browser and (later) the command line all read and write the same `clock.json`. The exact behaviour of each feature is in the [product requirements](plans/prd.md).

## World Clock

The World Clock tab (**⌘1**) shows the time in the places you care about, as cards with an analog face (light by day, dark at night there) or as a list (**⌘L**). Each says how far ahead or behind it is: "Today, +9 hrs" or "Yesterday, −8 hrs". Press **N** (or **+**) to add a place: type a city, a region or an abbreviation such as `EST`, then Enter. The list stays open so you can add several. **Enter** renames the selected clock, **⌥↑** and **⌥↓** move it, and **Delete** removes it, with Undo. A new file starts with one clock for where you are; it's an ordinary clock you can rename or delete. Settings can show seconds.

## Alarms

The Alarms tab (**⌘2**) lists your alarms by time of day, and the next one to ring says how long until it does. Press **N** (or **+**) for a new alarm. Type the time the way you'd say it: `7`, `7:30`, `730`, `7:30 pm` and `19:30` all work, or step the hour or minute with **↑** and **↓**. Pick the days it repeats (or **Weekdays**, **Weekends**, **Every Day**), a label and one of eight sounds, and whether it can snooze. An alarm with no days rings once, at the next time it comes round, then turns itself off.

The switch on each row turns an alarm on or off, and so does **Space** on the selected one. **Enter** or a double-click opens it to edit, and each change saves as you make it. **Delete** removes it, and **⌘Z** brings it back. Alarms ring at the wall-clock time where you are, so they follow you across time zones and through daylight saving changes.

## Stopwatch

The Stopwatch tab shows the time to hundredths of a second, an analog dial with a lap hand, and the laps under it, newest first. Press **Space** to start or stop, **L** for a lap and **R** to reset. Once there are three laps the fastest is green and the slowest red, and both say so in words. The stopwatch keeps running when you close the window or restart the app, because its start time is in the file.

## Timers

Press **N** (or the **+** button) for a new timer. Type how long: `5` is five minutes, and `5m`, `1h30m`, `90s`, `25:00` and `1:30:00` all work. Add a label if you like, then press Enter. Run as many timers as you like at once. Each card shows a ring that empties, the time left, the label and when it will end. **Pause**, **Resume** and **Cancel** are on the card, and **Space**, **Enter** and **Delete** work on the selected one.

**Save as Preset** keeps a length and label. Presets show as chips above the timers and as buttons in New Timer; click one to start a timer from it.

## Ringing

When an alarm goes off or a timer finishes, Alarmony plays its sound, growing louder over 30 seconds, and shows a sheet with **Stop** (Enter or Esc). An alarm that can snooze also has **Snooze** (**S**), which rings it again after the snooze length in Settings. A finished timer's card then says Done, with **Restart** and **Dismiss**. Ringing stops by itself after 15 minutes and leaves a "Missed" notice. Anything that came due while Alarmony wasn't open rings if it was in the last 10 minutes, and gives a "Missed" notice if it's older. Alarmony also shows a system notification; turn off **Show notifications** in Settings if you'd rather not.

Every copy of Alarmony with the file open rings, so turn off **Ring on this device** in Settings on a device that should stay quiet. In a browser, sound starts after your first click on the page, and a tab in the background can ring up to a minute late.

## Keeping your data

Every change saves at once to `clock.json`. On the desktop the file is in `Documents/Alarmony`; in a browser it is in the browser's own storage. Every change can be undone with **⌘Z**. If another window or device changed the file while you had unsaved changes, Alarmony asks whether to keep yours or theirs. A file it can't read is kept aside, never overwritten.

## Commands and shortcuts

Every action is in the command menu (**⌘K**), which also starts presets by name, and in the Keyboard Shortcuts window (**⌘/**). See [controls](controls.md) for the full list.

## Look

Light and dark themes follow the system, or pick one in Settings (**⌘,**). Times use tabular digits so they don't jitter, and reduced motion turns off the animations.
