/** A no-break space: a screen reader doesn't read it. */
const NBSP = String.fromCharCode(0xa0);

/**
 * The live region's next text. A screen reader speaks a live region only when its text changes, so the same
 * words twice in a row ("Deleted timer.") get a no-break space added or taken off.
 */
export function freshAnnouncement(text: string, shown: string): string {
  const same = shown === text || shown === text + NBSP;
  if (!same) return text;
  return shown === text ? text + NBSP : text;
}
