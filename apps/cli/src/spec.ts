/**
 * The command tree, written as data. Parsing, `--help` and `man` all come from it, so what a command accepts and
 * what its help says can't drift apart.
 */
import { UsageError } from './errors.ts';
import type { Context } from './context.ts';

export interface OptionSpec {
  /** `--label`. */
  readonly name: string;
  readonly description: string;
  /** A switch takes no value (`--json`); a value option takes the next token or `--name=value`. */
  readonly kind: 'switch' | 'value';
  /** The value's name in help (`<text>`). */
  readonly value?: string;
}

export interface ArgumentSpec {
  readonly name: string;
  readonly description: string;
  readonly optional?: boolean;
}

export interface CommandSpec {
  readonly name: string;
  readonly description: string;
  readonly args?: readonly ArgumentSpec[];
  readonly options?: readonly OptionSpec[];
  readonly subcommands?: readonly CommandSpec[];
  readonly run?: (p: Parsed, ctx: Context) => Promise<number>;
}

/** On every command that runs. */
export const GLOBAL_OPTIONS: readonly OptionSpec[] = [
  {
    name: '--dir',
    kind: 'value',
    value: 'folder',
    description: "The folder clock.json is in (else ALARMONY_DIR, else the desktop app's folder)",
  },
  { name: '--json', kind: 'switch', description: 'Print one JSON document instead of text' },
];

/** What one command line asked for, read by argument name or option name. */
export class Parsed {
  readonly command: CommandSpec;
  /** `["alarm", "add"]`. */
  readonly path: readonly string[];
  readonly #args = new Map<string, string>();
  readonly #options = new Map<string, string>();

  constructor(command: CommandSpec, path: readonly string[]) {
    this.command = command;
    this.path = path;
  }

  setArg(name: string, value: string): void {
    this.#args.set(name, value);
  }

  setOption(name: string, value: string): void {
    this.#options.set(name, value);
  }

  arg(name: string): string {
    const v = this.#args.get(name);
    if (v === undefined) throw new UsageError(`Missing <${name}>.`);
    return v;
  }

  argOrNull(name: string): string | null {
    return this.#args.get(name) ?? null;
  }

  has(option: string): boolean {
    return this.#options.has(option);
  }

  /** A value option's text, or null when it wasn't given. */
  str(option: string): string | null {
    return this.#options.get(option) ?? null;
  }
}

/** What the parser decided. */
export type Invocation =
  | { readonly kind: 'run'; readonly parsed: Parsed }
  | { readonly kind: 'help'; readonly command: CommandSpec; readonly path: readonly string[] }
  | { readonly kind: 'version' };

const HELP = new Set(['--help', '-h']);

const looksLikeOption = (token: string) => token.startsWith('-') && token.length > 1 && !/^-\d/.test(token);

export function optionsOf(command: CommandSpec): readonly OptionSpec[] {
  return command.run ? [...(command.options ?? []), ...GLOBAL_OPTIONS] : (command.options ?? []);
}

/** Reads argv (without the program name) against the tree. Throws `UsageError` on anything it can't place. */
export function parseArgs(root: CommandSpec, argv: readonly string[]): Invocation {
  let command = root;
  const path: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const token = argv[i] ?? '';
    if (HELP.has(token)) return { kind: 'help', command, path };
    if (command === root && token === '--version') return { kind: 'version' };
    const child = command.subcommands?.find((c) => c.name === token);
    if (!child) break;
    command = child;
    path.push(child.name);
    i++;
  }
  if (argv.slice(i).some((t) => HELP.has(t))) return { kind: 'help', command, path };
  const where = () => ['alarmony', ...path].join(' ');
  if (!command.run) {
    const token = argv[i];
    if (token === undefined) throw new UsageError(`'${where()}' needs a command.`);
    throw new UsageError(`'${where()}' has no command '${token}'.`);
  }
  const parsed = new Parsed(command, path);
  const positionals: string[] = [];
  const options = optionsOf(command);
  for (; i < argv.length; i++) {
    const token = argv[i] ?? '';
    if (token === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!looksLikeOption(token)) {
      positionals.push(token);
      continue;
    }
    const eq = token.indexOf('=');
    const name = eq > 0 ? token.slice(0, eq) : token;
    const option = options.find((o) => o.name === name);
    if (!option) throw new UsageError(`'${where()}' has no option '${name}'.`);
    if (option.kind === 'switch') {
      if (eq > 0) throw new UsageError(`${name} takes no value.`);
      parsed.setOption(name, '');
      continue;
    }
    const value = eq > 0 ? token.slice(eq + 1) : argv[++i];
    if (value === undefined) throw new UsageError(`${name} needs a value.`);
    parsed.setOption(name, value);
  }
  const specs = command.args ?? [];
  specs.forEach((spec, n) => {
    const value = positionals[n];
    if (value !== undefined) parsed.setArg(spec.name, value);
    else if (!spec.optional) throw new UsageError(`'${where()}' needs <${spec.name}>.`);
  });
  const extra = positionals[specs.length];
  if (extra !== undefined) throw new UsageError(`'${where()}' didn't expect '${extra}'.`);
  return { kind: 'run', parsed };
}

// ── Help ───────────────────────────────────────────────────────────────────

const argLabel = (a: ArgumentSpec) => (a.optional ? `[<${a.name}>]` : `<${a.name}>`);

function columns(rows: readonly (readonly [string, string])[]): string[] {
  const width = Math.max(0, ...rows.map(([a]) => a.length));
  return rows.map(([a, b]) => `  ${a.padEnd(width)}  ${b}`.trimEnd());
}

/** The usage line: `alarmony alarm add <time> [options]`. */
export function usage(command: CommandSpec, path: readonly string[]): string {
  const parts = ['alarmony', ...path, ...(command.args ?? []).map(argLabel)];
  if (command.subcommands?.length) parts.push(command.run ? '[command]' : '<command>');
  if (optionsOf(command).length) parts.push('[options]');
  return parts.join(' ');
}

/** `--help` for one command. */
export function renderHelp(command: CommandSpec, path: readonly string[]): string {
  const out = [command.description, '', `Usage: ${usage(command, path)}`];
  if (command.args?.length)
    out.push('', 'Arguments:', ...columns(command.args.map((a) => [argLabel(a), a.description])));
  const options = optionsOf(command).map((o): [string, string] => [
    o.kind === 'value' ? `${o.name} <${o.value ?? 'value'}>` : o.name,
    o.description,
  ]);
  options.push(['-h, --help', 'Show this help']);
  if (!path.length) options.push(['--version', 'Show the version']);
  out.push('', 'Options:', ...columns(options));
  if (command.subcommands?.length)
    out.push(
      '',
      'Commands:',
      ...columns(
        command.subcommands.map((c) => [[c.name, ...(c.args ?? []).map(argLabel)].join(' '), c.description]),
      ),
    );
  return out.join('\n') + '\n';
}

/** Every command that runs, depth first, with its path. */
export function runnable(root: CommandSpec): { command: CommandSpec; path: string[] }[] {
  const found: { command: CommandSpec; path: string[] }[] = [];
  const walk = (c: CommandSpec, path: string[]) => {
    if (c.run) found.push({ command: c, path });
    for (const s of c.subcommands ?? []) walk(s, [...path, s.name]);
  };
  walk(root, []);
  return found;
}

/** `alarmony man`: the root help, then every command's help, one page. */
export function renderManual(root: CommandSpec): string {
  const pages = [renderHelp(root, [])];
  for (const { command, path } of runnable(root))
    if (path.length) pages.push(`## alarmony ${path.join(' ')}\n\n${renderHelp(command, path)}`);
  return pages.join('\n');
}
