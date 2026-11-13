import { Inject, Injectable } from '@nestjs/common';
import { Verdict } from '@skyoj/contract';
import { and, asc, between, count, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { offsetOf, type PageInput } from '../../common/pagination.js';
import { type Database, DB } from '../../database/database.module.js';
import { boardProblems, boards, boardUsers, problems, submissions, users } from '../../database/schema.js';

export type BoardRow = typeof boards.$inferSelect;
export type NewBoard = Omit<BoardRow, 'id' | 'createdAt'>;
export type BoardPatch = Partial<Omit<NewBoard, 'ownerId'>>;
export interface BoardMembers {
  userIds?: number[];
  problems?: { problemId: number; note: string }[];
}

@Injectable()
export class BoardRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(page: PageInput) {
    const userCount =
      sql<number>`(select count(*) from ${boardUsers} where ${boardUsers.boardId} = ${boards.id})`.mapWith(Number);
    const problemCount =
      sql<number>`(select count(*) from ${boardProblems} where ${boardProblems.boardId} = ${boards.id})`.mapWith(
        Number,
      );
    const [rows, [total]] = await Promise.all([
      this.db
        .select({ board: boards, users: userCount, problems: problemCount })
        .from(boards)
        .orderBy(desc(boards.id))
        .limit(page.pageSize)
        .offset(offsetOf(page)),
      this.db.select({ n: count() }).from(boards),
    ]);
    return { rows, total: total?.n ?? 0 };
  }

  async findById(id: number) {
    const [row] = await this.db
      .select({ board: boards, owner: { id: users.id, nickname: users.nickname } })
      .from(boards)
      .innerJoin(users, eq(users.id, boards.ownerId))
      .where(eq(boards.id, id));
    return row;
  }

  async create(data: NewBoard, members: BoardMembers): Promise<number> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(boards).values(data).returning({ id: boards.id });
      await this.writeMembers(tx, row!.id, members);
      return row!.id;
    });
  }

  async update(id: number, patch: BoardPatch, members: BoardMembers): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (Object.keys(patch).length > 0) await tx.update(boards).set(patch).where(eq(boards.id, id));
      await this.writeMembers(tx, id, members);
    });
  }

  private async writeMembers(
    tx: Pick<Database, 'insert' | 'delete'>,
    boardId: number,
    { userIds, problems: problemList }: BoardMembers,
  ): Promise<void> {
    if (userIds) {
      await tx.delete(boardUsers).where(eq(boardUsers.boardId, boardId));
      if (userIds.length > 0) await tx.insert(boardUsers).values(userIds.map((userId) => ({ boardId, userId })));
    }
    if (problemList) {
      await tx.delete(boardProblems).where(eq(boardProblems.boardId, boardId));
      if (problemList.length > 0) {
        await tx.insert(boardProblems).values(problemList.map((p, ordinal) => ({ ...p, boardId, ordinal })));
      }
    }
  }

  async addUser(boardId: number, userId: number): Promise<void> {
    await this.db.insert(boardUsers).values({ boardId, userId }).onConflictDoNothing();
  }

  listUsers(boardId: number) {
    return this.db
      .select({ id: users.id, nickname: users.nickname })
      .from(boardUsers)
      .innerJoin(users, eq(users.id, boardUsers.userId))
      .where(eq(boardUsers.boardId, boardId))
      .orderBy(asc(users.id));
  }

  listProblems(boardId: number) {
    return this.db
      .select({ problemId: boardProblems.problemId, note: boardProblems.note, title: problems.title })
      .from(boardProblems)
      .innerJoin(problems, eq(problems.id, boardProblems.problemId))
      .where(eq(boardProblems.boardId, boardId))
      .orderBy(asc(boardProblems.ordinal));
  }

  /**
   * Each member's standing on each problem inside the board's time window:
   * their best score and best (numerically smallest) finished verdict.
   */
  async results(userIds: number[], problemIds: number[], from: Date, to: Date) {
    if (userIds.length === 0 || problemIds.length === 0) return [];
    return this.db
      .select({
        userId: submissions.userId,
        problemId: submissions.problemId,
        score: sql<number>`max(${submissions.score})`.mapWith(Number),
        verdict: sql<number>`min(${submissions.verdict})`.mapWith(Number),
      })
      .from(submissions)
      .where(
        and(
          inArray(submissions.userId, userIds),
          inArray(submissions.problemId, problemIds),
          between(submissions.createdAt, from, to),
          notInArray(submissions.verdict, [Verdict.WAIT, Verdict.JUDGING]),
        ),
      )
      .groupBy(submissions.userId, submissions.problemId);
  }
}
