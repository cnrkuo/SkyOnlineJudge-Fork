import { ContestStyle, Verdict } from '@skyoj/contract';

export interface ScoreboardProblem {
  problemId: number;
  tag: string;
}
export interface ScoreboardUser {
  id: number;
  nickname: string;
  state: number;
}
export interface ScoreboardSubmission {
  userId: number;
  problemId: number;
  verdict: number;
  score: number;
  createdAt: Date;
}
export interface ScoreboardContest {
  style: string;
  startAt: Date;
  penaltySec: number;
}
export interface ScoreboardCell {
  attempts: number;
  accepted: boolean;
  firstBlood: boolean;
  acceptedMinute: number | null;
  score: number;
}
export interface ScoreboardRow {
  rank: number;
  user: { id: number; nickname: string };
  state: number;
  solved: number;
  penalty: number;
  score: number;
  cells: ScoreboardCell[];
  /** Attempts spent on solved problems; last ICPC tie-breaker. */
  attemptsOnSolved: number;
}
export interface Scoreboard {
  problems: (ScoreboardProblem & { attempts: number; accepted: number })[];
  rows: ScoreboardRow[];
}

/** Verdicts that do not count as an attempt. */
const IGNORED = new Set<number>([Verdict.WAIT, Verdict.JUDGING, Verdict.CE, Verdict.JE, Verdict.SE]);

function compare(style: string, a: ScoreboardRow, b: ScoreboardRow): number {
  if (style === ContestStyle.IOI) return b.score - a.score;
  return b.solved - a.solved || a.penalty - b.penalty || a.attemptsOnSolved - b.attemptsOnSolved;
}

/**
 * Builds a scoreboard from raw submissions (which must be ordered oldest
 * first). Shared by ICPC and IOI contests; only the ranking order differs.
 *
 * - Submissions after a user's first AC on a problem are ignored.
 * - ICPC penalty = minutes to AC + `penaltySec` per earlier rejected attempt.
 * - A cell's score is the best score among counted submissions.
 * - Ties share a rank and the next rank follows directly ("1, 1, 2"), as
 *   the legacy scoreboard did.
 */
export function buildScoreboard(
  contest: ScoreboardContest,
  problems: ScoreboardProblem[],
  users: ScoreboardUser[],
  submissions: ScoreboardSubmission[],
): Scoreboard {
  const column = new Map(problems.map((p, index) => [p.problemId, index]));
  const totals = problems.map((p) => ({ ...p, attempts: 0, accepted: 0 }));
  const rows = new Map(users.map((user) => [user.id, emptyRow(user, problems.length)]));
  const solvedProblems = new Set<number>();

  for (const submission of submissions) {
    const row = rows.get(submission.userId);
    const index = column.get(submission.problemId);
    const cell = index === undefined ? undefined : row?.cells[index];
    const total = index === undefined ? undefined : totals[index];
    if (!row || !cell || !total || IGNORED.has(submission.verdict) || cell.accepted) continue;

    total.attempts++;
    const firstBlood = !solvedProblems.has(submission.problemId);
    if (countAttempt(contest, row, cell, submission, firstBlood)) {
      solvedProblems.add(submission.problemId);
      total.accepted++;
    }
  }

  return { problems: totals, rows: ranked([...rows.values()], contest.style) };
}

function emptyRow(user: ScoreboardUser, problemCount: number): ScoreboardRow {
  return {
    rank: 0,
    user: { id: user.id, nickname: user.nickname },
    state: user.state,
    solved: 0,
    penalty: 0,
    score: 0,
    attemptsOnSolved: 0,
    cells: Array.from({ length: problemCount }, () => ({
      attempts: 0,
      accepted: false,
      firstBlood: false,
      acceptedMinute: null,
      score: 0,
    })),
  };
}

/** Counts one attempt on a not yet solved cell; returns whether it solved it. */
function countAttempt(
  contest: ScoreboardContest,
  row: ScoreboardRow,
  cell: ScoreboardCell,
  submission: ScoreboardSubmission,
  firstBlood: boolean,
): boolean {
  cell.attempts++;
  if (submission.score > cell.score) {
    row.score += submission.score - cell.score;
    cell.score = submission.score;
  }
  if (submission.verdict !== Verdict.AC) return false;

  const seconds = Math.max(0, (submission.createdAt.getTime() - contest.startAt.getTime()) / 1000);
  cell.accepted = true;
  cell.acceptedMinute = Math.floor(seconds / 60);
  cell.firstBlood = firstBlood;
  row.solved++;
  row.attemptsOnSolved += cell.attempts;
  row.penalty += Math.floor((seconds + (cell.attempts - 1) * contest.penaltySec) / 60);
  return true;
}

/** Sorts rows by the contest's rules and numbers them; ties share a rank. */
function ranked(rows: ScoreboardRow[], style: string): ScoreboardRow[] {
  const ordered = rows.sort((a, b) => compare(style, a, b) || a.user.id - b.user.id);
  ordered.forEach((row, index) => {
    const previous = ordered[index - 1];
    row.rank = !previous ? 1 : compare(style, previous, row) === 0 ? previous.rank : previous.rank + 1;
  });
  return ordered;
}
