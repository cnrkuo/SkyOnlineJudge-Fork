import type { JudgeReport } from '../modules/submission/judging.js';

/**
 * Messages on `Queue.WRITES`: database writes that arrive in bursts (a
 * contest starting, a mass rejudge finishing) and are therefore applied by a
 * consumer at a bounded rate instead of directly by the request handlers.
 */
export type WriteCommand =
  | {
      type: 'submission.create';
      /** Reserved with `SubmissionRepository.reserveId`. */
      id: number;
      problemId: number;
      userId: number;
      language: string;
      code: string;
      /** When the user submitted — not when the row gets written. */
      createdAt: string;
    }
  | {
      type: 'submission.result';
      judgeId: number;
      report: JudgeReport;
    };

/** Messages on `Queue.JUDGE`: one per submission waiting for a judge. */
export interface JudgeTaskMessage {
  submissionId: number;
}
