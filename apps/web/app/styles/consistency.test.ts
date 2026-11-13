import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The interface rules of docs/design.md, enforced. If one of these fails,
 * the fix is almost never to relax the test: use a UI-kit component, or add
 * the class to ui/classes.ts.
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

const sources = files(appDir, (name) => /\.tsx?$/.test(name) && !name.endsWith('.test.ts'));
const components = sources.filter((path) => path.endsWith('.tsx'));
/** Everything that is not the UI kit: routes, shared page components, root. */
const pages = components.filter((path) => !rel(path).startsWith('ui/'));

function offenders(paths: string[], pattern: RegExp): string[] {
  return paths.flatMap((path) => {
    const lines = code(read(path)).split('\n');
    return lines.flatMap((line, index) =>
      pattern.test(line) ? [`${rel(path)}:${index + 1}: ${line.trim().slice(0, 80)}`] : [],
    );
  });
}

describe('interface consistency', () => {
  it('has files to check', () => {
    expect(pages.length).toBeGreaterThan(20);
  });

  it('styles with Bootstrap plus exactly one stylesheet of our own', () => {
    expect(files(appDir, (name) => name.endsWith('.css') || name.endsWith('.css.ts')).map(rel)).toEqual([
      'styles/app.css',
    ]);
    const manifest = JSON.parse(read(join(appDir, '..', 'package.json'))) as { dependencies: Record<string, string> };
    expect(manifest.dependencies.bootstrap).toMatch(/^\^5\./);
    expect(JSON.stringify(manifest)).not.toMatch(/tailwind|vanilla-extract|react-bootstrap|"@popperjs/);
  });

  it('prefixes every class of its own with oj- so it cannot collide with Bootstrap', () => {
    const css = read(join(appDir, 'styles/app.css')).replace(/\/\*[\s\S]*?\*\//g, '');
    const own = [...css.matchAll(/(?:^|[\s,>+~(])\.([a-zA-Z][\w-]*)/gm)].map(([, name = '']) => name);
    // Bootstrap/Radix/Shiki/Temml hooks that app.css is allowed to refine.
    const allowed = new Set(['dropdown-item', 'nav-link', 'line', 'math-display', 'temml-error']);
    expect(own.filter((name) => !name.startsWith('oj-') && !allowed.has(name))).toEqual([]);
  });

  it('is dark mode only', () => {
    expect(read(join(appDir, 'root.tsx'))).toMatch(/<html[^>]*data-bs-theme="dark"/);
    const everything = [...sources.map(read), read(join(appDir, 'styles/app.css'))].map(code).join('\n');
    // No colour-mode switching and no light palette anywhere.
    expect(everything).not.toMatch(/prefers-color-scheme|data-bs-theme=['"]?light|setAttribute\(['"]data-bs-theme/);
  });

  it('self-hosts IBM Plex and loads no font from a CDN', () => {
    const root = read(join(appDir, 'root.tsx'));
    expect(root).toMatch(/@fontsource\/ibm-plex-sans\//);
    expect(root).toMatch(/@fontsource\/ibm-plex-mono\//);
    expect(read(join(appDir, 'styles/app.css'))).toMatch(/--bs-font-sans-serif:\s*['"]IBM Plex Sans['"]/);
    expect(read(join(appDir, 'styles/app.css'))).toMatch(/--bs-font-monospace:\s*['"]IBM Plex Mono['"]/);
    expect(offenders(sources, /fonts\.(googleapis|gstatic)\.com|use\.typekit|fonts\.bunny/)).toEqual([]);
  });

  it('keeps corners nearly square (at most 3 px)', () => {
    const radii = [...read(join(appDir, 'styles/app.css')).matchAll(/--bs-border-radius(?:-\w+)?:\s*([\d.]+)rem/g)].map(
      (m) => Number(m[1]),
    );
    expect(radii.length).toBeGreaterThanOrEqual(5);
    expect(radii.every((rem) => rem <= 0.1875)).toBe(true);
    expect(offenders(sources, /rounded-(pill|circle|[3-5])\b/)).toEqual([]);
  });

  it('does not load Bootstrap JavaScript (Radix provides the behaviour)', () => {
    expect(offenders(sources, /from ['"]bootstrap(?!\/dist\/css)|import ['"]bootstrap(?!\/dist\/css)/)).toEqual([]);
  });

  it('never styles inline', () => {
    expect(offenders(components, /\bstyle=\{/)).toEqual([]);
  });

  it('keeps class names out of pages: they come from the UI kit and ui/classes.ts', () => {
    expect(offenders(pages, /className=["'`]/)).toEqual([]);
  });

  it('renders every table through DataTable', () => {
    expect(offenders(pages, /<(table|thead|tbody|tr|td|th)[\s>]/)).toEqual([]);
  });

  it('uses the overlay wrappers instead of Radix or browser dialogs directly', () => {
    expect(offenders(pages, /from ['"]radix-ui['"]|\b(confirm|alert)\(/)).toEqual([]);
    expect(offenders(pages, /from ['"]@tanstack\/react-table['"]/)).toEqual([]);
  });
});
