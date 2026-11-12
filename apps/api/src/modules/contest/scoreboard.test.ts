import { ContestStyle, TeamState, Verdict } from '@skyoj/contract';
import { describe, expect, it } from 'vitest';
import { buildScoreboard, type BoardSubmission } from './scoreboard.js';

const startAt = new Date('2026-01-01T00:00:00Z');
const at = (minutes: number) => new Date(startAt.getTime() + minutes * 60_000);
const problems = [
  { problemId: 10, tag: 'A' },
  { problemId: 20, tag: 'B' },
];
const users = [
  { id: 1, nickname: 'alice', state: TeamState.ACCEPTED },
  { id: 2, nickname: 'bob', state: TeamState.ACCEPTED },
  { id: 3, nickname: 'carol', state: TeamState.ACCEPTED },
];
const sub = (userId: number, problemId: number, verdict: number, minute: number, score = 0): BoardSubmission => ({
  userId,
  problemId,
  verdict,
  score: verdict === Verdict.AC ? 100 : score,
  createdAt: at(minute),
});

describe('buildScoreboard (ICPC)', () => {
  const contest = { style: ContestStyle.ICPC, startAt, penaltySec: 1200 };
  const board = buildScoreboard(contest, problems, users, [
    sub(1, 10, Verdict.WA, 5),
    sub(2, 10, Verdict.AC, 7),
    sub(1, 10, Verdict.CE, 8), // compile errors are free
    sub(1, 10, Verdict.AC, 10),
    sub(1, 10, Verdict.WA, 11), // ignored: already accepted
    sub(1, 20, Verdict.AC, 30),
    sub(2, 20, Verdict.WA, 40),
    sub(9, 10, Verdict.AC, 1), // not a participant
  ]);
  const [first, second, third] = board.rows;

  it('ranks by solved count, then penalty', () => {
    expect(board.rows.map((r) => r.user.nickname)).toEqual(['alice', 'bob', 'carol']);
    expect(board.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(first).toMatchObject({ solved: 2, penalty: 10 + 20 + 30 });
    expect(second).toMatchObject({ solved: 1, penalty: 7 });
    expect(third).toMatchObject({ solved: 0, penalty: 0 });
  });

  it('tracks attempts, accept time and first blood per cell', () => {
    expect(first!.cells[0]).toMatchObject({ attempts: 2, accepted: true, acceptedMinute: 10, firstBlood: false });
    expect(second!.cells[0]).toMatchObject({ attempts: 1, accepted: true, acceptedMinute: 7, firstBlood: true });
    expect(first!.cells[1]).toMatchObject({ firstBlood: true });
    expect(second!.cells[1]).toMatchObject({ attempts: 1, accepted: false, acceptedMinute: null });
  });

  it('aggregates per-problem totals', () => {
    expect(board.problems).toEqual([
      { problemId: 10, tag: 'A', attempts: 3, accepted: 2 },
      { problemId: 20, tag: 'B', attempts: 2, accepted: 1 },
    ]);
  });
});

describe('buildScoreboard (IOI)', () => {
  it('ranks by the sum of best scores and shares ranks on ties', () => {
    const contest = { style: ContestStyle.IOI, startAt, penaltySec: 0 };
    const board = buildScoreboard(contest, problems, users, [
      sub(1, 10, Verdict.WA, 1, 40),
      sub(1, 10, Verdict.WA, 2, 30), // a worse resubmission does not lower the score
      sub(2, 10, Verdict.WA, 3, 40),
      sub(3, 10, Verdict.AC, 4),
      sub(3, 20, Verdict.WA, 5, 20),
    ]);
    const more = buildScoreboard(contest, problems, [...users, { id: 4, nickname: 'dave', state: TeamState.ACCEPTED }], [
      sub(1, 10, Verdict.WA, 1, 40),
      sub(2, 10, Verdict.WA, 3, 40),
      sub(4, 10, Verdict.WA, 4, 10),
    ]);
    // Dense ranking: after two teams tied for first comes rank 2, not 3.
    expect(more.rows.map((r) => [r.user.nickname, r.rank])).toEqual([
      ['alice', 1],
      ['bob', 1],
      ['dave', 2],
      ['carol', 3],
    ]);
    expect(board.rows.map((r) => [r.user.nickname, r.score, r.rank])).toEqual([
      ['carol', 120, 1],
      ['alice', 40, 2],
      ['bob', 40, 2],
    ]);
  });
});
