import { describe, expect, it } from 'vitest';
import { unlessOnlySearchChanged } from './revalidate';

const args = (current: string, next: string, formMethod?: string) =>
  ({
    currentUrl: new URL(current, 'http://judge.test'),
    nextUrl: new URL(next, 'http://judge.test'),
    formMethod,
    defaultShouldRevalidate: true,
  }) as Parameters<typeof unlessOnlySearchChanged>[0];

describe('unlessOnlySearchChanged', () => {
  it('leaves paging and filters to the page query', () => {
    expect(unlessOnlySearchChanged(args('/problems?page=1', '/problems?page=2'))).toBe(false);
  });

  it('reloads after navigation to another page and after form submissions', () => {
    expect(unlessOnlySearchChanged(args('/problems', '/contests'))).toBe(true);
    expect(unlessOnlySearchChanged(args('/problems', '/problems', 'POST'))).toBe(true);
  });
});
