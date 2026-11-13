import { Injectable, Logger } from '@nestjs/common';
import { ProblemRepository } from '../problem/problem.repository.js';
import { type JudgeReport, judgedResult } from './judging.js';
import { SubmissionRepository } from './submission.repository.js';

/** Stores judges' reports as verdicts and scores. Called by the write-queue consumer. */
@Injectable()
export class SubmissionResultService {
  private readonly logger = new Logger(SubmissionResultService.name);

  constructor(
    private readonly submissions: SubmissionRepository,
    private readonly problems: ProblemRepository,
  ) {}

  async record(judgeId: number, report: JudgeReport): Promise<void> {
    const submission = await this.submissions.findById(report.submissionId);
    if (!submission) {
      this.logger.warn(`Dropped a result for unknown submission ${report.submissionId}`);
      return;
    }
    const [found, testcases] = await Promise.all([
      this.problems.findById(submission.problemId),
      this.problems.listTestcases(submission.problemId),
    ]);
    const result = judgedResult(report, found?.problem, testcases);
    if (!(await this.submissions.saveResult(submission.id, judgeId, result))) {
      // Rejudged or reclaimed by another judge in the meantime; drop it.
      this.logger.warn(`Discarded stale result for submission ${submission.id} from judge #${judgeId}`);
    }
  }
}
