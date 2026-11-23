/** Buttons that change clock.json are off while it is read-only, with the reason on hover (PRD §3.3, §3.7). */
import type { CommandCatalog } from '@alarmony/ui';

export function lockedProps(catalog: CommandCatalog): { disabled?: true; title?: string } {
  const why = catalog.locked();
  return why === null ? {} : { disabled: true, title: why };
}
