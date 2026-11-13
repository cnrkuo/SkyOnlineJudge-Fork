import { ScoreMode, Verdict } from '@skyoj/contract';
import { describe, expect, it } from 'vitest';
import { fake } from '../../testing/fixtures.js';
import type { ProblemRepository } from '../problem/problem.repository.js';
import { SubmissionResultService } from './result.service.js';
import type { JudgedResult, SubmissionRepository } from './submission.repository.js';

const report = {
  submissionId: 5,
  compileMessage: '',
  results: [{ testcaseId: 1, verdict: Verdict.AC, timeMs: 3, memoryKb: 10, score: 1, message: '' }],
};

function service(submission: { id: number; problemId: number } | undefined, stillClaimed = true) {
  const saved: [number, number, JudgedResult][] = [];
  const results = new SubmissionResultService(
    fake<SubmissionRepository>({
      findById: async () => submission,
      saveResult: async (id: number, judgeId: number, result: JudgedResult) => {
        saved.push([id, judgeId, result]);
        return stillClaimed;
      },
    }),
    fake<ProblemRepository>({
      findById: async () => ({ problem: { scoreMode: ScoreMode.AVERAGE, scoreGroups: [] } }),
      listTestcases: async () => [{ id: 1, ordinal: 0 }],
    }),
  );
  return { results, saved };
}

describe('SubmissionResultService.record', () => {
  it('scores the report and saves it for the judge that holds the claim', async () => {
    const { results, saved } = service({ id: 5, problemId: 2 });
    await results.record(9, report);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.slice(0, 2)).toEqual([5, 9]);
    expect(saved[0]?.[2]).toMatchObject({ verdict: Verdict.AC, score: 100 });
  });

  it('drops reports for submissions that no longer exist', async () => {
    const { results, saved } = service(undefined);
    await results.record(9, report);
    expect(saved).toEqual([]);
  });

  it('tolerates a stale report (the submission was rejudged meanwhile)', async () => {
    await expect(service({ id: 5, problemId: 2 }, false).results.record(9, report)).resolves.toBeUndefined();
  });
});
