// The New Timer card's one-click buttons: the presets, then the common lengths no preset has (PRD §8.2).
import { describe, expect, it } from 'vitest';
import type { Preset } from '@alarmony/core';
import { quickStarts } from '../src/app/quickStart.ts';

describe('the New Timer card', () => {
  it('offers 1, 3, 5 and 10 minutes when there are no presets', () => {
    expect(quickStarts([]).map((q) => q.text)).toEqual(['1 min', '3 min', '5 min', '10 min']);
  });

  it('puts the presets first and leaves out a common length a preset already has', () => {
    const presets: Preset[] = [
      { id: 'p1', label: 'Tea', ms: 240_000, extra: {} },
      { id: 'p2', label: 'Eggs', ms: 300_000, extra: {} },
    ];
    const starts = quickStarts(presets);
    expect(starts.map((q) => [q.presetId, q.label, q.text])).toEqual([
      ['p1', 'Tea', '4:00'],
      ['p2', 'Eggs', '5:00'],
      [null, '', '1 min'],
      [null, '', '3 min'],
      [null, '', '10 min'],
    ]);
  });
});
