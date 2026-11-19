import { effect } from '@preact/signals';
import { render } from 'preact';
import '@alarmony/ui/styles.css';
import {
  BrowserStore,
  ClockSession,
  MemoryStore,
  NativeStore,
  SoundPlayer,
  after,
  deviceMemory,
  every,
  frames,
  listenKeys,
  loadSettings,
  localRecovery,
  rungLog,
  type ClockStore,
} from '@alarmony/ui';
import { App, handleKey } from './app/App.tsx';
import { buildCommands } from './app/commands.ts';
import { AppController } from './app/controller.ts';
import { nativeBridge } from './app/native.ts';
import { menuSender, nativeMenu, watchMenuInputs } from './app/nativeMenu.ts';
import pkg from '../package.json';

/** How often an open window looks for changes made elsewhere (PRD §3.5). */
const REFRESH_MS = 15_000;
/** The countdowns move, and due timers are checked, once a second (PRD §9.5). */
const TICK_MS = 1000;
const root = document.getElementById('app')!;
const native = nativeBridge();

/** System notifications: the desktop app's own, else the browser's once allowed (PRD §9.2). */
function notifier(): { notify: (title: string) => void; ask: () => void } {
  if (native) return { notify: (title) => native.notify(title), ask: () => undefined };
  const N = typeof Notification === 'undefined' ? null : Notification;
  if (!N) return { notify: () => undefined, ask: () => undefined };
  return {
    notify(title) {
      if (N.permission !== 'granted') return;
      const n = new N(title);
      n.onclick = () => {
        focus();
        n.close();
      };
    },
    ask() {
      if (N.permission === 'default')
        void N.requestPermission().then(
          () => undefined,
          (e: unknown) => console.warn('Notifications not allowed:', e),
        );
    },
  };
}

/** The desktop app's folder, else this browser's own storage, else memory only (PRD §3.7). */
function chooseStore(): { store: ClockStore; notice: string | null } {
  if (native) return { store: new NativeStore(native), notice: null };
  if (BrowserStore.available()) return { store: new BrowserStore(), notice: null };
  return {
    store: new MemoryStore(null),
    notice: "This browser can't keep files, so nothing here is saved after the tab closes.",
  };
}

async function start(): Promise<void> {
  const choice = chooseStore();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { session, notice } = await ClockSession.open(choice.store, { recovery: localRecovery(), zone });
  const notifications = notifier();
  const app = new AppController(session, {
    now: () => Date.now(),
    zone,
    memory: deviceMemory(),
    notify: notifications.notify,
    askToNotify: notifications.ask,
    version: native?.version ?? pkg.version,
    settings: loadSettings(),
    rung: rungLog(Date.now()),
    after,
    sound: new SoundPlayer(),
    ...(native
      ? {
          // Saves still waiting go to the old folder before the window reloads from the new one.
          openFolder: () => session.flush().then(() => native.openFolder()),
        }
      : {}),
  });
  const catalog = buildCommands(app);
  render(<App app={app} catalog={catalog} />, root);
  const startNotice = notice ?? choice.notice;
  if (startNotice) app.say(startNotice, { sticky: true, tone: 'error' });

  effect(() => app.saveStatusChanged(session.status.value));
  effect(() => {
    document.title = app.title.value;
  });
  effect(() => {
    const theme = app.settings.value.theme;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  });
  effect(() => (app.wantsFrames.value ? frames(() => app.tickFrame()) : undefined));
  app.tick();
  every(TICK_MS, () => app.tick());
  listenKeys(document, (e) => handleKey(app, catalog, e));

  // Saves still waiting when the tab closes are kept by the recovery snapshot; ask the browser to wait.
  if (!native)
    addEventListener('beforeunload', (e) => {
      if (session.status.peek() !== 'saved') e.preventDefault();
    });
  if (import.meta.env.DEV) Object.assign(globalThis, { alarmony: { app, catalog } });

  // Changes made elsewhere show up when the window comes back, and every so often, hidden or not (PRD §3.5).
  const refresh = () => void app.refreshFromFile(document.hidden);
  addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  every(REFRESH_MS, refresh);

  if (native) {
    const html = document.documentElement.classList;
    html.toggle('al-unified', native.chrome === 'unified');
    native.onFullScreen((full) => html.toggle('al-fullscreen', full));
    native.onCommand((id) => {
      // Menu accelerators reach the app before the page; in a text field ⌘Z stays the field's.
      const inText = !!document.activeElement?.closest('input, textarea, select');
      if (inText && !catalog.get(id)?.global) {
        const fallback: Record<string, string> = { 'edit.undo': 'undo', 'edit.redo': 'redo' };
        if (fallback[id]) document.execCommand(fallback[id]);
        return;
      }
      catalog.run(id);
    });
    // The menu bar icon follows the page; Electron rebuilds its menu each time, so only changes are sent (PRD §15).
    let lastTray = '';
    effect(() => {
      const state = app.tray.value;
      const key = JSON.stringify(state);
      if (key === lastTray) return;
      lastTray = key;
      native.setTray(state);
    });
    // Only a change made in Settings reaches the system's login items, not every start.
    let loginSetting: boolean | null = null;
    effect(() => {
      const on = app.settings.value.openAtLogin;
      if (loginSetting !== null && on !== loginSetting) native.setOpenAtLogin(on);
      loginSetting = on;
    });
    // After sleep, due alarms and timers ring (or are missed) at once, not at the next tick (PRD §9.4).
    native.onWake(refresh);
    native.onCloseRequested(() => {
      void session.flush().finally(() => native.closeReady());
    });
    const menu = menuSender((items) => native.setMenu(items));
    addEventListener('focus', () => {
      menu.forget();
      menu.send(nativeMenu(catalog));
    });
    menu.send(nativeMenu(catalog));
    watchMenuInputs(app, () => menu.send(nativeMenu(catalog)));
  }
}

start().catch((e: unknown) => {
  console.error(e);
  root.textContent = `Alarmony couldn't start: ${e instanceof Error ? e.message : String(e)}`;
});
