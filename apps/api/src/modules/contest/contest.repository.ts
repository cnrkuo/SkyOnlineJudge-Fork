import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import { ContestProblemState, PARTICIPATING_STATES } from '@skyoj/contract';
import { offsetOf, type PageInput } from '../../common/pagination.js';
import { DB, type Database } from '../../database/database.module.js';
import { contestProblems, contests, contestUsers, problems, users } from '../../database/schema.js';

export type ContestRow = typeof contests.$inferSelect;
export type NewContest = Omit<ContestRow, 'id' | 'createdAt'>;
export type ContestPatch = Partial<Omit<NewContest, 'ownerId'>>;
export interface ContestProblemInput {
  problemId: number;
  tag: string;
  state: number;
}

const participating = [...PARTICIPATING_STATES];

@Injectable()
export class ContestRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(page: PageInput) {
    const participants = sql<number>`(
      select count(*) from ${contestUsers}
      where ${contestUsers.contestId} = ${contests.id} and ${inArray(contestUsers.state, participating)}
    )`.mapWith(Number);
    const [rows, [total]] = await Promise.all([
      this.db
        .select({ contest: contests, participants })
        .from(contests)
        .orderBy(desc(contests.startAt), desc(contests.id))
        .limit(page.pageSize)
        .offset(offsetOf(page)),
      this.db.select({ n: count() }).from(contests),
    ]);
    return { rows, total: total?.n ?? 0 };
  }

  async findById(id: number) {
    const [row] = await this.db
      .select({ contest: contests, owner: { id: users.id, nickname: users.nickname } })
      .from(contests)
      .innerJoin(users, eq(users.id, contests.ownerId))
      .where(eq(contests.id, id));
    return row;
  }

  async create(data: NewContest, problemList: ContestProblemInput[]): Promise<number> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(contests).values(data).returning({ id: contests.id });
      const id = row!.id;
      if (problemList.length > 0) {
        await tx.insert(contestProblems).values(problemList.map((p, priority) => ({ ...p, contestId: id, priority })));
      }
      return id;
    });
  }

  async update(id: number, patch: ContestPatch, problemList?: ContestProblemInput[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (Object.keys(patch).length > 0) await tx.update(contests).set(patch).where(eq(contests.id, id));
      if (problemList) {
        await tx.delete(contestProblems).where(eq(contestProblems.contestId, id));
        if (problemList.length > 0) {
          await tx
            .insert(contestProblems)
            .values(problemList.map((p, priority) => ({ ...p, contestId: id, priority })));
        }
      }
    });
  }

  /** All problems of a contest in display order, including hidden ones. */
  listProblems(contestId: number) {
    return this.db
      .select({
        problemId: contestProblems.problemId,
        tag: contestProblems.tag,
        state: contestProblems.state,
        title: problems.title,
      })
      .from(contestProblems)
      .innerJoin(problems, eq(problems.id, contestProblems.problemId))
      .where(eq(contestProblems.contestId, contestId))
      .orderBy(asc(contestProblems.priority));
  }

  // -------------------------------------------------------------- participants

  async stateOf(contestId: number, userId: number): Promise<number | undefined> {
    if (userId === 0) return undefined;
    const [row] = await this.db
      .select({ state: contestUsers.state })
      .from(contestUsers)
      .where(and(eq(contestUsers.contestId, contestId), eq(contestUsers.userId, userId)));
    return row?.state;
  }

  async setParticipant(contestId: number, userId: number, state: number, note?: string): Promise<void> {
    await this.db
      .insert(contestUsers)
      .values({ contestId, userId, state, note: note ?? '' })
      .onConflictDoUpdate({
        target: [contestUsers.contestId, contestUsers.userId],
        set: note === undefined ? { state } : { state, note },
      });
  }

  listParticipants(contestId: number) {
    return this.db
      .select({
        userId: users.id,
        nickname: users.nickname,
        state: contestUsers.state,
        note: contestUsers.note,
        createdAt: contestUsers.createdAt,
      })
      .from(contestUsers)
      .innerJoin(users, eq(users.id, contestUsers.userId))
      .where(eq(contestUsers.contestId, contestId))
      .orderBy(asc(contestUsers.createdAt));
  }

  // ------------------------------------------------------ problem access grants

  /**
   * How a user's contest participation extends their access to a problem:
   * `read` once any contest containing it has started, `submit` while such a
   * contest is running and the problem is open for submissions there.
   */
  async grantsFor(userId: number, problemId: number, now: Date): Promise<{ read: boolean; submit: boolean }> {
    if (userId === 0) return { read: false, submit: false };
    const rows = await this.db
      .select({ endAt: contests.endAt, state: contestProblems.state })
      .from(contestProblems)
      .innerJoin(contests, eq(contests.id, contestProblems.contestId))
      .innerJoin(
        contestUsers,
        and(eq(contestUsers.contestId, contests.id), eq(contestUsers.userId, userId)),
      )
      .where(
        and(
          eq(contestProblems.problemId, problemId),
          ne(contestProblems.state, ContestProblemState.HIDDEN),
          inArray(contestUsers.state, participating),
          lte(contests.startAt, now),
        ),
      );
    return {
      read: rows.length > 0,
      submit: rows.some((row) => row.state === ContestProblemState.NORMAL && now < row.endAt),
    };
  }
}
