import { describe, expect, it } from 'vitest';
import { hasDuplicates } from './collections.js';
import { BadRequestError } from './errors.js';
import { resolveWindow } from './time-window.js';

const current = { startAt: new Date('2026-01-01T00:00:00Z'), endAt: new Date('2026-01-02T00:00:00Z') };

describe('resolveWindow', () => {
  it('parses both ends of a new window', () => {
    const { patch, window } = resolveWindow({ startAt: '2026-03-01T08:00:00Z', endAt: '2026-03-01T13:00:00Z' });
    expect(window).toEqual({ startAt: new Date('2026-03-01T08:00:00Z'), endAt: new Date('2026-03-01T13:00:00Z') });
    expect(patch).toEqual(window);
  });

  it('keeps the current value of an end the update leaves out', () => {
    const { patch, window } = resolveWindow({ endAt: '2026-01-03T00:00:00Z' }, current);
    expect(patch).toEqual({ endAt: new Date('2026-01-03T00:00:00Z') });
    expect(window).toEqual({ startAt: current.startAt, endAt: new Date('2026-01-03T00:00:00Z') });
  });

  it('changes nothing for an update without times', () => {
    expect(resolveWindow({}, current)).toEqual({ patch: {}, window: current });
  });

  it('needs both ends when there is no current window', () => {
    expect(() => resolveWindow({ startAt: '2026-03-01T08:00:00Z' })).toThrow(BadRequestError);
  });
});

describe('hasDuplicates', () => {
  it('detects repeated values', () => {
    expect(hasDuplicates([1, 2, 3])).toBe(false);
    expect(hasDuplicates(['A', 'B', 'A'])).toBe(true);
    expect(hasDuplicates([])).toBe(false);
  });
});
