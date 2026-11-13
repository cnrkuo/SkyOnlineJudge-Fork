import { AccessLevel } from '@skyoj/contract';
import { describe, expect, it } from 'vitest';
import { formatScoreGroups, parseAccess, parseScoreGroups } from './problem-form';

describe('parseScoreGroups', () => {
  it('reads one "<points> <count>" subtask per line, ignoring blank lines', () => {
    expect(parseScoreGroups('40 2\n\n  60, 3  \n')).toEqual([
      [40, 2],
      [60, 3],
    ]);
    expect(parseScoreGroups('')).toEqual([]);
  });

  it('allows fractional points but whole, positive testcase counts', () => {
    expect(parseScoreGroups('12.5 1')).toEqual([[12.5, 1]]);
    for (const text of ['10 0', '10 1.5', '-1 2', '10', '10 2 3', 'ten 2']) expect(parseScoreGroups(text)).toBeNull();
  });

  it('round-trips through the editor text', () => {
    const groups: [number, number][] = [
      [40, 2],
      [60, 3],
    ];
    expect(parseScoreGroups(formatScoreGroups(groups))).toEqual(groups);
  });
});

describe('parseAccess', () => {
  it('reads the offered levels and falls back to the most private one', () => {
    expect(parseAccess(String(AccessLevel.OPEN))).toBe(AccessLevel.OPEN);
    expect(parseAccess(String(AccessLevel.ADMIN))).toBe(AccessLevel.ADMIN);
    expect(parseAccess('42')).toBe(AccessLevel.HIDDEN);
    expect(parseAccess(null)).toBe(AccessLevel.HIDDEN);
  });
});
