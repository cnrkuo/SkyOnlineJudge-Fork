import { ScoreMode, Verdict } from '@skyoj/contract';

export interface ScoredResult {
  /** Zero-based testcase position. */
  ordinal: number;
  verdict: number;
  /** 0..1 fraction awarded for this testcase. */
  score: number;
}

export class ScoreError extends Error {}

/** 100 × accepted / total. */
function average(results: ScoredResult[]): number {
  if (results.length === 0) return 0;
  const accepted = results.filter((r) => r.verdict === Verdict.AC).length;
  return (100 * accepted) / results.length;
}

/**
 * Subtask scoring. `groups` is `[[score, count], ...]`: consecutive runs of
 * `count` testcases form a group worth `score` points, and a group earns
 * `score × min(testcase score)`. Testcases outside every group are ignored;
 * a group with no results earns nothing.
 */
function groupMin(groups: readonly (readonly [number, number])[], results: ScoredResult[]): number {
  if (groups.length === 0) throw new ScoreError('No score groups are configured for this problem');
  let total = 0;
  let first = 0;
  for (const [groupScore, size] of groups) {
    const members = results.filter((r) => r.ordinal >= first && r.ordinal < first + size);
    if (members.length > 0) total += groupScore * Math.min(...members.map((r) => r.score));
    first += size;
  }
  return total;
}

export function computeScore(
  mode: string,
  groups: readonly (readonly [number, number])[],
  results: ScoredResult[],
): number {
  switch (mode) {
    case ScoreMode.AVERAGE:
      return average(results);
    case ScoreMode.GROUP_MIN:
      return groupMin(groups, results);
    default:
      throw new ScoreError(`Unknown score mode "${mode}"`);
  }
}

/** A submission's verdict is the worst (numerically largest) testcase verdict. */
export function overallVerdict(results: { verdict: number }[]): number {
  return results.reduce((worst, r) => Math.max(worst, r.verdict), Verdict.AC as number);
}
