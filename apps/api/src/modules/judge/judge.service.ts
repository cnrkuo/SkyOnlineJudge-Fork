import { Injectable, Logger } from '@nestjs/common';
import { type Language, Verdict } from '@skyoj/contract';
import { sha256 } from '../../common/crypto.js';
import { NotFoundError, UnauthorizedError } from '../../common/errors.js';
import type { StoredTestResult } from '../../database/schema.js';
import type { JudgeTaskMessage, WriteCommand } from '../../messaging/commands.js';
import { MessageBroker, Queue } from '../../messaging/message-broker.js';
import { StorageService } from '../../storage/storage.service.js';
import { ProblemRepository } from '../problem/problem.repository.js';
import { computeScore, overallVerdict, ScoreError } from '../submission/scoring.js';
import { type JudgedResult, SubmissionRepository, type SubmissionRow } from '../submission/submission.repository.js';
import { JudgeRepository, type JudgeRow } from './judge.repository.js';

export interface JudgeReport {
  submissionId: number;
  verdict?: number;
  compileMessage: string;
  results: { testcaseId: number; verdict: number; timeMs: number; memoryKb: number; score: number; message: string }[];
}

/** Upper bound on outdated tasks skipped by one fetch. */
const MAX_SKIPPED_TASKS = 50;

/**
 * Server side of the judge-machine protocol: hands out queued submissions,
 * serves testdata and turns raw per-testcase results into a final verdict
 * and score.
 */
@Injectable()
export class JudgeService {
  private readonly logger = new Logger(JudgeService.name);

  constructor(
    private readonly judges: JudgeRepository,
    private readonly submissions: SubmissionRepository,
    private readonly problems: ProblemRepository,
    private readonly storage: StorageService,
    private readonly broker: MessageBroker,
  ) {}

  /** Judge machines authenticate with their own token, not a user session. */
  async authenticate(token: string | undefined): Promise<JudgeRow> {
    const judge = token ? await this.judges.findByTokenHash(sha256(token)) : undefined;
    if (!judge || !judge.enabled) throw new UnauthorizedError('Invalid judge token');
    return judge;
  }

  /**
   * Hands the next queued submission to a judge. Tasks come from RabbitMQ;
   * the claim in the database makes sure a duplicate or outdated task (for a
   * submission that is no longer waiting) is skipped rather than judged twice.
   *
   * A judge that lists its `languages` only gets submissions in those. A
   * task in another language goes back to the end of the queue for a judge
   * that has the toolchain, so a fleet can mix machines with different
   * compilers.
   */
  async fetch(judge: JudgeRow, languages?: readonly string[]) {
    await this.judges.touch(judge.id, languages);
    let submission: SubmissionRow | undefined;
    const deferred = new Set<number>();
    for (let skipped = 0; !submission && skipped < MAX_SKIPPED_TASKS; skipped++) {
      const task = await this.broker.pull<JudgeTaskMessage>(Queue.JUDGE);
      if (!task) break;
      submission = await this.submissions.claim(task.submissionId, judge.id, languages);
      if (submission || !languages || !(await this.submissions.isWaiting(task.submissionId))) continue;
      // Waiting, but in a language this judge cannot run.
      await this.broker.publish(Queue.JUDGE, task);
      // Seen it before: the queue has gone round once with nothing for us.
      if (deferred.has(task.submissionId)) break;
      deferred.add(task.submissionId);
    }
    if (!submission) return { task: null };

    const [found, testcases] = await Promise.all([
      this.problems.findById(submission.problemId),
      this.problems.listTestcases(submission.problemId),
    ]);
    if (!found) throw new NotFoundError('Problem');
    return {
      task: {
        submissionId: submission.id,
        problemId: submission.problemId,
        language: submission.language as Language,
        code: submission.code,
        timeLimitMs: found.problem.timeLimitMs,
        memoryLimitKb: found.problem.memoryLimitKb,
        testcases: testcases.map(({ id, ordinal, inputSha256, outputSha256 }) => ({
          id,
          ordinal,
          inputSha256,
          outputSha256,
        })),
      },
    };
  }

  async testdata(testcaseId: number, kind: 'input' | 'output'): Promise<File> {
    const testcase = await this.problems.findTestcase(testcaseId);
    if (!testcase) throw new NotFoundError('Testcase');
    const hash = kind === 'input' ? testcase.inputSha256 : testcase.outputSha256;
    const data = await this.storage.get(StorageService.testdataKey(testcase.problemId, hash));
    return new File([new Uint8Array(data)], `${testcase.id}.${kind}`, { type: 'application/octet-stream' });
  }

  /**
   * Accepts a judge's report. The result is not written here: it is queued,
   * and the write-queue consumer stores it. Once this returns the report is
   * durable, so the judge can move on.
   */
  async report(judge: JudgeRow, report: JudgeReport): Promise<void> {
    await this.broker.publish(Queue.WRITES, {
      type: 'submission.result',
      judgeId: judge.id,
      report,
    } satisfies WriteCommand);
  }

  /** Scores a queued report and stores it. Called by the write-queue consumer. */
  async applyReport(judgeId: number, report: JudgeReport): Promise<void> {
    const submission = await this.submissions.findById(report.submissionId);
    if (!submission) {
      this.logger.warn(`Dropped a result for unknown submission ${report.submissionId}`);
      return;
    }
    const result = await this.evaluate(submission.problemId, report);
    const saved = await this.submissions.saveResult(submission.id, judgeId, result);
    if (!saved) {
      // Rejudged or reclaimed by another judge in the meantime; drop it.
      this.logger.warn(`Discarded stale result for submission ${submission.id} from judge #${judgeId}`);
    }
  }

  /** Combines per-testcase results into the stored verdict, score and usage. */
  private async evaluate(problemId: number, report: JudgeReport): Promise<JudgedResult> {
    const failed = (verdict: number, compileMessage: string): JudgedResult => ({
      verdict,
      score: 0,
      timeMs: 0,
      memoryKb: 0,
      compileMessage,
      results: [],
    });
    // The run never reached the testcases (compile error, judge failure).
    if (report.verdict !== undefined) return failed(report.verdict, report.compileMessage);

    const [found, testcases] = await Promise.all([
      this.problems.findById(problemId),
      this.problems.listTestcases(problemId),
    ]);
    const ordinalOf = new Map(testcases.map((t) => [t.id, t.ordinal]));
    const results: StoredTestResult[] = report.results
      .filter((r) => ordinalOf.has(r.testcaseId))
      .map((r) => ({ ...r, ordinal: ordinalOf.get(r.testcaseId)! }))
      .sort((a, b) => a.ordinal - b.ordinal);
    if (!found || results.length === 0) return failed(Verdict.JE, 'This problem has no testdata');

    const usage = {
      // Total running time over all testcases, peak memory of any of them.
      timeMs: results.reduce((sum, r) => sum + r.timeMs, 0),
      memoryKb: results.reduce((peak, r) => Math.max(peak, r.memoryKb), 0),
      compileMessage: report.compileMessage,
      results,
    };
    try {
      const score = computeScore(found.problem.scoreMode, found.problem.scoreGroups, results);
      return { ...usage, verdict: overallVerdict(results), score };
    } catch (error) {
      if (!(error instanceof ScoreError)) throw error;
      return { ...usage, verdict: Verdict.SE, score: 0, compileMessage: `Score error: ${error.message}` };
    }
  }
}
