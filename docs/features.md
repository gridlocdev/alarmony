# Features

Alarmony is a clock for the desktop and the browser: world clocks, alarms, a stopwatch and timers. The desktop app, the browser and the command line all read and write the same `clock.json`. The exact behaviour of each feature is in the [product requirements](plans/prd.md).

## Timers

Press **N** (or the **+** button) for a new timer. Type how long: `5` is five minutes, and `5m`, `1h30m`, `90s`, `25:00` and `1:30:00` all work. Add a label if you like, then press Enter. Run as many timers as you like at once. Each card shows a ring that empties, the time left, the label and when it will end. **Pause**, **Resume** and **Cancel** are on the card, and **Space**, **Enter** and **Delete** work on the selected one.

The faded **New Timer** card after the timers starts one in a single click: your presets, then 1, 3, 5 or 10 minutes. **+ Custom…** on it opens New Timer. **Save as Preset** keeps a length and label; presets show on that card and as buttons in New Timer, and right-clicking one renames or deletes it.

## Stopwatch

The Stopwatch tab shows the time to hundredths of a second, an analog dial with a lap hand, and the laps under it, newest first. Press **Space** to start or stop, **L** for a lap and **R** to reset. Once there are three laps the fastest is green and the slowest red, and both say so in words. The stopwatch keeps running when you close the window or restart the app, because its start time is in the file.

## Alarms

The Alarms tab (**⌘3**) lists your alarms by time of day, and the next one to ring says how long until it does. Press **N** (or **+**) for a new alarm. Type the time the way you'd say it: `7`, `7:30`, `730`, `7:30 pm` and `19:30` all work, or step the hour or minute with **↑** and **↓** (in the empty field they fill in the next whole hour). Pick the days it repeats, from the first day of the week where you are (or **Never**, **Weekdays**, **Weekends**, **Every Day**, which shows as pressed when it matches), a label and one of eight sounds, and whether it can snooze. An alarm with no days rings once, at the next time it comes round, then turns itself off.

The faded **+ New Alarm** row at the end of the list adds one too. The switch on each row turns an alarm on or off, and so does **Space** on the selected one. **Enter** or a double-click opens it to edit, and each change saves as you make it. **Delete** removes it, and **⌘Z** brings it back. Alarms ring at the wall-clock time where you are, so they follow you across time zones and through daylight saving changes.

## World Clock

The World Clock tab (**⌘4**) shows the time in the places you care about, as cards with an analog face (light by day, dark at night there) or as a list (**⌘L**). Each says how far ahead or behind it is: "Today, +9 hrs" or "Yesterday, −8 hrs". Press **N** (or **+**) to add a place. The list starts with the places at your own time; type a city, a region or an abbreviation such as `EST`, then Enter. The list stays open so you can add several. The faded **+ Add Clock** card after the clocks does the same. **Enter** renames the selected clock, dragging it or **⌥↑** and **⌥↓** move it, and **Delete** removes it, with Undo. A new file starts with one clock for where you are; it's an ordinary clock you can rename or delete. Settings can show seconds.

## Ringing

When an alarm goes off or a timer finishes, Alarmony plays its sound, growing louder over 30 seconds, and shows a sheet with **Stop** (Enter or Esc). An alarm that can snooze also has **Snooze** (**S**), which rings it again after the snooze length in Settings. A finished timer's card then says Done, with **Restart** and **Dismiss**, which closes the timer. Ringing stops by itself after 15 minutes and leaves a "Missed" notice. Anything that came due while Alarmony wasn't open rings if it was in the last 10 minutes, and gives a "Missed" notice if it's older. Alarmony also shows a system notification; turn off **Show notifications** in Settings if you'd rather not.

Every copy of Alarmony with the file open rings, so turn off **Ring on this device** in Settings on a device that should stay quiet. In a browser, sound starts after your first click on the page, and a tab in the background can ring up to a minute late. While something is set to ring, the status bar says **Keep this tab open to ring**.

## Keeping your data

Every change saves at once to `clock.json`. On the desktop, the first start asks where to keep it: **Use Documents/Alarmony** or **Choose Folder…** (a synced folder shares your clock with other computers); **Open Folder…** (**⌘O**) moves to another later. In a browser it is in the browser's own storage; in Chrome and Edge, **Open Folder…** (**⌘O**) keeps it in a folder you pick instead (copying your clock there if the folder has none), and **Use This Browser's Storage** brings it back. In any browser, **Export clock.json…** downloads a copy and **Import clock.json…** replaces everything with a file you pick, which **⌘Z** takes back. Every change can be undone with **⌘Z**. Changes made in another window, on another device or from the command line show up within 15 seconds, and **⌘Z** takes them back. If the file changed while you had unsaved changes, Alarmony merges the two; it asks whether to keep yours or theirs only when both changed the same thing, listing what both changed. If Alarmony closed before it could save, the next start offers to restore those changes on top of the file. A file it can't read is kept aside, never overwritten. A file saved by a newer Alarmony is shown, and its alarms and timers ring, but nothing here changes it until you update. The status bar names the folder the file is in; point at it for the full path.

## Desktop in the background

Closing the desktop window doesn't quit Alarmony: it keeps running in the menu bar so alarms ring, and says so the first time; choose **Cancel** there to keep the window open. The menu bar icon shows the soonest timer's time left (turn off **Show countdown in the menu bar** in Settings to hide it), and its menu has Stop and Snooze while something rings, the next alarm, running timers, Show Alarmony, Pause All Timers, Settings… and Quit Alarmony. Quitting while an alarm is on or a timer runs asks first. **Open at login** in Settings starts Alarmony in the menu bar when you log in. After the computer wakes from sleep, anything that came due rings at once.

## Commands and shortcuts

Every action is in the command menu (**⌘K**), which also starts presets by name, and in the Keyboard Shortcuts window (**⌘/**). Right-click a clock, an alarm, a timer, a preset or a lap for a menu of what it can do (**⇧F10** from the keyboard); a preset's menu is where you rename it, and a lap's copies its time. See [controls](controls.md) for the full list.

## Command line

The `alarmony` command lists and changes the same clocks, alarms, timers, presets and stopwatch from a terminal or a script, and the apps pick up each change within a second: `alarmony alarm add 7:30 --days weekdays --label Wake`, `alarmony timer start 10m --label Pasta`, `alarmony clock add Tokyo`. `--json` prints one JSON document per reply, `alarmony man` prints every command, and `timer start --wait` counts down in the terminal and rings its bell. If an app changed the file at the same time, the command merges its edit in; if both changed the same thing it saves nothing and exits 2. See [the CLI's guide](../apps/cli/skill/SKILL.md).

## Look

Light and dark themes follow the system, or pick one in Settings (**⌘,**). Times use tabular digits so they don't jitter, and reduced motion turns off the animations.
