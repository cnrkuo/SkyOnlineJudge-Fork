import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gt, ilike, or, type SQL, sql } from 'drizzle-orm';
import type { Actor } from '../../common/actor.js';
import { offsetOf, type PageInput } from '../../common/pagination.js';
import { type Database, DB } from '../../database/database.module.js';
import { attachments, problems, testcases, users } from '../../database/schema.js';

export type ProblemRow = typeof problems.$inferSelect;
export type ProblemPatch = Partial<Omit<ProblemRow, 'id' | 'ownerId' | 'createdAt'>>;
export type TestcaseRow = typeof testcases.$inferSelect;
export type NewTestcase = Omit<TestcaseRow, 'id' | 'problemId'>;
export type AttachmentRow = typeof attachments.$inferSelect;

export interface ProblemWithOwner {
  problem: ProblemRow;
  owner: { id: number; nickname: string; level: number };
}

/**
 * SQL form of `satisfies(actor, owner, problem.contentAccess)`; lets list
 * queries filter by visibility inside the database.
 */
export function visibleTo(actor: Actor): SQL {
  return or(
    eq(problems.ownerId, actor.id),
    gt(sql`${actor.level}`, users.level),
    gt(sql`${actor.level}`, problems.contentAccess),
  )!;
}

@Injectable()
export class ProblemRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(ownerId: number, data: Pick<ProblemRow, 'title' | 'contentAccess' | 'codeviewAccess'>): Promise<number> {
    const [row] = await this.db
      .insert(problems)
      .values({ ownerId, ...data })
      .returning({ id: problems.id });
    return row!.id;
  }

  async findById(id: number): Promise<ProblemWithOwner | undefined> {
    const [row] = await this.db
      .select({ problem: problems, owner: { id: users.id, nickname: users.nickname, level: users.level } })
      .from(problems)
      .innerJoin(users, eq(users.id, problems.ownerId))
      .where(eq(problems.id, id));
    return row;
  }

  async update(id: number, patch: ProblemPatch): Promise<void> {
    await this.db
      .update(problems)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(problems.id, id));
  }

  async listVisible(actor: Actor, page: PageInput, search?: string) {
    const where = and(visibleTo(actor), search ? ilike(problems.title, `%${search}%`) : undefined);
    const [rows, [total]] = await Promise.all([
      this.db
        .select({ id: problems.id, title: problems.title, contentAccess: problems.contentAccess })
        .from(problems)
        .innerJoin(users, eq(users.id, problems.ownerId))
        .where(where)
        .orderBy(asc(problems.id))
        .limit(page.pageSize)
        .offset(offsetOf(page)),
      this.db.select({ n: count() }).from(problems).innerJoin(users, eq(users.id, problems.ownerId)).where(where),
    ]);
    return { rows, total: total?.n ?? 0 };
  }

  // ---------------------------------------------------------------- testcases

  listTestcases(problemId: number): Promise<TestcaseRow[]> {
    return this.db.select().from(testcases).where(eq(testcases.problemId, problemId)).orderBy(asc(testcases.ordinal));
  }

  async countTestcases(problemId: number): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(testcases).where(eq(testcases.problemId, problemId));
    return row?.n ?? 0;
  }

  async findTestcase(id: number): Promise<TestcaseRow | undefined> {
    const [row] = await this.db.select().from(testcases).where(eq(testcases.id, id));
    return row;
  }

  /** Atomically swaps the whole testcase set of a problem. */
  async replaceTestcases(problemId: number, rows: NewTestcase[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(testcases).where(eq(testcases.problemId, problemId));
      if (rows.length > 0) {
        await tx.insert(testcases).values(rows.map((row) => ({ ...row, problemId })));
      }
      await tx.update(problems).set({ updatedAt: new Date() }).where(eq(problems.id, problemId));
    });
  }

  // -------------------------------------------------------------- attachments

  listAttachments(problemId: number): Promise<AttachmentRow[]> {
    return this.db.select().from(attachments).where(eq(attachments.problemId, problemId)).orderBy(attachments.name);
  }

  async upsertAttachment(problemId: number, name: string, size: number): Promise<void> {
    await this.db
      .insert(attachments)
      .values({ problemId, name, size })
      .onConflictDoUpdate({ target: [attachments.problemId, attachments.name], set: { size } });
  }

  async deleteAttachment(problemId: number, name: string): Promise<boolean> {
    const rows = await this.db
      .delete(attachments)
      .where(and(eq(attachments.problemId, problemId), eq(attachments.name, name)))
      .returning({ name: attachments.name });
    return rows.length > 0;
  }

  async hasAttachment(problemId: number, name: string): Promise<boolean> {
    const [row] = await this.db
      .select({ name: attachments.name })
      .from(attachments)
      .where(and(eq(attachments.problemId, problemId), eq(attachments.name, name)));
    return row !== undefined;
  }
}
