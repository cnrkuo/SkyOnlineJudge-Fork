import { ScoreMode, Verdict } from '@skyoj/contract';
import { describe, expect, it } from 'vitest';
import { computeScore, overallVerdict, ScoreError } from './scoring.js';

const result = (ordinal: number, verdict: number) => ({ ordinal, verdict, score: verdict === Verdict.AC ? 1 : 0 });

describe('computeScore', () => {
  it('average: 100 × accepted / total', () => {
    const results = [result(0, Verdict.AC), result(1, Verdict.WA), result(2, Verdict.AC), result(3, Verdict.AC)];
    expect(computeScore(ScoreMode.AVERAGE, [], results)).toBe(75);
    expect(computeScore(ScoreMode.AVERAGE, [], [])).toBe(0);
  });

  it('group_min: a group scores only if every testcase in it passes', () => {
    // Legacy example: 5 testcases, groups of 2 / 2 / 1 worth 20 / 50 / 30.
    const groups: [number, number][] = [
      [20, 2],
      [50, 2],
      [30, 1],
    ];
    const verdicts = [Verdict.AC, Verdict.AC, Verdict.AC, Verdict.WA, Verdict.AC];
    expect(computeScore(ScoreMode.GROUP_MIN, groups, verdicts.map((v, i) => result(i, v)))).toBe(50);
    expect(computeScore(ScoreMode.GROUP_MIN, groups, verdicts.map((_, i) => result(i, Verdict.AC)))).toBe(100);
  });

  it('group_min: uses partial checker scores and ignores ungrouped testcases', () => {
    const results = [
      { ordinal: 0, verdict: Verdict.AC, score: 1 },
      { ordinal: 1, verdict: Verdict.WA, score: 0.5 },
      { ordinal: 2, verdict: Verdict.WA, score: 0 },
    ];
    expect(computeScore(ScoreMode.GROUP_MIN, [[40, 2]], results)).toBe(20);
  });

  it('rejects broken configurations', () => {
    expect(() => computeScore(ScoreMode.GROUP_MIN, [], [result(0, Verdict.AC)])).toThrow(ScoreError);
    expect(() => computeScore('nope', [], [])).toThrow(ScoreError);
  });
});

describe('overallVerdict', () => {
  it('is the worst testcase verdict', () => {
    expect(overallVerdict([{ verdict: Verdict.AC }, { verdict: Verdict.TLE }, { verdict: Verdict.WA }])).toBe(Verdict.TLE);
    expect(overallVerdict([{ verdict: Verdict.AC }])).toBe(Verdict.AC);
  });
});
