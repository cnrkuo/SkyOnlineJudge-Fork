import { Inject, Injectable } from '@nestjs/common';
import { and, asc, between, count, desc, eq, inArray, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { Verdict } from '@skyoj/contract';
import type { Actor } from '../../common/actor.js';
import { offsetOf, type PageInput } from '../../common/pagination.js';
import { DB, type Database } from '../../database/database.module.js';
import { problems, submissions, users, type StoredTestResult } from '../../database/schema.js';
import { visibleTo } from '../problem/problem.repository.js';

export type SubmissionRow = typeof submissions.$inferSelect;

const summaryColumns = {
  id: submissions.id,
  problemId: submissions.problemId,
  problemTitle: problems.title,
  userId: submissions.userId,
  nickname: users.nickname,
  language: submissions.language,
  verdict: submissions.verdict,
  score: submissions.score,
  timeMs: submissions.timeMs,
  memoryKb: submissions.memoryKb,
  createdAt: submissions.createdAt,
};

export interface SubmissionFilter {
  problemId?: number;
  userId?: number;
  verdict?: number;
}

export interface JudgedResult {
  verdict: number;
  score: number;
  timeMs: number;
  memoryKb: number;
  compileMessage: string;
  results: StoredTestResult[];
}

/** Minimal projection consumed by the contest scoreboard. */
export interface ScoreboardSubmission {
  userId: number;
  problemId: number;
  verdict: number;
  score: number;
  createdAt: Date;
}

@Injectable()
export class SubmissionRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(data: Pick<SubmissionRow, 'problemId' | 'userId' | 'language' | 'code'>): Promise<number> {
    const [row] = await this.db.insert(submissions).values(data).returning({ id: submissions.id });
    return row!.id;
  }

  async findById(id: number): Promise<SubmissionRow | undefined> {
    const [row] = await this.db.select().from(submissions).where(eq(submissions.id, id));
    return row;
  }

  /**
   * Lists submissions the actor may see: their own, plus those of problems
   * whose statement is directly visible to them.
   */
  async list(actor: Actor, filter: SubmissionFilter, page: PageInput) {
    const where = and(
      filter.problemId ? eq(submissions.problemId, filter.problemId) : undefined,
      filter.userId ? eq(submissions.userId, filter.userId) : undefined,
      filter.verdict !== undefined ? eq(submissions.verdict, filter.verdict) : undefined,
      or(eq(submissions.userId, actor.id), this.problemVisibleTo(actor)),
    );
    const base = () =>
      this.db
        .select(summaryColumns)
        .from(submissions)
        .innerJoin(problems, eq(problems.id, submissions.problemId))
        .innerJoin(users, eq(users.id, submissions.userId));
    const [rows, [total]] = await Promise.all([
      base().where(where).orderBy(desc(submissions.id)).limit(page.pageSize).offset(offsetOf(page)),
      this.db
        .select({ n: count() })
        .from(submissions)
        .innerJoin(problems, eq(problems.id, submissions.problemId))
        .where(where),
    ]);
    return { rows, total: total?.n ?? 0 };
  }

  /** `visibleTo` needs the problem owner's level, which is not joined here. */
  private problemVisibleTo(actor: Actor): SQL {
    return sql`exists (select 1 from ${users} where ${users.id} = ${problems.ownerId} and ${visibleTo(actor)})`;
  }

  async findSummary(id: number) {
    const [row] = await this.db
      .select(summaryColumns)
      .from(submissions)
      .innerJoin(problems, eq(problems.id, submissions.problemId))
      .innerJoin(users, eq(users.id, submissions.userId))
      .where(eq(submissions.id, id));
    return row;
  }

  // -------------------------------------------------------------- judge queue

  /**
   * Claims the oldest waiting submission for a judge. Submissions stuck in
   * JUDGING since before `staleBefore` (their judge died) are claimable too.
   * `FOR UPDATE SKIP LOCKED` keeps concurrent judges from taking the same row.
   */
  async claimNext(judgeId: number, staleBefore: Date): Promise<SubmissionRow | undefined> {
    const next = this.db
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        or(
          eq(submissions.verdict, Verdict.WAIT),
          and(eq(submissions.verdict, Verdict.JUDGING), sql`${submissions.judgeStartedAt} < ${staleBefore}`),
        ),
      )
      .orderBy(asc(submissions.id))
      .limit(1)
      .for('update', { skipLocked: true });
    const [row] = await this.db
      .update(submissions)
      .set({ verdict: Verdict.JUDGING, judgeId, judgeStartedAt: new Date() })
      .where(eq(submissions.id, next))
      .returning();
    return row;
  }

  /** Stores a judge's result; a no-op unless that judge still holds the claim. */
  async saveResult(id: number, judgeId: number, result: JudgedResult): Promise<boolean> {
    const rows = await this.db
      .update(submissions)
      .set({ ...result, judgedAt: new Date() })
      .where(and(eq(submissions.id, id), eq(submissions.judgeId, judgeId), eq(submissions.verdict, Verdict.JUDGING)))
      .returning({ id: submissions.id });
    return rows.length > 0;
  }

  /** Puts submissions back into the queue. */
  async requeue(where: { id: number } | { problemId: number }): Promise<number> {
    const rows = await this.db
      .update(submissions)
      .set({
        verdict: Verdict.WAIT,
        score: 0,
        timeMs: 0,
        memoryKb: 0,
        compileMessage: '',
        results: [],
        judgeId: null,
        judgeStartedAt: null,
        judgedAt: null,
      })
      .where('id' in where ? eq(submissions.id, where.id) : eq(submissions.problemId, where.problemId))
      .returning({ id: submissions.id });
    return rows.length;
  }

  /** Stores the judges' comment and, optionally, a hand-picked verdict. */
  async review(id: number, comment: string, verdict?: number): Promise<void> {
    await this.db
      .update(submissions)
      .set(verdict === undefined ? { comment } : { comment, verdict, judgedAt: new Date() })
      .where(eq(submissions.id, id));
  }

  // --------------------------------------------------------------- statistics

  /** Per-problem totals for a page of the problem list. */
  async countersFor(problemIds: number[]): Promise<Map<number, { submissions: number; accepted: number; acceptedUsers: number }>> {
    const result = new Map<number, { submissions: number; accepted: number; acceptedUsers: number }>();
    if (problemIds.length === 0) return result;
    const rows = await this.db
      .select({
        problemId: submissions.problemId,
        submissions: count(),
        accepted: sql<number>`count(*) filter (where ${submissions.verdict} = ${Verdict.AC})`.mapWith(Number),
        acceptedUsers: sql<number>`count(distinct ${submissions.userId}) filter (where ${submissions.verdict} = ${Verdict.AC})`.mapWith(
          Number,
        ),
      })
      .from(submissions)
      .where(inArray(submissions.problemId, problemIds))
      .groupBy(submissions.problemId);
    for (const row of rows) result.set(row.problemId, row);
    return result;
  }

  /** The user's best finished verdict per problem (AC wins; otherwise any attempt). */
  async bestVerdicts(userId: number, problemIds?: number[]): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    if (userId === 0 || problemIds?.length === 0) return result;
    const rows = await this.db
      .select({ problemId: submissions.problemId, best: sql<number>`min(${submissions.verdict})`.mapWith(Number) })
      .from(submissions)
      .where(
        and(
          eq(submissions.userId, userId),
          notInArray(submissions.verdict, [Verdict.WAIT, Verdict.JUDGING]),
          problemIds ? inArray(submissions.problemId, problemIds) : undefined,
        ),
      )
      .groupBy(submissions.problemId);
    for (const row of rows) result.set(row.problemId, row.best);
    return result;
  }

  async totalsOfUser(userId: number): Promise<{ submissions: number; accepted: number }> {
    const [row] = await this.db
      .select({
        submissions: count(),
        accepted: sql<number>`count(*) filter (where ${submissions.verdict} = ${Verdict.AC})`.mapWith(Number),
      })
      .from(submissions)
      .where(eq(submissions.userId, userId));
    return row ?? { submissions: 0, accepted: 0 };
  }

  verdictHistogram(problemId: number) {
    return this.db
      .select({ verdict: submissions.verdict, count: count() })
      .from(submissions)
      .where(eq(submissions.problemId, problemId))
      .groupBy(submissions.verdict)
      .orderBy(submissions.verdict);
  }

  fastestAccepted(problemId: number, limit: number) {
    return this.db
      .select(summaryColumns)
      .from(submissions)
      .innerJoin(problems, eq(problems.id, submissions.problemId))
      .innerJoin(users, eq(users.id, submissions.userId))
      .where(and(eq(submissions.problemId, problemId), eq(submissions.verdict, Verdict.AC)))
      .orderBy(asc(submissions.timeMs), asc(submissions.memoryKb), asc(submissions.id))
      .limit(limit);
  }

  /** Submissions that count towards a contest, oldest first. */
  async forScoreboard(problemIds: number[], userIds: number[], from: Date, to: Date): Promise<ScoreboardSubmission[]> {
    if (problemIds.length === 0 || userIds.length === 0) return [];
    return this.db
      .select({
        userId: submissions.userId,
        problemId: submissions.problemId,
        verdict: submissions.verdict,
        score: submissions.score,
        createdAt: submissions.createdAt,
      })
      .from(submissions)
      .where(
        and(
          inArray(submissions.problemId, problemIds),
          inArray(submissions.userId, userIds),
          between(submissions.createdAt, from, to),
        ),
      )
      .orderBy(asc(submissions.id));
  }
}
