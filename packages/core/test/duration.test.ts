import { describe, expect, it } from 'vitest';
import {
  describeDuration,
  durationInput,
  formatCountdown,
  formatStopwatch,
  parseDuration,
  shortDuration,
  timerName,
} from '../src/index.ts';

const S = 1000;
const M = 60 * S;
const H = 60 * M;

describe('parseDuration', () => {
  it.each([
    ['5', 5 * M],
    ['5m', 5 * M],
    ['5 min', 5 * M],
    ['1h30m', H + 30 * M],
    ['1h 30m', H + 30 * M],
    ['90s', 90 * S],
    ['1.5h', 1.5 * H],
    ['1:30:00', H + 30 * M],
    ['25:00', 25 * M],
    ['0:45', 45 * S],
    [' 10 ', 10 * M],
    ['99:59:59', 99 * H + 59 * M + 59 * S],
  ])('reads %j', (text, ms) => {
    expect(parseDuration(text)).toBe(ms);
  });

  it.each(['', 'abc', '5x', '0', '0s', '100h', '1:60', 'm5', '-5', '5m tea'])('refuses %j', (text) => {
    expect(parseDuration(text)).toBeNull();
  });

  it('reads back what durationInput writes', () => {
    for (const ms of [S, 59 * S, M, 5 * M, 61 * S, H, H + S, 99 * H + 59 * M + 59 * S])
      expect(parseDuration(durationInput(ms))).toBe(ms);
  });
});

describe('formatting', () => {
  it('counts down in M:SS, then H:MM:SS, rounding up', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(200)).toBe('0:01');
    expect(formatCountdown(5 * M)).toBe('5:00');
    expect(formatCountdown(H + 2 * M + 3 * S)).toBe('1:02:03');
  });

  it('shows the stopwatch in MM:SS.cc, then H:MM:SS.cc', () => {
    expect(formatStopwatch(0)).toBe('00:00.00');
    expect(formatStopwatch(61_234)).toBe('01:01.23');
    expect(formatStopwatch(H + 5 * S + 70)).toBe('1:00:05.07');
  });

  it('says a length in words', () => {
    expect(describeDuration(90 * M)).toBe('1 hour 30 minutes');
    expect(describeDuration(S)).toBe('1 second');
    expect(describeDuration(0)).toBe('0 seconds');
  });

  it('says a length briefly, and names an unlabelled timer by it', () => {
    expect(shortDuration(90 * M)).toBe('1 hr 30 min');
    expect(shortDuration(2 * M + 30 * S)).toBe('2 min 30 sec');
    expect(shortDuration(45 * S)).toBe('45 sec');
    expect(timerName({ label: '', ms: 5 * M })).toBe('5 min timer');
    expect(timerName({ label: 'Pasta', ms: 5 * M })).toBe('Pasta');
  });
});
