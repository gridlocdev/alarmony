// Text colours meet WCAG AA (4.5:1) on every surface, in both themes (PRD §16).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

/** The `--al-*` colours set in the block that `selector` opens. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/--al-([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]),
  );
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('dark mode', () => {
  it('is the same whether the system or the setting picks it', () => {
    expect(tokens(":root:not([data-theme='light'])")).toEqual(tokens(":root[data-theme='dark']"));
  });
});

const TEXT = ['text', 'text-2', 'text-3', 'accent', 'danger', 'fast', 'slow'];
const SURFACES = ['bg', 'bar', 'card', 'raised', 'chosen'];

describe.each([
  ['light', ':root'],
  ['dark', ":root[data-theme='dark']"],
])('the %s theme', (_name, selector) => {
  const t = tokens(selector);

  it('has text at AA contrast on every surface', () => {
    const low = TEXT.flatMap((fg) =>
      SURFACES.map((bg) => ({ fg, bg, ratio: contrast(t[fg]!, t[bg]!) })).filter((p) => p.ratio < 4.5),
    );
    expect(low).toEqual([]);
  });

  it('has button text at AA contrast on the accent', () => {
    expect(contrast(t['accent-text']!, t.accent!)).toBeGreaterThanOrEqual(4.5);
  });
});
