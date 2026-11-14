import { Injectable } from '@nestjs/common';
import { AccessLevel, type Language, type Verdict } from '@skyoj/contract';
import { type Actor, isAdmin, requireAdmin, requireUser, satisfies } from '../../common/actor.js';
import { ForbiddenError, NotFoundError } from '../../common/errors.js';
import { type PageInput, pageOf } from '../../common/pagination.js';
import type { JudgeTaskMessage, WriteCommand } from '../../messaging/commands.js';
import { MessageBroker, Queue } from '../../messaging/message-broker.js';
import { ProblemRepository } from '../problem/problem.repository.js';
import { ProblemService } from '../problem/problem.service.js';
import { type SubmissionFilter, SubmissionRepository } from './submission.repository.js';

type SummaryRow = NonNullable<Awaited<ReturnType<SubmissionRepository['findSummary']>>>;

function toSummary(row: SummaryRow) {
  return {
    id: row.id,
    problem: { id: row.problemId, title: row.problemTitle },
    user: { id: row.userId, nickname: row.nickname },
    language: row.language as Language,
    verdict: row.verdict as Verdict,
    score: row.score,
    timeMs: row.timeMs,
    memoryKb: row.memoryKb,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class SubmissionService {
  constructor(
    private readonly submissions: SubmissionRepository,
    private readonly problems: ProblemRepository,
    private readonly problemService: ProblemService,
    private readonly broker: MessageBroker,
  ) {}

  /** Accepts a submission; a judge machine picks it up asynchronously. */
  async create(actor: Actor, input: { problemId: number; language: Language; code: string }): Promise<{ id: number }> {
    requireUser(actor);
    const { canSubmit } = await this.problemService.access(actor, input.problemId);
    if (!canSubmit) throw new ForbiddenError('Submissions are closed for this problem');
    // Reserve the id, queue the insert, answer. The row appears as soon as
    // the write-queue consumer gets to it (normally within milliseconds).
    const id = await this.submissions.reserveId();
    await this.broker.publish(Queue.WRITES, {
      type: 'submission.create',
      id,
      userId: actor.id,
      createdAt: new Date().toISOString(),
      ...input,
    } satisfies WriteCommand);
    return { id };
  }

  async list(actor: Actor, input: PageInput & SubmissionFilter) {
    const { rows, total } = await this.submissions.list(actor, input, input);
    return pageOf(rows.map(toSummary), total, input);
  }

  async get(actor: Actor, id: number) {
    const [summary, row] = await Promise.all([this.submissions.findSummary(id), this.submissions.findById(id)]);
    if (!summary || !row) throw new NotFoundError('Submission');
    const found = await this.problems.findById(row.problemId);
    if (!found) throw new NotFoundError('Problem');

    const own = actor.id === row.userId;
    const admin = isAdmin(actor);
    if (!own && !admin && !satisfies(actor, found.owner, found.problem.contentAccess)) {
      throw new ForbiddenError('You may not view this submission');
    }
    const canReadCode = own || admin || found.problem.codeviewAccess === AccessLevel.OPEN;

    return {
      ...toSummary(summary),
      code: canReadCode ? row.code : null,
      compileMessage: own || admin ? row.compileMessage : '',
      comment: row.comment,
      results: row.results.map((result) => ({ ...result, verdict: result.verdict as Verdict })),
      judgedAt: row.judgedAt?.toISOString() ?? null,
      canRejudge: admin,
    };
  }

  async rejudge(actor: Actor, id: number): Promise<void> {
    requireAdmin(actor);
    const ids = await this.submissions.requeue({ id });
    if (ids.length === 0) throw new NotFoundError('Submission');
    await this.enqueue(ids);
  }

  async rejudgeProblem(actor: Actor, problemId: number): Promise<{ count: number }> {
    requireAdmin(actor);
    const ids = await this.submissions.requeue({ problemId });
    await this.enqueue(ids);
    return { count: ids.length };
  }

  private async enqueue(ids: number[]): Promise<void> {
    for (const submissionId of ids) {
      await this.broker.publish(Queue.JUDGE, { submissionId } satisfies JudgeTaskMessage);
    }
  }

  async setComment(actor: Actor, id: number, comment: string, verdict?: Verdict): Promise<void> {
    requireAdmin(actor);
    if (!(await this.submissions.findById(id))) throw new NotFoundError('Submission');
    await this.submissions.review(id, comment, verdict);
  }
}
