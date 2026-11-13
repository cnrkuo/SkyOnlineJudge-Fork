import { describe, expect, it } from 'vitest';
import { idParam, paging, positive } from './params';

describe('idParam', () => {
  it('accepts positive integers and answers anything else with a 404', () => {
    expect(idParam('12')).toBe(12);
    for (const value of ['0', '-3', '1.5', 'abc', undefined]) {
      expect(() => idParam(value)).toThrow(expect.objectContaining({ status: 404 }));
    }
  });
});

describe('paging', () => {
  it('reads ?page= and ?size=, falling back to safe values', () => {
    expect(paging(new URLSearchParams('page=3&size=100'))).toEqual({ page: 3, pageSize: 100 });
    expect(paging(new URLSearchParams('page=-1&size=7'), 20)).toEqual({ page: 1, pageSize: 20 });
    expect(positive(null)).toBeUndefined();
  });
});
