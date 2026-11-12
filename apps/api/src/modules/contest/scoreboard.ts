import { ContestStyle, Verdict } from '@skyoj/contract';

export interface BoardProblem {
  problemId: number;
  tag: string;
}
export interface BoardUser {
  id: number;
  nickname: string;
  state: number;
}
export interface BoardSubmission {
  userId: number;
  problemId: number;
  verdict: number;
  score: number;
  createdAt: Date;
}
export interface BoardCell {
  attempts: number;
  accepted: boolean;
  firstBlood: boolean;
  acceptedMinute: number | null;
  score: number;
}
export interface BoardRow {
  rank: number;
  user: { id: number; nickname: string };
  state: number;
  solved: number;
  penalty: number;
  score: number;
  cells: BoardCell[];
  /** Attempts spent on solved problems; last ICPC tie-breaker. */
  attemptsOnSolved: number;
}
export interface Board {
  problems: (BoardProblem & { attempts: number; accepted: number })[];
  rows: BoardRow[];
}

/** Verdicts that do not count as an attempt. */
const IGNORED = new Set<number>([Verdict.WAIT, Verdict.JUDGING, Verdict.CE, Verdict.JE, Verdict.SE]);

function compare(style: string, a: BoardRow, b: BoardRow): number {
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
 * - Ties share a rank ("1, 1, 3" ranking).
 */
export function buildScoreboard(
  contest: { style: string; startAt: Date; penaltySec: number },
  problems: BoardProblem[],
  users: BoardUser[],
  submissions: BoardSubmission[],
): Board {
  const column = new Map(problems.map((p, index) => [p.problemId, index]));
  const totals = problems.map((p) => ({ ...p, attempts: 0, accepted: 0 }));
  const rows = new Map<number, BoardRow>(
    users.map((user) => [
      user.id,
      {
        rank: 0,
        user: { id: user.id, nickname: user.nickname },
        state: user.state,
        solved: 0,
        penalty: 0,
        score: 0,
        attemptsOnSolved: 0,
        cells: problems.map(() => ({ attempts: 0, accepted: false, firstBlood: false, acceptedMinute: null, score: 0 })),
      },
    ]),
  );
  const solvedProblems = new Set<number>();

  for (const sub of submissions) {
    const row = rows.get(sub.userId);
    const index = column.get(sub.problemId);
    if (!row || index === undefined || IGNORED.has(sub.verdict)) continue;
    const cell = row.cells[index]!;
    const total = totals[index]!;
    if (cell.accepted) continue;

    cell.attempts++;
    total.attempts++;
    if (sub.score > cell.score) {
      row.score += sub.score - cell.score;
      cell.score = sub.score;
    }
    if (sub.verdict === Verdict.AC) {
      const seconds = Math.max(0, (sub.createdAt.getTime() - contest.startAt.getTime()) / 1000);
      cell.accepted = true;
      cell.acceptedMinute = Math.floor(seconds / 60);
      cell.firstBlood = !solvedProblems.has(sub.problemId);
      solvedProblems.add(sub.problemId);
      row.solved++;
      row.attemptsOnSolved += cell.attempts;
      row.penalty += Math.floor((seconds + (cell.attempts - 1) * contest.penaltySec) / 60);
      total.accepted++;
    }
  }

  const ordered = [...rows.values()].sort((a, b) => compare(contest.style, a, b) || a.user.id - b.user.id);
  ordered.forEach((row, index) => {
    const previous = ordered[index - 1];
    row.rank = previous && compare(contest.style, previous, row) === 0 ? previous.rank : index + 1;
  });
  return { problems: totals, rows: ordered };
}
