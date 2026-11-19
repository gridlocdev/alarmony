/** The `alarmony` executable: the real process streams, clock, zone and Ctrl-C. */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { runCli } from './cli.ts';
import type { CliIo } from './context.ts';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

const io: CliIo = {
  stdout: (text) => void process.stdout.write(text),
  stderr: (text) => void process.stderr.write(text),
  env: process.env,
  platform: process.platform,
  homeDir: homedir(),
  zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  now: () => Date.now(),
  wait: (ms) =>
    new Promise((resolve) => {
      // Ctrl-C while waiting ends the wait, not the process: `timer start --wait` then says the timer runs on.
      const interrupted = () => {
        clearTimeout(timer);
        resolve(false);
      };
      const timer = setTimeout(() => {
        process.off('SIGINT', interrupted);
        resolve(true);
      }, ms);
      process.once('SIGINT', interrupted);
    }),
};

process.exitCode = await runCli(process.argv.slice(2), io, pkg.version);
