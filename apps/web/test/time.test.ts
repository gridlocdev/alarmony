import { describe, expect, it } from 'vitest';
import { clockTime, doneAgo } from '../src/app/time.ts';

describe('clock times', () => {
  it('shows five past midnight as 00:05 in the 24-hour format, never 24:05', () => {
    const fivePast = new Date(2026, 10, 19, 0, 5).getTime();
    expect(clockTime(fivePast, '24')).toMatch(/^0?0:05$/);
  });

  it('shows the afternoon as 12-hour when asked', () => {
    expect(clockTime(new Date(2026, 10, 19, 18, 20).getTime(), '12')).toMatch(/^6:20\s?PM$/i);
  });
});

describe('how long ago a timer finished', () => {
  const MIN = 60_000;
  it('counts minutes, then hours, then days', () => {
    expect(doneAgo(30_000)).toBe('Done');
    expect(doneAgo(5 * MIN)).toBe('Done 5 min ago');
    expect(doneAgo(60 * MIN)).toBe('Done 1 hr ago');
    expect(doneAgo(2282 * MIN)).toBe('Done 1 day ago');
    expect(doneAgo(23 * 60 * MIN)).toBe('Done 23 hrs ago');
    expect(doneAgo(3 * 24 * 60 * MIN)).toBe('Done 3 days ago');
  });
});
