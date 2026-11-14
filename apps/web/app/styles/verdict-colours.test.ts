import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Verdict } from '@skyoj/contract';
import { describe, expect, it } from 'vitest';
import { VERDICT_KINDS } from '../ui/classes';
import { verdictKind } from '../ui/index';

/**
 * The verdict palette: one colour per kind of verdict, all equally bright.
 * "Equally bright" is measured as OKLCH lightness, which follows perceived
 * brightness across hues (unlike HSL lightness). Contrast against the
 * surfaces is checked with every other colour in contrast.test.ts.
 */

const appCss = readFileSync(join(import.meta.dirname, 'app.css'), 'utf8');
const colourOf = (kind: string) => {
  const hex = new RegExp(`--oj-verdict-${kind}:\\s*(#[0-9a-f]{6})`, 'i').exec(appCss)?.[1];
  if (!hex) throw new Error(`No colour for --oj-verdict-${kind}`);
  return hex;
};

/** OKLab lightness (0 = black, 1 = white) of an sRGB colour. */
function oklabLightness(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

describe('verdict colours', () => {
  it('are equally bright', () => {
    const lightness = VERDICT_KINDS.map((kind) => oklabLightness(colourOf(kind)));
    expect(Math.max(...lightness) - Math.min(...lightness)).toBeLessThan(0.01);
  });

  it('are distinct', () => {
    const colours = VERDICT_KINDS.map(colourOf);
    expect(new Set(colours).size).toBe(colours.length);
  });

  it('give every verdict a kind, following the palette', () => {
    const kinds = Object.fromEntries(Object.entries(Verdict).map(([name, code]) => [name, verdictKind(code)]));
    expect(kinds).toEqual({
      AC: 'accepted',
      PE: 'wrong',
      WA: 'wrong',
      TLE: 'limit',
      MLE: 'limit',
      OLE: 'limit',
      RE: 'runtime',
      CE: 'compile',
      RF: 'restricted',
      WAIT: 'neutral',
      JUDGING: 'neutral',
      JE: 'neutral',
      SE: 'neutral',
    });
  });
});
