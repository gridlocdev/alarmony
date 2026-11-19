/**
 * Alarm sounds as data, played with Web Audio by the UI (PRD §10). Each recipe is one cycle of notes,
 * repeated with a gap while ringing.
 */
export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth';

export interface Note {
  /** Seconds from the cycle's start. */
  readonly at: number;
  /** Hz. */
  readonly freq: number;
  /** Seconds it sounds, including its fade. */
  readonly length: number;
  /** 0–1, before the ringing volume. */
  readonly gain: number;
  readonly wave: Wave;
}

export interface Sound {
  readonly id: string;
  readonly name: string;
  readonly notes: readonly Note[];
  /** Seconds from one cycle's start to the next. */
  readonly cycle: number;
}

const chime = (at: number, freq: number): Note => ({ at, freq, length: 1.6, gain: 0.5, wave: 'sine' });

export const SOUNDS: readonly Sound[] = [
  {
    id: 'chimes',
    name: 'Chimes',
    // E6, C6, D6, G5: a soft four-note phrase.
    notes: [chime(0, 1318.5), chime(0.35, 1046.5), chime(0.7, 1174.7), chime(1.05, 784)],
    cycle: 2.6,
  },
];

export const DEFAULT_SOUND = 'chimes';

/** The recipe for a name; an unknown name plays the default and is kept in the file (PRD §3.2). */
export function soundFor(id: string): Sound {
  return SOUNDS.find((s) => s.id === id) ?? (SOUNDS[0] as Sound);
}
