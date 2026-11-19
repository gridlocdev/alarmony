/** Exit codes (PRD §12): 0 ok, 1 error (message on stderr), 2 conflict. A wrong command line is an error too. */
export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_CONFLICT = 2;

/** A mistake the user can fix: printed as `alarmony: <message>`, exit 1, never a stack trace. */
export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}

/** A command line that doesn't parse. */
export class UsageError extends CliError {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** Both this command and another copy changed the same thing: nothing was saved, exit 2. */
export class ConflictError extends CliError {
  readonly items: readonly string[];

  constructor(message: string, items: readonly string[]) {
    super(message);
    this.name = 'ConflictError';
    this.items = items;
  }
}

/** A file-system failure (`ENOENT`, `EACCES`): the user's to fix, not a bug. */
export function isFileError(e: unknown): e is NodeJS.ErrnoException {
  const code = (e as NodeJS.ErrnoException | null)?.code;
  return e instanceof Error && typeof code === 'string' && /^E[A-Z0-9]+$/.test(code);
}
