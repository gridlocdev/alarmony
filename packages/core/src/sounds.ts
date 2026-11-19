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

const note = (at: number, freq: number, length: number, gain: number, wave: Wave): Note => ({
  at,
  freq,
  length,
  gain,
  wave,
});
const chime = (at: number, freq: number): Note => note(at, freq, 1.6, 0.5, 'sine');

/** The eight sounds, the default first (PRD §10). */
export const SOUNDS: readonly Sound[] = [
  {
    id: 'chimes',
    name: 'Chimes',
    // E6, C6, D6, G5: a soft four-note phrase.
    notes: [chime(0, 1318.5), chime(0.35, 1046.5), chime(0.7, 1174.7), chime(1.05, 784)],
    cycle: 2.6,
  },
  {
    id: 'bells',
    name: 'Bells',
    // A struck bell: a fundamental with a bright, quieter overtone, twice.
    notes: [0, 0.9].flatMap((at) => [note(at, 880, 2.2, 0.45, 'sine'), note(at, 2093, 1.2, 0.18, 'sine')]),
    cycle: 2.4,
  },
  {
    id: 'marimba',
    name: 'Marimba',
    // C5 E5 G5 E5, short and woody.
    notes: [523.3, 659.3, 784, 659.3].map((f, i) => note(i * 0.18, f, 0.35, 0.55, 'triangle')),
    cycle: 1.4,
  },
  {
    id: 'digital',
    name: 'Digital',
    // Four quick beeps.
    notes: [0, 0.14, 0.28, 0.42].map((at) => note(at, 2000, 0.08, 0.22, 'square')),
    cycle: 1.2,
  },
  {
    id: 'rising',
    name: 'Rising',
    // A soft swell up a major triad.
    notes: [392, 493.9, 587.3, 784].map((f, i) => note(i * 0.4, f, 1.2, 0.35 + i * 0.05, 'sine')),
    cycle: 2.8,
  },
  {
    id: 'harp',
    name: 'Harp',
    // A quick upward arpeggio.
    notes: [523.3, 659.3, 784, 1046.5, 1318.5].map((f, i) => note(i * 0.09, f, 1.4, 0.4, 'triangle')),
    cycle: 2.2,
  },
  {
    id: 'radar',
    name: 'Radar',
    // A bright pulse, three times.
    notes: [0, 0.22, 0.44].map((at) => note(at, 1568, 0.16, 0.3, 'sine')),
    cycle: 1.3,
  },
  {
    id: 'gentle',
    name: 'Gentle',
    // One long, quiet sine note.
    notes: [note(0, 659.3, 2.4, 0.4, 'sine')],
    cycle: 3.2,
  },
];

export const DEFAULT_SOUND = 'chimes';

/** The recipe for a name; an unknown name plays the default and is kept in the file (PRD §3.2). */
export function soundFor(id: string): Sound {
  return SOUNDS.find((s) => s.id === id) ?? (SOUNDS[0] as Sound);
}
