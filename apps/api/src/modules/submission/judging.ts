import { Verdict } from '@skyoj/contract';
import type { StoredTestResult } from '../../database/schema.js';
import { computeScore, overallVerdict, ScoreError } from './scoring.js';
import type { JudgedResult } from './submission.repository.js';

/** What a judge machine reports for one submission (`POST /judge/report`). */
export interface JudgeReport {
  submissionId: number;
  /** Set when the run never reached the testcases (compile error, judge failure). */
  verdict?: number;
  compileMessage: string;
  results: { testcaseId: number; verdict: number; timeMs: number; memoryKb: number; score: number; message: string }[];
}

/** The parts of a problem that decide how its results are scored. */
export interface ScoringRules {
  scoreMode: string;
  scoreGroups: readonly (readonly [number, number])[];
}

const failed = (verdict: number, compileMessage: string): JudgedResult => ({
  verdict,
  score: 0,
  timeMs: 0,
  memoryKb: 0,
  compileMessage,
  results: [],
});

/**
 * Turns a judge's raw report into the stored verdict, score and usage.
 * Results for testcases the problem no longer has are dropped (the testdata
 * changed during the run); the rest are put in testcase order.
 */
export function judgedResult(
  report: JudgeReport,
  rules: ScoringRules | undefined,
  testcases: readonly { id: number; ordinal: number }[],
): JudgedResult {
  if (report.verdict !== undefined) return failed(report.verdict, report.compileMessage);

  const ordinalOf = new Map(testcases.map((t) => [t.id, t.ordinal]));
  const results: StoredTestResult[] = report.results.flatMap((result) => {
    const ordinal = ordinalOf.get(result.testcaseId);
    return ordinal === undefined ? [] : [{ ...result, ordinal }];
  });
  results.sort((a, b) => a.ordinal - b.ordinal);
  if (!rules || results.length === 0) return failed(Verdict.JE, 'This problem has no testdata');

  const usage = {
    // Total running time over all testcases, peak memory of any of them.
    timeMs: results.reduce((sum, r) => sum + r.timeMs, 0),
    memoryKb: results.reduce((peak, r) => Math.max(peak, r.memoryKb), 0),
    compileMessage: report.compileMessage,
    results,
  };
  try {
    const score = computeScore(rules.scoreMode, rules.scoreGroups, results);
    return { ...usage, verdict: overallVerdict(results), score };
  } catch (error) {
    if (!(error instanceof ScoreError)) throw error;
    return { ...usage, verdict: Verdict.SE, score: 0, compileMessage: `Score error: ${error.message}` };
  }
}
