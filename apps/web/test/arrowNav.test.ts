// The arrow keys on a tab: ← → step through the items, ↑ ↓ go to the row above or below, and both wrap (PRD §14).
import { describe, expect, it } from 'vitest';
import { arrowTarget, type Box } from '../src/app/arrowNav.ts';

const box = (left: number, top: number): Box => ({ left, top, width: 100, height: 50 });
/** A list: one item per row. */
const LIST = [box(0, 0), box(0, 60), box(0, 120)];
/** A grid of three columns with two items in its last row. */
const GRID = [box(0, 0), box(110, 0), box(220, 0), box(0, 60), box(110, 60)];

describe('arrow keys on a tab', () => {
  it('step down and up a list, wrapping at the ends', () => {
    expect(arrowTarget('ArrowDown', 0, LIST)).toBe(1);
    expect(arrowTarget('ArrowDown', 2, LIST)).toBe(0);
    expect(arrowTarget('ArrowUp', 0, LIST)).toBe(2);
    expect(arrowTarget('ArrowRight', 2, LIST)).toBe(0);
  });

  it('step left and right through a grid in order, wrapping', () => {
    expect(arrowTarget('ArrowRight', 2, GRID)).toBe(3);
    expect(arrowTarget('ArrowRight', 4, GRID)).toBe(0);
    expect(arrowTarget('ArrowLeft', 0, GRID)).toBe(4);
  });

  it('go to the nearest item in the row below or above, wrapping', () => {
    expect(arrowTarget('ArrowDown', 1, GRID)).toBe(4);
    expect(arrowTarget('ArrowDown', 2, GRID)).toBe(4);
    expect(arrowTarget('ArrowDown', 3, GRID)).toBe(0);
    expect(arrowTarget('ArrowUp', 0, GRID)).toBe(3);
    expect(arrowTarget('ArrowUp', 4, GRID)).toBe(1);
  });

  it('step through one row with up and down too', () => {
    const row = [box(0, 0), box(110, 0)];
    expect(arrowTarget('ArrowDown', 0, row)).toBe(1);
    expect(arrowTarget('ArrowDown', 1, row)).toBe(0);
    expect(arrowTarget('ArrowUp', 0, row)).toBe(1);
  });
});
