import { DEFAULT_SETTINGS, MemoryStore, ClockSession, memoryRecovery, rungLog } from '@alarmony/ui';
import { buildCommands } from '../src/app/commands.ts';
import { AppController, type SoundOut } from '../src/app/controller.ts';

/** 2026-03-10, a Tuesday, at noon. */
export const NOW = new Date(2026, 2, 10, 12).getTime();

/** A sound player that records what it was asked to do. */
export function fakeSound(allowed = true) {
  const calls: string[] = [];
  let ringing = false;
  const sound: SoundOut & { calls: string[]; allowed: boolean } = {
    calls,
    allowed,
    get ringing() {
      return ringing;
    },
    unlock() {
      calls.push('unlock');
      sound.allowed = true;
    },
    ring(id) {
      calls.push(`ring ${id}`);
      ringing = true;
    },
    stop() {
      if (ringing) calls.push('stop');
      ringing = false;
    },
    preview(id) {
      calls.push(`preview ${id}`);
    },
  };
  return sound;
}

/** An app on a file in memory, with a clock the test moves (`clock.at`). */
export async function makeApp(text: string | null = null, opts: { soundAllowed?: boolean } = {}) {
  const clock = { at: NOW };
  const store = new MemoryStore(text);
  const { session } = await ClockSession.open(store, {
    recovery: memoryRecovery(),
    wait: async () => undefined,
  });
  const sound = fakeSound(opts.soundAllowed ?? true);
  /** Notices waiting to time out; `later.run()` times them all out at once. */
  const waiting = new Set<() => void>();
  const later = {
    run() {
      const all = [...waiting];
      waiting.clear();
      for (const run of all) run();
    },
  };
  const app = new AppController(session, {
    now: () => clock.at,
    version: '9.9.9',
    settings: DEFAULT_SETTINGS,
    rung: rungLog(NOW, false),
    sound,
    saveSettings: () => undefined,
    after: (_ms, run) => {
      waiting.add(run);
      return () => waiting.delete(run);
    },
  });
  const catalog = buildCommands(app);
  return { app, catalog, store, session, clock, sound, later };
}
