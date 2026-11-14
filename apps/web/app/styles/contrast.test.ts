import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WCAG 2.2 AA contrast for every foreground/background pair the interface
 * uses, computed from the real stylesheets: Bootstrap's dark colour mode as
 * shipped, plus the overrides in styles/app.css. Upgrading Bootstrap or
 * touching a colour re-checks everything.
 *
 * Thresholds: 4.5 : 1 for text, 3 : 1 for the borders that identify a
 * control (WCAG 1.4.11). The browser-level audit of real pages is
 * `pnpm audit:contrast` (scripts/audit-contrast.mjs).
 */

const bootstrapCss = readFileSync(createRequire(import.meta.url).resolve('bootstrap/dist/css/bootstrap.css'), 'utf8');
const appCss = readFileSync(join(import.meta.dirname, 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Custom properties declared inside the first block whose selector matches. */
function declarations(css: string, selector: RegExp): Record<string, string> {
  const match = selector.exec(css);
  if (!match) throw new Error(`No block for ${selector}`);
  const body = css.slice(match.index + match[0].length, css.indexOf('}', match.index));
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name = '', value = '']) => [name, value.trim()]),
  );
}

// Same cascade as the browser: Bootstrap's root block, its dark block, ours.
const vars: Record<string, string> = {
  ...declarations(bootstrapCss, /:root,\s*\[data-bs-theme=light\]\s*\{/),
  ...declarations(bootstrapCss, /\[data-bs-theme=dark\]\s*\{/),
  ...declarations(appCss, /:root\[data-bs-theme=['"]dark['"]\]\s*\{/),
};
const scoped = (selector: RegExp) => ({ ...vars, ...declarations(appCss, selector) });

type Rgba = [number, number, number, number];

function resolve(value: string, scope: Record<string, string>, depth = 0): string {
  if (depth > 10) throw new Error(`Cyclic variable in ${value}`);
  return value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
    const next = scope[name];
    if (next === undefined) throw new Error(`Undefined variable ${name}`);
    return resolve(next, scope, depth + 1);
  });
}

function parse(value: string, scope: Record<string, string> = vars): Rgba {
  const text = resolve(value, scope).trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).concat(1) as Rgba;
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(text)?.[1];
  if (rgba) {
    const [r = 0, g = 0, b = 0, a = 1] = rgba.split(',').map(Number);
    return [r, g, b, a];
  }
  if (text === 'white') return [255, 255, 255, 1];
  throw new Error(`Cannot parse colour ${value} → ${text}`);
}

/** Composites a translucent colour over an opaque one. */
const over = ([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba => [
  r * a + br * (1 - a),
  g * a + bg * (1 - a),
  b * a + bb * (1 - a),
  1,
];

function luminance([r, g, b]: Rgba): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(foreground: string, background: string, scope = vars): number {
  const page = parse('var(--bs-body-bg)');
  const bg = over(parse(background, scope), page);
  const fg = over(parse(foreground, scope), bg);
  const [light = 0, dark = 0] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
}

/** Surfaces text appears on: page and cards, card headers / table headers / navbar, hover. */
const SURFACES = { page: 'var(--bs-body-bg)', raised: 'var(--bs-tertiary-bg)', hover: 'var(--bs-secondary-bg)' };
const TONES = ['primary', 'secondary', 'success', 'danger', 'warning', 'info'];

function check(pairs: [name: string, foreground: string, background: string][], minimum: number, scope = vars) {
  const failures = pairs
    .map(([name, fg, bg]) => [name, ratio(fg, bg, scope)] as const)
    .filter(([, value]) => value < minimum)
    .map(([name, value]) => `${name}: ${value} : 1`);
  expect(failures, `below ${minimum} : 1`).toEqual([]);
}

const onSurfaces = (name: string, colour: string): [string, string, string][] =>
  Object.entries(SURFACES).map(([surface, bg]) => [`${name} on ${surface}`, colour, bg]);

describe('contrast (dark mode, WCAG AA)', () => {
  it('reads the dark palette', () => {
    expect(resolve('var(--bs-body-bg)', vars)).toBe('#0a0b0d');
    expect(ratio('#ffffff', '#000000')).toBe(21);
  });

  it('body, secondary and link text on every surface', () => {
    check(
      [
        ...onSurfaces('body text', 'var(--bs-body-color)'),
        ...onSurfaces('secondary text (hints, meta, table headers, placeholders)', 'var(--bs-secondary-color)'),
        ...onSurfaces('link', 'var(--bs-link-color)'),
        ...onSurfaces('hovered link', 'var(--bs-link-hover-color)'),
        // .navbar: --bs-navbar-color is 65 % of the emphasis colour.
        ['navbar link', 'rgba(255, 255, 255, 0.65)', 'var(--bs-tertiary-bg)'],
        ['inline code', 'var(--bs-code-color)', 'var(--bs-body-bg)'],
      ],
      4.5,
    );
  });

  it('every tone as text, as a badge, as an alert and as a scoreboard cell', () => {
    check(
      TONES.flatMap((tone): [string, string, string][] => [
        ...onSurfaces(`${tone} text`, `var(--bs-${tone}-text-emphasis)`),
        [`${tone} on its subtle fill`, `var(--bs-${tone}-text-emphasis)`, `var(--bs-${tone}-bg-subtle)`],
      ]),
      4.5,
    );
  });

  it('buttons in every state', () => {
    const secondary = scoped(/\.oj-btn-secondary\s*\{/);
    check(
      [
        ['secondary button', 'var(--bs-btn-color)', 'var(--bs-body-bg)'],
        ['secondary button in a card header', 'var(--bs-btn-color)', 'var(--bs-tertiary-bg)'],
        ['secondary button, hover', 'var(--bs-btn-hover-color)', 'var(--bs-btn-hover-bg)'],
        ['secondary button, active', 'var(--bs-btn-active-color)', 'var(--bs-btn-active-bg)'],
      ],
      4.5,
      secondary,
    );
    const danger = scoped(/\.oj-btn-danger\s*\{/);
    check(
      [
        ['danger button', 'var(--bs-btn-color)', 'var(--bs-body-bg)'],
        // Hover and active fill with Bootstrap's danger red.
        ['danger button, hover', 'var(--bs-btn-hover-color)', 'var(--bs-danger)'],
      ],
      4.5,
      danger,
    );
    check(
      [
        ['primary button', 'var(--bs-white)', 'var(--bs-btn-bg)'],
        ['primary button, hover', 'var(--bs-white)', 'var(--bs-btn-hover-bg)'],
        ['primary button, active', 'var(--bs-white)', 'var(--bs-btn-active-bg)'],
      ],
      5,
      scoped(/\.oj-btn-primary\s*\{/),
    );
    check(
      [
        ['dropdown item, highlighted', 'var(--bs-emphasis-color)', 'var(--bs-secondary-bg)'],
        ['tooltip', 'var(--bs-body-bg)', 'var(--bs-emphasis-color)'],
        ['own scoreboard row', 'var(--bs-body-color)', 'var(--bs-primary-bg-subtle)'],
      ],
      4.5,
    );
  });

  it('menus (Radix menus dressed as Bootstrap dropdowns)', () => {
    const menu = scoped(/\.oj-pop\s*\{/);
    check(
      [
        ['menu section header', 'var(--bs-dropdown-header-color)', 'var(--bs-body-bg)'],
        ['menu item', 'var(--bs-body-color)', 'var(--bs-body-bg)'],
      ],
      4.5,
      menu,
    );
  });

  it('control borders stand out from the page (non-text, 3 : 1)', () => {
    check(
      [
        ['input, select and checkbox border', 'var(--bs-gray-600)', 'var(--bs-body-bg)'],
        ['secondary button border', 'var(--bs-btn-border-color)', 'var(--bs-body-bg)'],
        ['focus ring colour', 'var(--bs-primary)', 'var(--bs-body-bg)'],
      ],
      3,
      scoped(/\.oj-btn-secondary\s*\{/),
    );
  });

  it('every syntax-highlighting colour on the code background', () => {
    const code = scoped(/\.oj-code\s*\{/);
    const tokens = Object.keys(code).filter((name) => name.startsWith('--shiki-') && name !== '--shiki-background');
    expect(tokens.length).toBeGreaterThan(8);
    check(
      tokens.map((token): [string, string, string] => [token, `var(${token})`, 'var(--bs-tertiary-bg)']),
      4.5,
      code,
    );
  });
});
