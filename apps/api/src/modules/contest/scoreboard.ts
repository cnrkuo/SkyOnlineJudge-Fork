import { ContestStyle, Language, Verdict } from '@skyoj/contract';

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
  id: number;
  userId: number;
  problemId: number;
  verdict: number;
  score: number;
  language: string;
  /** CPU time and peak memory the judge measured. */
  timeMs: number;
  memoryKb: number;
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
  /** The first participant to solve the problem (an accepted submission). */
  firstBlood: boolean;
  score: number;
  /**
   * The submission the cell counts: the accepted one in ICPC, the first to
   * reach the cell's best score in IOI. `null` while nothing scored.
   */
  submissionId: number | null;
  /** Seconds from the contest start to that submission. */
  solvedSeconds: number | null;
}
/** The submission a cell counts, with what the tie-breaks need of it. */
interface Counted {
  submissionId: number;
  seconds: number;
  timeMs: number;
  memoryKb: number;
  language: string;
}
export interface ScoreboardRow {
  rank: number;
  user: { id: number; nickname: string };
  state: number;
  solved: number;
  /** ICPC: minutes to each accepted submission plus the penalty for earlier rejected ones. */
  penalty: number;
  score: number;
  /** Seconds from the contest start to each counted submission, summed. */
  solveSeconds: number;
  /** CPU time and peak memory of the counted submissions, summed. */
  runTimeMs: number;
  memoryKb: number;
  cells: ScoreboardCell[];
  /** Per problem; null where nothing counts. Internal to ranking. */
  counted: (Counted | null)[];
}
export interface Scoreboard {
  problems: (ScoreboardProblem & { attempts: number; accepted: number })[];
  rows: ScoreboardRow[];
}

/** Verdicts that do not count as an attempt. */
const IGNORED = new Set<number>([Verdict.WAIT, Verdict.JUDGING, Verdict.CE, Verdict.JE, Verdict.SE]);

/** Last tie-break: solutions in C rank before C++, C++ before Python. */
const LANGUAGE_ORDER: Record<string, number> = {
  [Language.C]: 0,
  [Language.CPP]: 1,
  [Language.CPP23]: 1,
  [Language.CLANG_CPP17]: 1,
  [Language.CLANG_CPP23]: 1,
  [Language.PYTHON3]: 2,
};
const LANGUAGE_GROUPS = 3;

/** How many counted solutions a row has in each language group, C first. */
function languageCounts(row: ScoreboardRow): number[] {
  const counts = new Array<number>(LANGUAGE_GROUPS + 1).fill(0);
  for (const counted of row.counted) {
    if (!counted) continue;
    const group = LANGUAGE_ORDER[counted.language] ?? LANGUAGE_GROUPS;
    counts[group] = (counts[group] ?? 0) + 1;
  }
  return counts;
}

/** More solutions in C first; with as many, more in C++; then Python. */
function compareLanguages(a: ScoreboardRow, b: ScoreboardRow): number {
  const [countsA, countsB] = [languageCounts(a), languageCounts(b)];
  for (let group = 0; group < LANGUAGE_GROUPS; group++) {
    const difference = (countsB[group] ?? 0) - (countsA[group] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Ranking order. First the contest's own measure — IOI: total score; ICPC:
 * problems solved, then penalty time (ICPC's "total time") — and among rows
 * still equal: total solving time, total run time, total memory, languages.
 */
function compare(style: string, a: ScoreboardRow, b: ScoreboardRow): number {
  const main =
    style === ContestStyle.IOI
      ? b.score - a.score || a.solveSeconds - b.solveSeconds
      : b.solved - a.solved || a.penalty - b.penalty;
  return main || a.runTimeMs - b.runTimeMs || a.memoryKb - b.memoryKb || compareLanguages(a, b);
}

/**
 * Builds a scoreboard from raw submissions (which must be ordered oldest
 * first). Shared by ICPC and IOI contests; only the ranking order differs.
 *
 * - Submissions after a user's first AC on a problem are ignored.
 * - ICPC penalty = minutes to AC + `penaltySec` per earlier rejected attempt.
 * - A cell's score is the best score among counted submissions; the cell
 *   counts the first submission that reached it.
 * - Ties (equal on every criterion of `compare`) share a rank, and the next
 *   rank follows directly ("1, 1, 2"), as the legacy scoreboard did.
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
    if (!row || index === undefined || !cell || !total || IGNORED.has(submission.verdict) || cell.accepted) continue;

    total.attempts++;
    const firstBlood = !solvedProblems.has(submission.problemId);
    if (countAttempt(contest, row, cell, index, submission, firstBlood)) {
      solvedProblems.add(submission.problemId);
      total.accepted++;
    }
  }

  for (const row of rows.values()) summarize(row);
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
    solveSeconds: 0,
    runTimeMs: 0,
    memoryKb: 0,
    cells: Array.from({ length: problemCount }, () => ({
      attempts: 0,
      accepted: false,
      firstBlood: false,
      score: 0,
      submissionId: null,
      solvedSeconds: null,
    })),
    counted: new Array<Counted | null>(problemCount).fill(null),
  };
}

/** Counts one attempt on a not yet solved cell; returns whether it solved it. */
function countAttempt(
  contest: ScoreboardContest,
  row: ScoreboardRow,
  cell: ScoreboardCell,
  index: number,
  submission: ScoreboardSubmission,
  firstBlood: boolean,
): boolean {
  const seconds = Math.max(0, Math.floor((submission.createdAt.getTime() - contest.startAt.getTime()) / 1000));
  const counted: Counted = {
    submissionId: submission.id,
    seconds,
    timeMs: submission.timeMs,
    memoryKb: submission.memoryKb,
    language: submission.language,
  };
  cell.attempts++;
  const accepted = submission.verdict === Verdict.AC;
  // ICPC counts the accepted submission; IOI the first to reach the best score.
  const counts = contest.style === ContestStyle.IOI ? submission.score > cell.score : accepted;
  if (counts) row.counted[index] = counted;
  cell.score = Math.max(cell.score, submission.score);
  if (!accepted) return false;

  cell.accepted = true;
  cell.firstBlood = firstBlood;
  row.solved++;
  row.penalty += Math.floor((seconds + (cell.attempts - 1) * contest.penaltySec) / 60);
  return true;
}

/** Fills in the row's totals and each cell's counted submission. */
function summarize(row: ScoreboardRow): void {
  row.cells.forEach((cell, index) => {
    const counted = row.counted[index];
    row.score += cell.score;
    if (!counted) return;
    cell.submissionId = counted.submissionId;
    cell.solvedSeconds = counted.seconds;
    row.solveSeconds += counted.seconds;
    row.runTimeMs += counted.timeMs;
    row.memoryKb += counted.memoryKb;
  });
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
