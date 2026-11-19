/** One run of `alarmony`, in-process: tests call `runCli` with a fake `CliIo`. */
import { Context, type CliIo } from './context.ts';
import { CliError, ConflictError, EXIT_CONFLICT, EXIT_ERROR, EXIT_OK, isFileError } from './errors.ts';
import { ROOT } from './index.ts';
import { parseArgs, renderHelp, type CommandSpec } from './spec.ts';

/** The deepest command the words name, for the help hint after a usage error. */
function commandPath(argv: readonly string[]): string[] {
  const path: string[] = [];
  let command: CommandSpec = ROOT;
  for (const token of argv) {
    const child = command.subcommands?.find((c) => c.name === token);
    if (!child) break;
    command = child;
    path.push(child.name);
  }
  return path;
}

export async function runCli(argv: readonly string[], io: CliIo, version = '0.0.0'): Promise<number> {
  const json = argv.includes('--json');
  const fail = (exit: number, message: string, extra: Record<string, unknown> = {}) => {
    io.stderr(`alarmony: ${message}\n`);
    if (json) io.stdout(JSON.stringify({ ok: false, error: message, exit, ...extra }, null, 2) + '\n');
    return exit;
  };
  let invocation;
  try {
    invocation = parseArgs(ROOT, argv);
  } catch (e) {
    if (!(e instanceof CliError)) throw e;
    const help = ['alarmony', ...commandPath(argv), '--help'].join(' ');
    return fail(EXIT_ERROR, `${e.message} See '${help}'.`);
  }
  switch (invocation.kind) {
    case 'help':
      io.stdout(renderHelp(invocation.command, invocation.path));
      return EXIT_OK;
    case 'version':
      io.stdout(version + '\n');
      return EXIT_OK;
    case 'run':
      break;
  }
  const { parsed } = invocation;
  try {
    return await (parsed.command.run as NonNullable<CommandSpec['run']>)(
      parsed,
      new Context(io, parsed, ROOT),
    );
  } catch (e) {
    if (e instanceof ConflictError) return fail(EXIT_CONFLICT, e.message, { items: e.items });
    if (e instanceof CliError || isFileError(e)) return fail(EXIT_ERROR, e.message);
    throw e;
  }
}
