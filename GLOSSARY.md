# Alarmony glossary

Alarmony is a clock app with timers, a stopwatch, alarms and world clocks, kept in one `clock.json` that the desktop app, the browser and the `alarmony` command all read and write.

## Language

### The file

**Clock file**: The one `clock.json` that holds every **Clock**, **Alarm**, **Preset** and **Timer** and the **Stopwatch**. In prose, call it `clock.json`. _Avoid_: database, document, data file (except in `packages/node-files`, which reads any such file)

**Folder**: The folder that holds the **Clock file**: `Documents/Alarmony`, one you choose with **Open Folder…**, or the browser's own storage. _Avoid_: data folder, notebook

**Operation**: One edit to one item (add, change fields, delete, move, start, pause, lap), kept until it is saved and replayed onto the file if it changed elsewhere. _Avoid_: patch, diff

**Outside change**: A change to the **Clock file** made by another window, device or the CLI, picked up and applied as one undo step. _Avoid_: remote change, sync

**Conflict**: When this window and an **Outside change** changed the same fields of the same item; the user picks **Keep Mine** or **Use Theirs**. _Avoid_: merge error

**Snapshot**: This window's unsaved **Operations**, written aside so that **Restore unsaved changes?** can bring them back after a crash. _Avoid_: backup, autosave file

**Device settings**: What each device keeps for itself and never writes to the **Clock file**: theme, time format, volume, **Ring on this device**, the open **Tab**, and its **Rung log**. _Avoid_: preferences, config

### Tabs and items

**Tab**: One of the four views, in order: **Timers**, **Stopwatch**, **Alarms** and **World Clock**. _Avoid_: page, screen, mode

**Timer**: A countdown with a length and an optional label, shown as a card with a ring. It is idle, running, paused or **Done**. _Avoid_: countdown

**Done**: The state of a **Timer** whose time has run out: it rings, then its card says "Done" and how long ago, with **Restart** and **Dismiss**. _Avoid_: expired, finished

**Preset**: A saved length and label that starts a new **Timer** in one click. _Avoid_: template, favourite, chip

**New Timer card**: The faded last card on the **Timers** tab: the **Presets**, then 1, 3, 5 and 10 minutes, and **+ Custom…**, which opens the New Timer dialog. _Avoid_: quick start, add card (for this one)

**Stopwatch**: The single count-up clock with **Laps**. There is only ever one.

**Lap**: One split of the **Stopwatch**, numbered, newest first; the fastest and slowest are marked once there are three. _Avoid_: split

**Alarm**: A time of day that rings, with **Repeat** days, a label, a sound and whether it can **Snooze**. It is on or off. _Avoid_: reminder, wake-up

**Repeat**: The days an **Alarm** rings on. With no days it is a **One-off alarm**. _Avoid_: schedule, recurrence

**One-off alarm**: An **Alarm** with no **Repeat** days: it rings once, at the next time it comes round, then shows as off. _Avoid_: single alarm, once alarm (`once` is its field in the file)

**Clock**: A place on the **World Clock** tab: a time zone with an optional label, shown as a card with an analog face or as a row. _Avoid_: place, city, zone (for the item; a **Clock** has a zone)

### Ringing

**Due**: When an **Alarm** or **Timer** should ring, worked out from the time now, never by counting.

**Ringing**: Playing the sound, growing louder, with the **Ringing sheet** in front, until **Stop**, **Snooze** or 15 minutes pass. Ringing never writes the **Clock file**. _Avoid_: firing, going off (in code and docs)

**Ringing sheet**: The sheet in front of the window while something is **Ringing**, with **Stop** and, for an **Alarm** that can, **Snooze**. _Avoid_: alert, popup, modal

**Snooze**: Stopping an **Alarm** for the snooze length in Settings, after which it rings again on this device.

**Rung log**: This device's record of what it has rung, kept in **Device settings**, so nothing rings twice on one device. _Avoid_: history

**Missed**: Something that came **Due** more than 10 minutes before Alarmony was running, or rang for 15 minutes unanswered; it gives a "Missed" **Notice** instead of ringing.

### The window

**Command**: One action in the command catalog, with a title and its shortcuts. The ⌘K menu, right-click menus, the menu bar, toolbar buttons and the Keyboard Shortcuts window all run **Commands**.

**Command menu**: The ⌘K search over every **Command**. _Avoid_: command palette

**Notice**: A short past-tense message in the status bar, sometimes with **Undo**, gone after 5 seconds or on the next action. A "Missed" **Notice** stays until dismissed. _Avoid_: toast, snackbar

## Relationships

- The **Clock file** holds many **Clocks**, **Alarms**, **Presets** and **Timers**, and one **Stopwatch**.
- A **Stopwatch** has up to 999 **Laps**.
- A **Preset** starts a new **Timer**; the **Timer** keeps no link to it.
- Every running copy of Alarmony with the **Folder** open rings what is **Due**, unless **Ring on this device** is off in its **Device settings**.
- Each edit is one **Operation** and one undo step; an **Outside change** is one undo step too.

## Flagged ambiguities

- "Clock" has meant the whole app, the **Clock file** (`clock.json`, "the clock" in some test names), the current time (`app.clock` in the code) and one item on the **World Clock** tab. **Clock** here means only that item; say `clock.json` for the file and "the time now" for the current time.
- "Data folder" has meant both the **Folder** that holds `clock.json` and the desktop app's own storage, where `folder.json` and **Snapshots** live. Use **Folder** for the first and "the app's data folder" only for the second.
