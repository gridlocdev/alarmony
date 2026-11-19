/**
 * Everything a command touches besides clock.json: the streams, the environment, the time and the zone. The
 * real process wires them in main.ts; tests pass a fake, so the whole CLI runs in-process on a fixed clock.
 */
import type { CommandSpec, Parsed } from './spec.ts';

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: string;
  readonly homeDir: string;
  /** This device's time zone. */
  readonly zone: string;
  now(): number;
  /** Waits up to `ms`; false when the user pressed Ctrl-C instead. */
  wait(ms: number): Promise<boolean>;
  /** Runs between reading clock.json and writing it: checks change the file here, as another copy would. */
  beforeWrite?(): Promise<void>;
}

/** One run of one command: its options, and replies as text or as one JSON document. */
export class Context {
  readonly io: CliIo;
  readonly json: boolean;
  readonly dir: string | null;
  /** The whole command tree, for `man`. */
  readonly root: CommandSpec;

  constructor(io: CliIo, parsed: Parsed, root: CommandSpec) {
    this.io = io;
    this.root = root;
    this.json = parsed.has('--json');
    this.dir = parsed.str('--dir');
  }

  /** The command's answer: `body` as JSON (with `ok: true`) under --json, else the text. */
  reply(body: Record<string, unknown>, text: string): void {
    if (this.json) this.io.stdout(JSON.stringify({ ok: true, ...body }, null, 2) + '\n');
    else if (text) this.io.stdout(text.endsWith('\n') ? text : text + '\n');
  }

  /** A side note for a person, on stderr so it never mixes with what scripts read. */
  note(text: string): void {
    this.io.stderr(text + '\n');
  }
}
