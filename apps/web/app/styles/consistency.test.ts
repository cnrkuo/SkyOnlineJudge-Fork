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
    return lines.flatMap((line, index) => (pattern.test(line) ? [`${rel(path)}:${index + 1}: ${line.trim().slice(0, 80)}`] : []));
  });
}

describe('interface consistency', () => {
  it('has files to check', () => {
    expect(pages.length).toBeGreaterThan(20);
  });

  it('styles with Bootstrap plus exactly one stylesheet of our own', () => {
    expect(files(appDir, (name) => name.endsWith('.css') || name.endsWith('.css.ts')).map(rel)).toEqual(['styles/app.css']);
    const manifest = JSON.parse(read(join(appDir, '..', 'package.json'))) as { dependencies: Record<string, string> };
    expect(manifest.dependencies.bootstrap).toMatch(/^\^5\./);
    expect(JSON.stringify(manifest)).not.toMatch(/tailwind|vanilla-extract|react-bootstrap|"@popperjs/);
  });

  it('prefixes every class of its own with oj- so it cannot collide with Bootstrap', () => {
    const css = read(join(appDir, 'styles/app.css')).replace(/\/\*[\s\S]*?\*\//g, '');
    const own = [...css.matchAll(/(?:^|[\s,>+~(])\.([a-zA-Z][\w-]*)/gm)].map((match) => match[1]!);
    // Bootstrap/Radix/Shiki/Temml hooks that app.css is allowed to refine.
    const allowed = new Set(['dropdown-item', 'nav-link', 'line', 'math-display', 'temml-error']);
    expect(own.filter((name) => !name.startsWith('oj-') && !allowed.has(name))).toEqual([]);
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
