/** What the Keyboard Shortcuts window lists (PRD §14): every command with a key, plus keys that aren't commands. */
import { COMMAND_GROUPS, type CommandCatalog, type CommandGroup } from '@alarmony/ui';

export interface ShortcutLine {
  readonly title: string;
  /** Each way to press it; a way is one or more keys pressed in turn (`G` then `I`). */
  readonly keys: readonly (readonly string[])[];
}

export interface ShortcutGroup {
  readonly title: string;
  readonly lines: readonly ShortcutLine[];
}

const GROUP_TITLES: Record<CommandGroup, string> = {
  File: 'Adding',
  Edit: 'Undo',
  View: 'Tabs and windows',
  Clock: 'Stopwatch and timers',
  Help: 'Help',
};

/** Keys handled outside the catalog: in dialogs, on the ringing sheet, in the tab row, and Escape everywhere. */
function extras(mod: string): Partial<Record<CommandGroup, ShortcutLine[]>> {
  return {
    File: [
      { title: 'Start the timer (in New Timer)', keys: [['Enter'], [mod === '⌘' ? '⌘Enter' : 'Ctrl+Enter']] },
    ],
    View: [{ title: 'Next / previous tab (in the tab row)', keys: [['Right'], ['Left']] }],
    Clock: [{ title: 'Stop ringing (on the ringing sheet)', keys: [['Enter'], ['Esc']] }],
    Help: [
      {
        title: 'Next / previous command in the command menu',
        keys: [['Down'], ['Up'], ['Tab'], ['Shift+Tab']],
      },
      { title: 'Close a window or the command menu', keys: [['Esc']] },
    ],
  };
}

export function shortcutGroups(catalog: CommandCatalog, mac: boolean): ShortcutGroup[] {
  const more = extras(mac ? '⌘' : 'Ctrl');
  return COMMAND_GROUPS.map((group) => {
    const lines: ShortcutLine[] = catalog.all
      .filter((c) => c.group === group && c.sequences.length > 0)
      .map((c) => ({
        title: c.title.replace(/…$/, ''),
        keys: c.sequences.map((_, i) => catalog.keys({ ...c, sequences: [c.sequences[i]!] }, mac)),
      }));
    return { title: GROUP_TITLES[group], lines: [...lines, ...(more[group] ?? [])] };
  }).filter((g) => g.lines.length > 0);
}
