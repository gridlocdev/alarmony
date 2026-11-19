# Alarmony 1.0 slices

Each slice leaves `just check` green and the app working.

- [x] **1. Skeleton and first slice** (§3.1–§3.4, §4, §5, §8, §11, §13, §14 partly, §15 partly): workspace, engine (format, `classifyFile`, operations, undo, stopwatch and timer arithmetic, durations), stores (memory, browser, desktop file), the save session, the app shell (tabs, catalog, ⌘K, ⌘/, Settings, theme, notices), the Stopwatch and Timers tabs, timers ringing in the window with one built-in sound, the Electron shell with headless mode, tests and e2e. Waits on nothing.
  - Done as planned, with these left for later slices (the PRD sections stay as written):
    - Only the Stopwatch (⌘3) and Timers (⌘4) tabs. A saved World Clock or Alarms tab opens Timers.
    - A save conflict always asks (Keep Mine / Use Theirs); replaying edits on the other copy is slice 5. A refresh that finds an outside change replaces the document and clears undo.
    - A file from a newer Alarmony refuses to open instead of opening read-only.
    - The browser keeps clock.json in its private file system (OPFS) only.
    - One sound, Chimes.
    - The desktop folder is `ALARMONY_FOLDER` or Documents/Alarmony, with no first-start question. Closing the window closes it; it doesn't hide (slice 3).
    - No native notifications and no right-click menus: each timer card's buttons and × do what its menu would. Renaming a preset waits for its menu.
    - Stop on the ringing sheet stops the sound; the timer's card stays Done until Dismiss or Restart.
- [ ] **2. Alarms** (§7, §9, §10): the list and editor, `nextDue` with DST, the scheduler, the ringing sheet, snooze, notifications, all eight sounds, missed alarms.
- [ ] **3. Desktop in the background** (§15): tray with countdown and menu, hide on close, quit warning, open at login, power-save blocker, wake handling, first-start folder question, window state. Waits on 2.
- [ ] **4. World Clock** (§6): zone search, cards with analog faces, list view, reorder.
- [ ] **5. Changes made elsewhere** (§3.5, §3.6): replay and conflict dialog, refresh timers, crash snapshot and recovery.
- [ ] **6. CLI** (§12) with its agent skill file. Waits on 2 and 5.
- [ ] **7. Release polish**: icon, docs, CHANGELOG, CI and release workflows, accessibility pass (§16).
