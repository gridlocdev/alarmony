/**
 * In a headless run an error nobody caught in the main process must not reach Electron's own handler, which shows
 * a "JavaScript error occurred in the main process" dialog on the screen. main.ts imports this first, so the
 * handlers are in place before any other code runs: the error goes to stderr and the process exits with 1.
 */

/** Whether this run is headless: ALARMONY_HEADLESS=1 or --headless. */
export function isHeadless(env: NodeJS.ProcessEnv, argv: readonly string[]): boolean {
  return env.ALARMONY_HEADLESS === '1' || argv.includes('--headless');
}

/** Reports an uncaught error or unhandled rejection, then ends the process. */
export function quitOnError(
  kind: string,
  error: unknown,
  log: (text: string) => void,
  exit: (code: number) => void,
): void {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  log(`Alarmony (headless): ${kind}: ${detail}\n`);
  exit(1);
}

if (isHeadless(process.env, process.argv)) {
  const log = (text: string) => process.stderr.write(text);
  const exit = (code: number) => process.exit(code);
  process.on('uncaughtException', (e) => quitOnError('uncaught exception', e, log, exit));
  process.on('unhandledRejection', (e) => quitOnError('unhandled rejection', e, log, exit));
}
