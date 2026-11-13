import { ScoreMode, Verdict } from '@skyoj/contract';
import { describe, expect, it } from 'vitest';
import { type JudgeReport, judgedResult } from './judging.js';

const average = { scoreMode: ScoreMode.AVERAGE, scoreGroups: [] };
const testcases = [
  { id: 11, ordinal: 0 },
  { id: 12, ordinal: 1 },
];
const result = (testcaseId: number, verdict: number, timeMs: number, memoryKb: number) => ({
  testcaseId,
  verdict,
  timeMs,
  memoryKb,
  score: verdict === Verdict.AC ? 1 : 0,
  message: '',
});
const report = (results: JudgeReport['results'], extra: Partial<JudgeReport> = {}): JudgeReport => ({
  submissionId: 1,
  compileMessage: '',
  results,
  ...extra,
});

describe('judgedResult', () => {
  it('keeps the verdict of a run that never reached the testcases', () => {
    const judged = judgedResult(report([], { verdict: Verdict.CE, compileMessage: 'error: x' }), average, testcases);
    expect(judged).toEqual({
      verdict: Verdict.CE,
      score: 0,
      timeMs: 0,
      memoryKb: 0,
      compileMessage: 'error: x',
      results: [],
    });
  });

  it('sums time, takes peak memory, scores and picks the worst verdict', () => {
    const judged = judgedResult(
      report([result(12, Verdict.WA, 30, 900), result(11, Verdict.AC, 20, 1200)]),
      average,
      testcases,
    );
    expect(judged).toMatchObject({ verdict: Verdict.WA, score: 50, timeMs: 50, memoryKb: 1200 });
    expect(judged.results.map((r) => r.ordinal)).toEqual([0, 1]);
  });

  it('drops results for testcases that no longer exist', () => {
    const judged = judgedResult(report([result(11, Verdict.AC, 5, 100), result(99, Verdict.WA, 5, 100)]), average, [
      testcases[0] as { id: number; ordinal: number },
    ]);
    expect(judged).toMatchObject({ verdict: Verdict.AC, score: 100 });
    expect(judged.results).toHaveLength(1);
  });

  it('is a judge error when nothing is left to score', () => {
    expect(judgedResult(report([]), average, testcases).verdict).toBe(Verdict.JE);
    expect(judgedResult(report([result(11, Verdict.AC, 1, 1)]), undefined, testcases).verdict).toBe(Verdict.JE);
  });

  it('reports a misconfigured problem as a score error instead of failing', () => {
    const broken = { scoreMode: ScoreMode.GROUP_MIN, scoreGroups: [] };
    const judged = judgedResult(report([result(11, Verdict.AC, 1, 1)]), broken, testcases);
    expect(judged.verdict).toBe(Verdict.SE);
    expect(judged.compileMessage).toMatch(/^Score error:/);
  });
});
