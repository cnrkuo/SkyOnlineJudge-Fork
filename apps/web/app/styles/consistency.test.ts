import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The design rules of docs/design.md, enforced. If one of these fails, the
 * fix is almost never to relax the test: use a token, or a UI-kit component.
 */

const appDir = join(import.meta.dirname, '..');

function files(dir: string, match: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path, match);
    return match(entry.name) ? [path] : [];
  });
}

const rel = (path: string) => relative(appDir, path);
const read = (path: string) => readFileSync(path, 'utf8');
/** Comments may mention anything; only code is checked. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const stylesheets = files(appDir, (name) => name.endsWith('.css.ts'));
const components = files(appDir, (name) => name.endsWith('.tsx'));
const routes = components.filter((path) => rel(path).startsWith('routes/'));

function offenders(paths: string[], pattern: RegExp): string[] {
  return paths.flatMap((path) => {
    const lines = code(read(path)).split('\n');
    return lines.flatMap((line, index) => (pattern.test(line) ? [`${rel(path)}:${index + 1}: ${line.trim().slice(0, 80)}`] : []));
  });
}

describe('design system consistency', () => {
  it('has style files to check', () => {
    expect(stylesheets.length).toBeGreaterThan(5);
    expect(routes.length).toBeGreaterThan(15);
  });

  it('defines colours only in the theme', () => {
    const others = stylesheets.filter((path) => rel(path) !== 'styles/theme.css.ts');
    expect(offenders(others, /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/)).toEqual([]);
  });

  it('defines font families only in the theme', () => {
    const others = stylesheets.filter((path) => rel(path) !== 'styles/theme.css.ts');
    expect(offenders(others, /fontFamily:\s*['"`](?!inherit|\$\{vars\.)/)).toEqual([]);
  });

  it('keeps one plain CSS file (the font face) and no CSS framework', () => {
    expect(files(appDir, (name) => name.endsWith('.css')).map(rel)).toEqual(['styles/fonts.css']);
    const manifest = read(join(appDir, '..', 'package.json'));
    expect(manifest).not.toMatch(/tailwind|bootstrap|"@picocss/);
  });

  it('never styles inline', () => {
    expect(offenders(components, /\bstyle=\{/)).toEqual([]);
  });

  it('never uses ad-hoc class names: classes come from Vanilla Extract', () => {
    expect(offenders(components, /className=["'`]/)).toEqual([]);
  });

  it('builds pages from the UI kit: routes own no stylesheets', () => {
    // Pages may borrow table cell classes for custom scoreboard cells; nothing else.
    expect(offenders(routes, /from ['"]~\/styles\//)).toEqual([]);
    expect(files(join(appDir, 'routes'), (name) => name.endsWith('.css.ts'))).toEqual([]);
  });

  it('renders every table through DataTable', () => {
    const outsideKit = components.filter((path) => !rel(path).startsWith('ui/'));
    expect(offenders(outsideKit, /<(table|thead|tbody|tr|td|th)[\s>]/)).toEqual([]);
  });

  it('uses the overlay wrappers instead of Radix or browser dialogs directly', () => {
    const outsideKit = components.filter((path) => !rel(path).startsWith('ui/'));
    expect(offenders(outsideKit, /from ['"]radix-ui['"]|\b(confirm|alert)\(/)).toEqual([]);
    expect(offenders(outsideKit, /from ['"]@tanstack\/react-table['"]/)).toEqual([]);
  });
});
