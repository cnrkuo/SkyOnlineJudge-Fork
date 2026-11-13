import { ContestProblemState } from '@skyoj/contract';
import { describe, expect, it } from 'vitest';
import { contestGrant, NO_GRANT } from './grants.js';

const now = new Date('2026-05-01T12:00:00Z');
const running = new Date('2026-05-01T15:00:00Z');
const ended = new Date('2026-05-01T09:00:00Z');

describe('contestGrant', () => {
  it('grants nothing without a contest', () => {
    expect(contestGrant([], now)).toEqual(NO_GRANT);
  });

  it('lets participants read and submit while the contest runs', () => {
    expect(contestGrant([{ endAt: running, problemState: ContestProblemState.NORMAL }], now)).toEqual({
      read: true,
      submit: true,
    });
  });

  it('keeps the statement readable but closes submissions once the contest ended', () => {
    expect(contestGrant([{ endAt: ended, problemState: ContestProblemState.NORMAL }], now)).toEqual({
      read: true,
      submit: false,
    });
  });

  it('never opens submissions for a read-only contest problem', () => {
    expect(contestGrant([{ endAt: running, problemState: ContestProblemState.READONLY }], now).submit).toBe(false);
  });

  it('is generous across contests: any running one opens submissions', () => {
    const entries = [
      { endAt: ended, problemState: ContestProblemState.NORMAL },
      { endAt: running, problemState: ContestProblemState.NORMAL },
    ];
    expect(contestGrant(entries, now).submit).toBe(true);
  });
});
