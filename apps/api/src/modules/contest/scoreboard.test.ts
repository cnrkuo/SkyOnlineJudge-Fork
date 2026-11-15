import { ContestStyle, Language, TeamState, Verdict } from '@skyoj/contract';
import { describe, expect, it } from 'vitest';
import { buildScoreboard, type ScoreboardSubmission } from './scoreboard.js';

const startAt = new Date('2026-01-01T00:00:00Z');
const at = (minutes: number) => new Date(startAt.getTime() + minutes * 60_000);
const problems = [
  { problemId: 10, tag: 'A' },
  { problemId: 20, tag: 'B' },
];
const users = [
  { id: 1, username: 'alice', state: TeamState.ACCEPTED },
  { id: 2, username: 'bob', state: TeamState.ACCEPTED },
  { id: 3, username: 'carol', state: TeamState.ACCEPTED },
];
let nextId = 1;
const sub = (
  userId: number,
  problemId: number,
  verdict: number,
  minute: number,
  score = 0,
  run: { timeMs?: number; memoryKb?: number; language?: string } = {},
): ScoreboardSubmission => ({
  id: nextId++,
  userId,
  problemId,
  verdict,
  score: verdict === Verdict.AC ? 100 : score,
  language: run.language ?? Language.CPP,
  timeMs: run.timeMs ?? 10,
  memoryKb: run.memoryKb ?? 1000,
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
    expect(board.rows.map((r) => r.user.username)).toEqual(['alice', 'bob', 'carol']);
    expect(board.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(first).toMatchObject({ solved: 2, penalty: 10 + 20 + 30 });
    expect(second).toMatchObject({ solved: 1, penalty: 7 });
    expect(third).toMatchObject({ solved: 0, penalty: 0 });
  });

  it('tracks attempts, the accepted submission, its time and first blood per cell', () => {
    expect(first!.cells[0]).toMatchObject({ attempts: 2, accepted: true, solvedSeconds: 600, firstBlood: false });
    expect(second!.cells[0]).toMatchObject({ attempts: 1, accepted: true, solvedSeconds: 420, firstBlood: true });
    expect(first!.cells[1]).toMatchObject({ firstBlood: true });
    expect(second!.cells[1]).toMatchObject({ attempts: 1, accepted: false, submissionId: null, solvedSeconds: null });
    // The cell links to the accepted submission, not to the rejected ones before it.
    expect(first!.cells[0]!.submissionId).not.toBeNull();
    expect(first!.cells[0]!.submissionId).not.toBe(second!.cells[0]!.submissionId);
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
    const more = buildScoreboard(
      contest,
      problems,
      [...users, { id: 4, username: 'dave', state: TeamState.ACCEPTED }],
      [sub(1, 10, Verdict.WA, 1, 40), sub(2, 10, Verdict.WA, 3, 40), sub(4, 10, Verdict.WA, 4, 10)],
    );
    // With equal scores, whoever reached them sooner ranks first.
    expect(more.rows.map((r) => [r.user.username, r.rank])).toEqual([
      ['alice', 1],
      ['bob', 2],
      ['dave', 3],
      ['carol', 4],
    ]);
    expect(board.rows.map((r) => [r.user.username, r.score, r.rank])).toEqual([
      ['carol', 120, 1],
      ['alice', 40, 2],
      ['bob', 40, 3],
    ]);
  });
});

describe('buildScoreboard: what a cell counts', () => {
  it('IOI counts the first submission that reached the best score', () => {
    const contest = { style: ContestStyle.IOI, startAt, penaltySec: 0 };
    const reached = sub(1, 10, Verdict.WA, 5, 60);
    const board = buildScoreboard(contest, problems, users, [
      sub(1, 10, Verdict.WA, 1, 30),
      reached,
      sub(1, 10, Verdict.WA, 9, 60), // the same score again does not move the time
    ]);
    const alice = board.rows.find((r) => r.user.id === 1)!;
    expect(alice.cells[0]).toMatchObject({ score: 60, submissionId: reached.id, solvedSeconds: 300 });
    expect(alice).toMatchObject({ solveSeconds: 300, runTimeMs: 10, memoryKb: 1000 });
  });
});

describe('buildScoreboard: ties', () => {
  const icpc = { style: ContestStyle.ICPC, startAt, penaltySec: 1200 };
  const ioi = { style: ContestStyle.IOI, startAt, penaltySec: 0 };
  const order = (board: ReturnType<typeof buildScoreboard>) =>
    board.rows.map((r) => [r.user.username, r.rank] as const);

  it('ICPC: equal solved and penalty rank by total solving time, to the second', () => {
    const board = buildScoreboard(icpc, problems, users.slice(0, 2), [
      { ...sub(1, 10, Verdict.AC, 5), createdAt: new Date(at(5).getTime() + 40_000) },
      { ...sub(2, 10, Verdict.AC, 5), createdAt: new Date(at(5).getTime() + 10_000) },
    ]);
    expect(board.rows.map((r) => r.penalty)).toEqual([5, 5]);
    expect(order(board)).toEqual([
      ['bob', 1],
      ['alice', 2],
    ]);
  });

  it('IOI: equal scores rank by total solving time', () => {
    const board = buildScoreboard(ioi, problems, users.slice(0, 2), [
      sub(1, 10, Verdict.AC, 30),
      sub(2, 10, Verdict.AC, 20),
    ]);
    expect(order(board)).toEqual([
      ['bob', 1],
      ['alice', 2],
    ]);
  });

  it('then by first solves (more first)', () => {
    // Both solve A and B at the same times; bob was first on both.
    const board = buildScoreboard(icpc, problems, users.slice(0, 2), [
      sub(2, 10, Verdict.AC, 5),
      sub(1, 10, Verdict.AC, 5),
      sub(2, 20, Verdict.AC, 9),
      sub(1, 20, Verdict.AC, 9),
    ]);
    expect(board.rows.map((r) => [r.user.username, r.firstBloods])).toEqual([
      ['bob', 2],
      ['alice', 0],
    ]);
    expect(order(board)[1]).toEqual(['alice', 2]);
  });

  it('then by rejected attempts (fewer first)', () => {
    // IOI, so earlier attempts cost no penalty: both reach 100 at minute 5 on
    // a problem first solved by carol; alice got there with one more try.
    const board = buildScoreboard(ioi, problems, users, [
      sub(3, 10, Verdict.AC, 1),
      sub(1, 10, Verdict.WA, 2, 50),
      sub(1, 10, Verdict.TLE, 3, 0),
      sub(2, 10, Verdict.WA, 4, 0),
      sub(1, 10, Verdict.AC, 5),
      sub(2, 10, Verdict.AC, 5),
    ]);
    expect(board.rows.map((r) => [r.user.username, r.rejected])).toEqual([
      ['carol', 0],
      ['bob', 1],
      ['alice', 2],
    ]);
    expect(order(board).map(([, rank]) => rank)).toEqual([1, 2, 3]);
  });

  it('then by total run time, then total memory', () => {
    // Different problems, so each row has one first solve.
    const byTime = buildScoreboard(icpc, problems, users.slice(0, 2), [
      sub(1, 10, Verdict.AC, 5, 0, { timeMs: 50 }),
      sub(2, 20, Verdict.AC, 5, 0, { timeMs: 40 }),
    ]);
    expect(order(byTime)).toEqual([
      ['bob', 1],
      ['alice', 2],
    ]);
    const byMemory = buildScoreboard(icpc, problems, users.slice(0, 2), [
      sub(1, 10, Verdict.AC, 5, 0, { memoryKb: 900 }),
      sub(2, 20, Verdict.AC, 5, 0, { memoryKb: 2000 }),
    ]);
    expect(order(byMemory)).toEqual([
      ['alice', 1],
      ['bob', 2],
    ]);
  });

  it('then by language: C before C++ before Python', () => {
    // A third problem so that each row has one first solve.
    const three = [...problems, { problemId: 30, tag: 'C' }];
    const board = buildScoreboard(icpc, three, users, [
      sub(1, 10, Verdict.AC, 5, 0, { language: Language.PYTHON3 }),
      sub(2, 20, Verdict.AC, 5, 0, { language: Language.CLANG_CPP23 }),
      sub(3, 30, Verdict.AC, 5, 0, { language: Language.C }),
    ]);
    expect(order(board)).toEqual([
      ['carol', 1],
      ['bob', 2],
      ['alice', 3],
    ]);
  });

  it('shares a rank only when every criterion is equal', () => {
    const board = buildScoreboard(icpc, problems, users.slice(0, 2), [
      sub(1, 10, Verdict.AC, 5),
      sub(2, 20, Verdict.AC, 5),
    ]);
    expect(order(board)).toEqual([
      ['alice', 1],
      ['bob', 1],
    ]);
  });
});
