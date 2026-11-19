/**
 * Alarmony desktop (PRD §15): one window running the web build from app://alarmony/, with clock.json in the folder
 * chosen at first start (or the one ALARMONY_FOLDER names). The page reaches the disk only through the preload's
 * `alarmonyNative`. Closing the window hides it, so the page keeps ringing; the menu bar icon brings it back.
 */
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  net,
  Notification,
  powerMonitor,
  powerSaveBlocker,
  protocol,
  screen,
  shell,
  Tray,
} from 'electron';
import { statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FOLDER_FILE, parseFolderFile, readDataFile, writeCopy, writeDataFile } from '@alarmony/node-files';
import {
  EMPTY_TRAY,
  parsePrefs,
  parseTrayState,
  readJsonFile,
  reloadAfterCrash,
  trayMenu,
  writeJsonFile,
  type BackgroundPrefs,
} from './background.ts';
import { Channels, type NativeMenuItem, type TrayState } from './bridge.ts';
import { systemDialogs } from './dialogs.ts';
import { editMenuTemplate, toTemplate, withStandardMenus } from './menu.ts';
import { appFile, dataPaths, isAppUrl, startFolder } from './paths.ts';
import { loadSavedWindow, placeWindow, saveWindow, type SavedWindow } from './windowState.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(here, 'web');
/** How long quitting waits for the page to finish saving; after that the recovery snapshot has the rest. */
const CLOSE_WAIT_MS = 2500;
const MIN_SIZE = { width: 640, height: 440 };
/**
 * macOS: a unified title bar. The page draws its own toolbar row and the traffic lights sit at its left;
 * the centre of the lights lines up with the tabs (PRD §12).
 */
const unified = process.platform === 'darwin';
/**
 * ALARMONY_HEADLESS=1 or --headless: render offscreen, muted, and never show a window, Dock icon or system dialog
 * (automated checks).
 */
const headless = process.env.ALARMONY_HEADLESS === '1' || process.argv.includes('--headless');
if (headless) app.dock?.hide();

const dialogs = systemDialogs(headless);
const paths = dataPaths(process.env, app.getPath('documents'));
if (paths.userData) app.setPath('userData', paths.userData);
/** The folder clock.json is in: settled before the window opens, changed by Open Folder… (PRD §3.7). */
let folder = paths.folder;
const dataFile = () => path.join(folder, 'clock.json');
// A timer rings without a click first: the window plays sound the moment a timer is due (PRD §9.4).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const windowFile = path.join(app.getPath('userData'), 'window-state.json');
const folderFile = path.join(app.getPath('userData'), FOLDER_FILE);
const prefsFile = path.join(app.getPath('userData'), 'prefs.json');
/** Started by the system at login: stay in the menu bar (PRD §15). */
const openedAtLogin =
  process.argv.includes('--hidden') ||
  (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin);

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let win: BrowserWindow | null = null;
let lastWindow: SavedWindow | null = null;
let quitting = false;
let prefs: BackgroundPrefs = parsePrefs(null);
let tray: Tray | null = null;
let trayState: TrayState = EMPTY_TRAY;
/** The power-save blocker held while an alarm is on or a timer runs. */
let blocker: number | null = null;
/** The close note shows once per run, before the first hide. */
let closeNoteShown = false;
/** The quit question is on the screen. */
let askingToQuit = false;

/** Only our own page may use the bridge. */
function trusted(e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  return isAppUrl(e.senderFrame?.url);
}

function rememberWindow(w: BrowserWindow): void {
  if (headless || w.isDestroyed() || w.isMinimized()) return;
  const b = w.getNormalBounds();
  lastWindow = { ...b, maximized: w.isMaximized() };
  void saveWindow(windowFile, lastWindow).catch((e: unknown) =>
    console.warn('Could not remember the window position:', e),
  );
}

function savePrefs(next: BackgroundPrefs): void {
  prefs = next;
  void writeJsonFile(prefsFile, prefs).catch((e: unknown) => console.warn('Could not save preferences:', e));
}

/** Brings the window back: the Dock icon, the tray's Show, a notification or a second launch. */
function showWindow(): void {
  if (!win) {
    win = createWindow(true);
    return;
  }
  if (headless) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** Closing hides the window; the page keeps running so alarms ring. The first close says so (PRD §15). */
async function hideWindow(w: BrowserWindow): Promise<void> {
  if (prefs.closeNote && !closeNoteShown) {
    closeNoteShown = true;
    const r = await dialogs.ask(w, {
      type: 'info',
      message: 'Alarmony keeps running in the menu bar so alarms ring.',
      buttons: ['OK'],
      defaultId: 0,
      checkboxLabel: 'Don’t show again',
    });
    if (r.checkboxChecked) savePrefs({ ...prefs, closeNote: false });
  }
  if (!w.isDestroyed()) w.hide();
}

/** Quitting while something would ring asks first; Keep Running is the default (PRD §15). */
async function askToQuit(): Promise<boolean> {
  const parent = win && !win.isDestroyed() && win.isVisible() ? win : null;
  const r = await dialogs.ask(parent, {
    type: 'warning',
    message: 'Quit Alarmony?',
    detail: 'Alarms won’t ring until you open it again.',
    buttons: ['Keep Running', 'Quit'],
    defaultId: 0,
    cancelId: 0,
    checkboxLabel: 'Don’t ask again',
  });
  if (r.checkboxChecked) savePrefs({ ...prefs, askBeforeQuit: false });
  return r.response === 1;
}

function quitNow(): void {
  quitting = true;
  app.quit();
}

/** The menu bar icon: the soonest timer's time left as its title (macOS), and its menu (PRD §15). */
function updateTray(): void {
  if (headless) return;
  if (!tray) {
    // "Template" in the name makes it a template image on macOS: it follows a light or dark menu bar.
    tray = new Tray(nativeImage.createFromPath(path.join(here, '..', 'build', 'trayTemplate.png')));
  }
  if (process.platform === 'darwin') tray.setTitle(trayState.title, { fontType: 'monospacedDigit' });
  tray.setToolTip(trayState.title ? `Alarmony · ${trayState.title}` : 'Alarmony');
  const command = (id: string) => win?.webContents.send(Channels.command, id);
  tray.setContextMenu(
    Menu.buildFromTemplate(trayMenu(trayState, { command, show: showWindow, quit: () => app.quit() })),
  );
}

/** While anything would ring, App Nap mustn't delay it; this doesn't keep the Mac awake (PRD §15). */
function holdAwake(armed: boolean): void {
  if (headless) return;
  if (armed && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
  else if (!armed && blocker !== null) {
    powerSaveBlocker.stop(blocker);
    blocker = null;
  }
}

/** Remembers the folder in folder.json, so the next start opens it. */
async function useFolder(chosen: string): Promise<void> {
  folder = chosen;
  await writeJsonFile(folderFile, { folder: chosen });
}

/**
 * The first-start question, and the same when the remembered folder is gone (PRD §3.7). Returns the folder, or
 * null to quit. Documents/Alarmony is made only when chosen; a folder that is gone is never made again.
 */
async function askForFolder(gone: string | null): Promise<string | null> {
  const documents = path.join(app.getPath('documents'), 'Alarmony');
  for (;;) {
    const r = await dialogs.ask(null, {
      type: gone ? 'warning' : 'question',
      message: gone ? `The folder “${gone}” isn’t there any more.` : 'Where should Alarmony keep its clock?',
      detail: gone
        ? 'Choose where to keep clock.json now. Nothing is made in place of the missing folder.'
        : 'Your clocks, alarms and timers are kept in clock.json in one folder. A synced folder shares them with your other computers.',
      buttons: ['Use Documents/Alarmony', 'Choose Folder…', 'Quit'],
      defaultId: 0,
      cancelId: 2,
    });
    if (r.response === 2) return null;
    if (r.response === 0) {
      await mkdir(documents, { recursive: true });
      return documents;
    }
    const chosen = await dialogs.pickFolder(null, { title: 'Choose Folder', buttonLabel: 'Use Folder' });
    if (chosen) return chosen;
  }
}

function isFolder(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function createWindow(visible: boolean): BrowserWindow {
  const fallback = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const placed = placeWindow(
    headless ? null : lastWindow,
    screen.getAllDisplays().map((d) => d.workArea),
    { ...fallback, width: Math.min(1100, fallback.width), height: Math.min(760, fallback.height) },
    MIN_SIZE,
  );
  const w = new BrowserWindow({
    x: placed.x,
    y: placed.y,
    width: placed.width,
    height: placed.height,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    title: 'Alarmony',
    ...(unified ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 18, y: 20 } } : {}),
    ...(process.platform === 'darwin' ? {} : { icon: path.join(here, '..', 'build', 'icon.png') }),
    show: false,
    // The page's background (--al-bg), so a slow first paint doesn't flash.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      offscreen: headless,
      // A window in the background still checks its timers every second (PRD §9.5).
      backgroundThrottling: false,
      additionalArguments: [
        `--alarmony-version=${app.getVersion()}`,
        `--alarmony-chrome=${unified ? 'unified' : 'native'}`,
      ],
    },
  });
  if (!headless && visible)
    w.once('ready-to-show', () => {
      if (placed.maximized) w.maximize();
      w.show();
    });
  let placeTimer: NodeJS.Timeout | null = null;
  const placeChanged = () => {
    if (placeTimer) clearTimeout(placeTimer);
    placeTimer = setTimeout(() => rememberWindow(w), 500);
  };
  for (const ev of ['move', 'resize', 'maximize', 'unmaximize'] as const) w.on(ev as 'move', placeChanged);

  // Closing asks the page to finish saving; it answers with closeReady. A page that doesn't answer in
  // time is closed anyway: unsaved edits are in its recovery snapshot.
  let allowClose = false;
  let closeTimer: NodeJS.Timeout | null = null;
  const closeNow = () => {
    allowClose = true;
    if (closeTimer) clearTimeout(closeTimer);
    if (!w.isDestroyed()) w.close();
  };
  w.on('close', (e) => {
    rememberWindow(w);
    if (allowClose) return;
    e.preventDefault();
    if (!quitting) {
      void hideWindow(w);
      return;
    }
    if (closeTimer) return;
    w.webContents.send(Channels.closeRequested);
    closeTimer = setTimeout(closeNow, CLOSE_WAIT_MS);
  });
  w.webContents.ipc.on(Channels.closeReady, (e) => {
    if (trusted(e)) closeNow();
  });
  const crashes: number[] = [];
  w.webContents.on('render-process-gone', (_e, details) => {
    if (closeTimer || quitting) return closeNow();
    if (details.reason === 'clean-exit') return;
    console.error(`The page stopped (${details.reason}).`);
    if (reloadAfterCrash(crashes, Date.now())) w.webContents.reload();
  });
  w.on('closed', () => {
    if (placeTimer) clearTimeout(placeTimer);
    if (win === w) win = null;
  });

  // In full screen the traffic lights hide, so the page drops the room it keeps for them.
  w.on('enter-full-screen', () => w.webContents.send(Channels.fullScreen, true));
  w.on('leave-full-screen', () => w.webContents.send(Channels.fullScreen, false));
  // Electron shows no menu of its own on right-click; text gets the edit menu, the page does the rest.
  w.webContents.on('context-menu', (_e, params) => {
    const template = editMenuTemplate(params, {
      replace: (word) => w.webContents.replaceMisspelling(word),
      learn: (word) => w.webContents.session.addWordToSpellCheckerDictionary(word),
    });
    if (template) Menu.buildFromTemplate(template).popup({ window: w });
  });

  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) e.preventDefault();
  });
  if (headless) w.webContents.setAudioMuted(true);
  void w.loadURL('app://alarmony/index.html');
  return w;
}

function registerIpc(): void {
  ipcMain.handle(Channels.load, async (e) => {
    if (!trusted(e)) throw new Error('Forbidden');
    return { ...(await readDataFile(dataFile())), folder };
  });
  ipcMain.handle(Channels.save, async (e, text: unknown, expected: unknown) => {
    if (!trusted(e) || typeof text !== 'string' || (expected !== null && typeof expected !== 'string'))
      throw new Error('Forbidden');
    const r = await writeDataFile(dataFile(), text, expected);
    return r.ok ? { ok: true, version: r.version } : { ok: false, reason: 'conflict' };
  });
  ipcMain.handle(Channels.saveCopy, async (e, text: unknown) => {
    if (!trusted(e) || typeof text !== 'string') throw new Error('Forbidden');
    return path.basename(await writeCopy(dataFile(), text));
  });
  ipcMain.handle(Channels.openFolder, async (e) => {
    if (!trusted(e)) throw new Error('Forbidden');
    if (!win) return;
    const chosen = await dialogs.pickFolder(win, {
      title: 'Open Folder',
      buttonLabel: 'Open',
      defaultPath: folder,
    });
    if (!chosen) return;
    await useFolder(chosen);
    win.webContents.reload();
  });
  ipcMain.on(Channels.setTray, (e, raw: unknown) => {
    const state = trusted(e) ? parseTrayState(raw) : null;
    if (!state) return;
    trayState = state;
    updateTray();
    holdAwake(state.armed);
  });
  ipcMain.on(Channels.setOpenAtLogin, (e, on: unknown) => {
    // Only the packaged app goes in the login items: a development run would add Electron itself.
    if (!trusted(e) || typeof on !== 'boolean' || headless || !app.isPackaged) return;
    app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
  });
  ipcMain.on(Channels.notify, (e, title: unknown) => {
    // A headless check never puts a notification on the screen.
    if (!trusted(e) || typeof title !== 'string' || headless || !Notification.isSupported()) return;
    const n = new Notification({ title: title.slice(0, 200), silent: true });
    n.on('click', showWindow);
    n.show();
  });
  ipcMain.on(Channels.setMenu, (e, items: readonly NativeMenuItem[]) => {
    if (!trusted(e) || !Array.isArray(items)) return;
    const send = (id: string) => win?.webContents.send(Channels.command, id);
    const template = withStandardMenus(toTemplate(items, send), process.platform, !app.isPackaged);
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showWindow);
  app.on('before-quit', (e) => {
    if (quitting) return;
    if (headless || !trayState.armed || !prefs.askBeforeQuit) {
      quitting = true;
      return;
    }
    e.preventDefault();
    if (askingToQuit) return;
    askingToQuit = true;
    void askToQuit().then((go) => {
      askingToQuit = false;
      if (go) quitNow();
    });
  });
  void app.whenReady().then(async () => {
    protocol.handle('app', (req) => {
      const file = appFile(webRoot, new URL(req.url).pathname);
      return file ? net.fetch(pathToFileURL(file).toString()) : new Response('Forbidden', { status: 403 });
    });
    registerIpc();
    prefs = parsePrefs(await readJsonFile(prefsFile));
    const start = startFolder(paths, headless, parseFolderFile(await readJsonFile(folderFile)), isFolder);
    if (start.kind === 'ask') {
      const chosen = await askForFolder(start.gone);
      if (!chosen) return quitNow();
      await useFolder(chosen);
    } else folder = start.folder;
    lastWindow = await loadSavedWindow(windowFile);
    updateTray();
    win = createWindow(!openedAtLogin);
    app.on('activate', showWindow);
    // Logging out or shutting down never waits on the quit question.
    powerMonitor.on('shutdown', () => {
      quitting = true;
    });
    // After sleep the page checks for due alarms and timers at once (PRD §9.4).
    powerMonitor.on('resume', () => win?.webContents.send(Channels.wake));
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || quitting || headless) app.quit();
  });
}
