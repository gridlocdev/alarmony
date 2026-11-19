import { describe, expect, it } from 'vitest';
import { clockTime } from '../src/app/time.ts';

describe('clock times', () => {
  it('shows five past midnight as 00:05 in the 24-hour format, never 24:05', () => {
    const fivePast = new Date(2026, 10, 19, 0, 5).getTime();
    expect(clockTime(fivePast, '24')).toMatch(/^0?0:05$/);
  });

  it('shows the afternoon as 12-hour when asked', () => {
    expect(clockTime(new Date(2026, 10, 19, 18, 20).getTime(), '12')).toMatch(/^6:20\s?PM$/i);
  });
});
