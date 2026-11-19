// Where the scenarios and the driver find the app: the built web client, served as static files.
// The page keeps clock.json in the browser's own storage, so every test's fresh browser context starts empty.
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** A port of its own, so another app's checks can run at the same time without EADDRINUSE. */
export const PORT = 8799;
export const BASE_URL = `http://127.0.0.1:${PORT}`;
/** The page's clock in every scenario and in the driver: a Friday morning, UTC. */
export const NOW = new Date('2027-01-15T09:00:00Z');

export const SERVER_COMMAND = ['e2e/static.ts'];
export const SERVER_ENV: Record<string, string> = {
  ALARMONY_E2E_PORT: String(PORT),
  ALARMONY_E2E_DIR: `${ROOT}apps/web/dist`,
};
