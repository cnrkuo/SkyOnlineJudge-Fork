import { Injectable } from '@nestjs/common';
import { Verdict } from '@skyoj/contract';
import { type Actor, isAdmin, isUser, requireAdmin, requireUser } from '../../common/actor.js';
import { hasDuplicates } from '../../common/collections.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../common/errors.js';
import { type PageInput, pageOf } from '../../common/pagination.js';
import { resolveWindow, type TimeWindow } from '../../common/time-window.js';
import { ProblemRepository } from '../problem/problem.repository.js';
import { UserRepository } from '../user/user.repository.js';
import { BoardRepository } from './board.repository.js';

export interface BoardInput {
  title: string;
  announce: string;
  startAt: string;
  endAt: string;
  allowJoin: boolean;
  userIds: number[];
  problems: { problemId: number; note: string }[];
}

/** Unlike a contest, a scoreboard may start and end at the same moment. */
function checkWindow({ startAt, endAt }: TimeWindow): void {
  if (endAt < startAt) throw new BadRequestError('The end must not be before the start');
}

/**
 * Training scoreboards (the legacy "rank" pages): how a group of users is
 * doing on a set of problems between two dates. Unlike a contest there is no
 * registration flow or penalty — just best score and verdict per problem.
 */
@Injectable()
export class BoardService {
  constructor(
    private readonly boards: BoardRepository,
    private readonly problems: ProblemRepository,
    private readonly users: UserRepository,
  ) {}

  async list(input: PageInput) {
    const { rows, total } = await this.boards.list(input);
    const items = rows.map(({ board, users, problems }) => ({
      id: board.id,
      title: board.title,
      startAt: board.startAt.toISOString(),
      endAt: board.endAt.toISOString(),
      users,
      problems,
    }));
    return pageOf(items, total, input);
  }

  async get(actor: Actor, id: number) {
    const found = await this.boards.findById(id);
    if (!found) throw new NotFoundError('Scoreboard');
    const { board, owner } = found;
    const [members, problems] = await Promise.all([this.boards.listUsers(id), this.boards.listProblems(id)]);
    const results = await this.boards.results(
      members.map((u) => u.id),
      problems.map((p) => p.problemId),
      board.startAt,
      board.endAt,
    );
    const cellOf = new Map(results.map((r) => [`${r.userId}:${r.problemId}`, r]));

    const rows = members.map((user) => {
      const cells = problems.map((problem) => {
        const result = cellOf.get(`${user.id}:${problem.problemId}`);
        return { verdict: (result?.verdict ?? null) as Verdict | null, score: result?.score ?? 0 };
      });
      return {
        user,
        cells,
        score: cells.reduce((sum, cell) => sum + cell.score, 0),
        accepted: cells.filter((cell) => cell.verdict === Verdict.AC).length,
      };
    });
    rows.sort((a, b) => b.score - a.score || b.accepted - a.accepted || a.user.id - b.user.id);

    return {
      id: board.id,
      title: board.title,
      startAt: board.startAt.toISOString(),
      endAt: board.endAt.toISOString(),
      owner,
      announce: board.announce,
      allowJoin: board.allowJoin,
      canManage: isAdmin(actor),
      canJoin: isUser(actor) && board.allowJoin && !members.some((u) => u.id === actor.id),
      problems,
      rows,
    };
  }

  async create(actor: Actor, input: BoardInput): Promise<{ id: number }> {
    requireAdmin(actor);
    const { userIds, problems, startAt, endAt, ...fields } = input;
    const { window } = resolveWindow({ startAt, endAt });
    checkWindow(window);
    await this.checkMembers(userIds, problems);
    const id = await this.boards.create({ ...fields, ...window, ownerId: actor.id }, { userIds, problems });
    return { id };
  }

  async update(actor: Actor, id: number, input: Partial<BoardInput>): Promise<void> {
    requireAdmin(actor);
    const found = await this.boards.findById(id);
    if (!found) throw new NotFoundError('Scoreboard');
    const { userIds, problems, startAt, endAt, ...fields } = input;
    const { patch, window } = resolveWindow({ startAt, endAt }, found.board);
    checkWindow(window);
    await this.checkMembers(userIds ?? [], problems ?? []);
    await this.boards.update(id, { ...fields, ...patch }, { userIds, problems });
  }

  private async checkMembers(userIds: number[], problems: { problemId: number }[]): Promise<void> {
    if (hasDuplicates(userIds)) throw new BadRequestError('A user is listed twice');
    if (hasDuplicates(problems.map((p) => p.problemId))) throw new BadRequestError('A problem is listed twice');
    const known = new Set((await this.users.findByIds(userIds)).map((user) => user.id));
    const missingUser = userIds.find((id) => !known.has(id));
    if (missingUser !== undefined) throw new BadRequestError(`User ${missingUser} does not exist`);
    const [missingProblem] = await this.problems.missingIds(problems.map((p) => p.problemId));
    if (missingProblem !== undefined) throw new BadRequestError(`Problem ${missingProblem} does not exist`);
  }

  async join(actor: Actor, id: number): Promise<void> {
    requireUser(actor);
    const found = await this.boards.findById(id);
    if (!found) throw new NotFoundError('Scoreboard');
    if (!found.board.allowJoin) throw new ForbiddenError('This scoreboard does not accept new members');
    await this.boards.addUser(id, actor.id);
  }
}
