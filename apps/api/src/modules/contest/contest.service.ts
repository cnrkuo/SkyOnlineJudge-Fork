import { Injectable } from '@nestjs/common';
import {
  ContestPhase,
  ContestProblemState,
  type ContestStyle,
  PARTICIPATING_STATES,
  RegisterType,
  TeamState,
} from '@skyoj/contract';
import { type Actor, isAdmin, requireAdmin, requireUser } from '../../common/actor.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../common/errors.js';
import { type PageInput, pageOf } from '../../common/pagination.js';
import { ProblemRepository } from '../problem/problem.repository.js';
import { SubmissionRepository } from '../submission/submission.repository.js';
import { UserRepository } from '../user/user.repository.js';
import { type ContestProblemInput, ContestRepository, type ContestRow } from './contest.repository.js';
import { buildScoreboard } from './scoreboard.js';

export interface ContestInput {
  title: string;
  description: string;
  style: ContestStyle;
  startAt: string;
  endAt: string;
  registerType: RegisterType;
  registerPassword: string;
  freezeSec: number;
  penaltySec: number;
  problems: ContestProblemInput[];
}

const isParticipating = (state: number) => PARTICIPATING_STATES.includes(state as TeamState);

export function phaseOf(contest: Pick<ContestRow, 'startAt' | 'endAt'>, now: Date): ContestPhase {
  if (now < contest.startAt) return ContestPhase.PREPARING;
  return now < contest.endAt ? ContestPhase.RUNNING : ContestPhase.ENDED;
}

@Injectable()
export class ContestService {
  constructor(
    private readonly contests: ContestRepository,
    private readonly problems: ProblemRepository,
    private readonly submissions: SubmissionRepository,
    private readonly users: UserRepository,
  ) {}

  private async load(id: number) {
    const found = await this.contests.findById(id);
    if (!found) throw new NotFoundError('Contest');
    return found;
  }

  private summarize(contest: ContestRow, participants: number, now: Date) {
    return {
      id: contest.id,
      title: contest.title,
      style: contest.style as ContestStyle,
      startAt: contest.startAt.toISOString(),
      endAt: contest.endAt.toISOString(),
      phase: phaseOf(contest, now),
      registerType: contest.registerType as RegisterType,
      participants,
    };
  }

  async list(input: PageInput) {
    const now = new Date();
    const { rows, total } = await this.contests.list(input);
    return pageOf(
      rows.map((row) => this.summarize(row.contest, row.participants, now)),
      total,
      input,
    );
  }

  async get(actor: Actor, id: number) {
    const now = new Date();
    const { contest, owner } = await this.load(id);
    const [state, participants, problemRows] = await Promise.all([
      this.contests.stateOf(id, actor.id),
      this.contests.listParticipants(id),
      this.contests.listProblems(id),
    ]);
    const myState = (state ?? TeamState.NOT_REGISTERED) as TeamState;
    const canManage = isAdmin(actor);
    // Participants get in once the contest has started; managers always do.
    const canEnter = canManage || (isParticipating(myState) && phaseOf(contest, now) !== ContestPhase.PREPARING);

    return {
      ...this.summarize(contest, participants.filter((p) => isParticipating(p.state)).length, now),
      owner,
      description: contest.description,
      freezeSec: contest.freezeSec,
      penaltySec: contest.penaltySec,
      myState,
      canManage,
      canEnter,
      problems: canEnter
        ? problemRows
            .filter((p) => canManage || p.state !== ContestProblemState.HIDDEN)
            .map((p) => ({ ...p, state: p.state as ContestProblemState }))
        : [],
    };
  }

  async settings(actor: Actor, id: number) {
    requireAdmin(actor);
    const { contest } = await this.load(id);
    const problems = await this.contests.listProblems(id);
    return {
      id: contest.id,
      title: contest.title,
      description: contest.description,
      style: contest.style as ContestStyle,
      startAt: contest.startAt.toISOString(),
      endAt: contest.endAt.toISOString(),
      registerType: contest.registerType as RegisterType,
      registerPassword: contest.registerPassword,
      freezeSec: contest.freezeSec,
      penaltySec: contest.penaltySec,
      problems: problems.map(({ problemId, tag, state }) => ({ problemId, tag, state: state as ContestProblemState })),
    };
  }

  async create(actor: Actor, input: ContestInput): Promise<{ id: number }> {
    requireAdmin(actor);
    const { problems, startAt, endAt, ...fields } = input;
    const window = { startAt: new Date(startAt), endAt: new Date(endAt) };
    this.checkWindow(window.startAt, window.endAt);
    await this.checkProblems(problems);
    const id = await this.contests.create({ ...fields, ...window, ownerId: actor.id }, problems);
    return { id };
  }

  async update(actor: Actor, id: number, input: Partial<ContestInput>): Promise<void> {
    requireAdmin(actor);
    const { contest } = await this.load(id);
    const { problems, startAt, endAt, ...fields } = input;
    const window = {
      ...(startAt === undefined ? {} : { startAt: new Date(startAt) }),
      ...(endAt === undefined ? {} : { endAt: new Date(endAt) }),
    };
    this.checkWindow(window.startAt ?? contest.startAt, window.endAt ?? contest.endAt);
    if (problems) await this.checkProblems(problems);
    await this.contests.update(id, { ...fields, ...window }, problems);
  }

  private checkWindow(startAt: Date, endAt: Date): void {
    if (endAt <= startAt) throw new BadRequestError('The contest must end after it starts');
  }

  private async checkProblems(problems: ContestProblemInput[]): Promise<void> {
    if (new Set(problems.map((p) => p.problemId)).size !== problems.length) {
      throw new BadRequestError('A problem can only appear once in a contest');
    }
    if (new Set(problems.map((p) => p.tag)).size !== problems.length) {
      throw new BadRequestError('Problem tags must be unique within a contest');
    }
    for (const { problemId } of problems) {
      if (!(await this.problems.findById(problemId))) throw new BadRequestError(`Problem ${problemId} does not exist`);
    }
  }

  async register(actor: Actor, id: number, password?: string): Promise<{ state: TeamState }> {
    requireUser(actor);
    const { contest } = await this.load(id);
    if ((await this.contests.stateOf(id, actor.id)) !== undefined) {
      throw new ConflictError('You have already registered for this contest');
    }
    if (phaseOf(contest, new Date()) === ContestPhase.ENDED) throw new ForbiddenError('This contest has ended');

    let state: TeamState;
    switch (contest.registerType) {
      case RegisterType.OPEN:
        state = TeamState.ACCEPTED;
        break;
      case RegisterType.PERMIT_REQUIRED:
        state = TeamState.PENDING;
        break;
      case RegisterType.PASSWORD:
        if (password !== contest.registerPassword) throw new ForbiddenError('Wrong contest password');
        state = TeamState.ACCEPTED;
        break;
      default:
        throw new ForbiddenError('Registration is not open for this contest');
    }
    await this.contests.setParticipant(id, actor.id, state);
    return { state };
  }

  async participants(actor: Actor, id: number) {
    requireAdmin(actor);
    await this.load(id);
    const rows = await this.contests.listParticipants(id);
    return rows.map((row) => ({
      user: { id: row.userId, nickname: row.nickname },
      state: row.state as TeamState,
      note: row.note,
      registeredAt: row.createdAt.toISOString(),
    }));
  }

  /** Approves, rejects, hides or adds a participant. */
  async setParticipant(actor: Actor, id: number, userId: number, state: TeamState, note?: string): Promise<void> {
    requireAdmin(actor);
    await this.load(id);
    if (state === TeamState.NOT_REGISTERED) throw new BadRequestError('Invalid participant state');
    if (!(await this.users.findById(userId))) throw new NotFoundError('User');
    await this.contests.setParticipant(id, userId, state, note);
  }

  /**
   * Scoreboard rules, as in the legacy system:
   * - Public (guests included) from the moment the contest starts.
   * - Everyone except managers sees the frozen board: only submissions made
   *   before the last `freezeSec` seconds count. It stays frozen after the
   *   contest ends, so results can be revealed at a ceremony; publish the
   *   final standings by setting the freeze to 0.
   * - Managers always see everything.
   * - HIDDEN teams appear only to managers and to themselves.
   */
  async scoreboard(actor: Actor, id: number) {
    const now = new Date();
    const { contest } = await this.load(id);
    const canManage = isAdmin(actor);
    if (!canManage && phaseOf(contest, now) === ContestPhase.PREPARING) {
      throw new ForbiddenError('The scoreboard opens when the contest starts');
    }

    const freezeAt = new Date(Math.max(contest.startAt.getTime(), contest.endAt.getTime() - contest.freezeSec * 1000));
    const frozen = !canManage && contest.freezeSec > 0 && now >= freezeAt;

    const [problemRows, participantRows] = await Promise.all([
      this.contests.listProblems(id),
      this.contests.listParticipants(id),
    ]);
    const problems = problemRows.filter((p) => p.state !== ContestProblemState.HIDDEN);
    const users = participantRows
      .filter((p) => isParticipating(p.state))
      .filter((p) => p.state !== TeamState.HIDDEN || canManage || p.userId === actor.id)
      .map((p) => ({ id: p.userId, nickname: p.nickname, state: p.state }));
    const submissions = await this.submissions.forScoreboard(
      problems.map((p) => p.problemId),
      users.map((u) => u.id),
      contest.startAt,
      frozen ? freezeAt : contest.endAt,
    );

    const board = buildScoreboard(contest, problems, users, submissions);
    return {
      style: contest.style as ContestStyle,
      frozen,
      problems: board.problems.map(({ problemId, tag, attempts, accepted }) => ({
        problemId,
        tag,
        attempts,
        accepted,
      })),
      rows: board.rows.map(({ attemptsOnSolved: _, state, ...row }) => ({ ...row, state: state as TeamState })),
    };
  }
}
