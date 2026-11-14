import { Injectable } from '@nestjs/common';
import type { Language } from '@skyoj/contract';
import { sha256 } from '../../common/crypto.js';
import { NotFoundError, UnauthorizedError } from '../../common/errors.js';
import type { JudgeTaskMessage, WriteCommand } from '../../messaging/commands.js';
import { MessageBroker, Queue } from '../../messaging/message-broker.js';
import { StorageService } from '../../storage/storage.service.js';
import { ProblemRepository } from '../problem/problem.repository.js';
import type { JudgeReport } from '../submission/judging.js';
import { SubmissionRepository, type SubmissionRow } from '../submission/submission.repository.js';
import { JudgeRepository, type JudgeRow } from './judge.repository.js';

/** Upper bound on outdated tasks skipped by one fetch. */
const MAX_SKIPPED_TASKS = 50;

/**
 * Server side of the judge-machine protocol: hands out queued submissions,
 * serves testdata and queues the judges' reports (which
 * `SubmissionResultService` turns into verdicts and scores).
 */
@Injectable()
export class JudgeService {
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
}
