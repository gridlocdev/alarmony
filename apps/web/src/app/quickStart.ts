import { formatCountdown, type Preset } from '@alarmony/core';

const MINUTE = 60_000;
/** Common timer lengths, offered next to the presets (PRD §8.2). */
export const COMMON_LENGTHS: readonly number[] = [1, 3, 5, 10].map((m) => m * MINUTE);

/** One button on the New Timer card: a preset, or a common length with no label. */
export interface QuickStart {
  readonly presetId: string | null;
  readonly label: string;
  readonly ms: number;
  /** What the button says under the label: "5 min" for a common length. */
  readonly text: string;
}

/** The presets in order, then the common lengths no preset already has. */
export function quickStarts(presets: readonly Preset[]): QuickStart[] {
  const taken = new Set(presets.map((p) => p.ms));
  return [
    ...presets.map((p) => ({ presetId: p.id, label: p.label, ms: p.ms, text: formatCountdown(p.ms) })),
    ...COMMON_LENGTHS.filter((ms) => !taken.has(ms)).map((ms) => ({
      presetId: null,
      label: '',
      ms,
      text: `${ms / MINUTE} min`,
    })),
  ];
}
