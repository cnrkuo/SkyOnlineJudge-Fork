import { ContestProblemState, ContestStyle, RegisterType, TeamState } from '@skyoj/contract';
import { describe, expect, it } from 'vitest';
import { BadRequestError, ConflictError, ForbiddenError, UnauthorizedError } from '../../common/errors.js';
import { admin, fake, guest, minutesFrom, user } from '../../testing/fixtures.js';
import type { ProblemRepository } from '../problem/problem.repository.js';
import type { SubmissionRepository } from '../submission/submission.repository.js';
import type { UserRepository } from '../user/user.repository.js';
import type { ContestRepository } from './contest.repository.js';
import { ContestService } from './contest.service.js';

const now = new Date();
const contestRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  title: 'Weekly',
  style: ContestStyle.ICPC,
  startAt: minutesFrom(now, -60),
  endAt: minutesFrom(now, 60),
  registerType: RegisterType.OPEN,
  registerPassword: 'swordfish',
  freezeSec: 0,
  penaltySec: 1200,
  ...overrides,
});

function service(contest = contestRow(), repo: Partial<Record<keyof ContestRepository, unknown>> = {}, extra = {}) {
  const calls: { setParticipant: unknown[][]; create: unknown[][]; forScoreboard: unknown[][] } = {
    setParticipant: [],
    create: [],
    forScoreboard: [],
  };
  const contests = fake<ContestRepository>({
    findById: async () => ({ contest, owner: { id: admin.id, nickname: admin.nickname } }),
    stateOf: async () => undefined,
    setParticipant: async (...args: unknown[]) => void calls.setParticipant.push(args),
    create: async (...args: unknown[]) => {
      calls.create.push(args);
      return 9;
    },
    ...repo,
  });
  const submissions = fake<SubmissionRepository>({
    forScoreboard: async (...args: unknown[]) => {
      calls.forScoreboard.push(args);
      return [];
    },
  });
  const problems = fake<ProblemRepository>({ missingIds: async (ids: number[]) => ids.filter((id) => id > 100) });
  return { service: new ContestService(contests, problems, submissions, fake<UserRepository>(extra)), calls };
}

describe('ContestService.register', () => {
  it('accepts open registration immediately', async () => {
    const { service: contests, calls } = service();
    await expect(contests.register(user, 1)).resolves.toEqual({ state: TeamState.ACCEPTED });
    expect(calls.setParticipant).toEqual([[1, user.id, TeamState.ACCEPTED]]);
  });

  it('leaves approval-based registration pending', async () => {
    const { service: contests } = service(contestRow({ registerType: RegisterType.PERMIT_REQUIRED }));
    await expect(contests.register(user, 1)).resolves.toEqual({ state: TeamState.PENDING });
  });

  it('checks the contest password', async () => {
    const { service: contests } = service(contestRow({ registerType: RegisterType.PASSWORD }));
    await expect(contests.register(user, 1, 'guess')).rejects.toThrow(ForbiddenError);
    await expect(contests.register(user, 1, 'swordfish')).resolves.toEqual({ state: TeamState.ACCEPTED });
  });

  it('refuses closed and finished contests, repeat registrations and guests', async () => {
    await expect(service(contestRow({ registerType: RegisterType.CLOSED })).service.register(user, 1)).rejects.toThrow(
      ForbiddenError,
    );
    const ended = contestRow({ startAt: minutesFrom(now, -120), endAt: minutesFrom(now, -60) });
    await expect(service(ended).service.register(user, 1)).rejects.toThrow(ForbiddenError);
    const again = service(contestRow(), { stateOf: async () => TeamState.PENDING }).service;
    await expect(again.register(user, 1)).rejects.toThrow(ConflictError);
    await expect(service().service.register(guest, 1)).rejects.toThrow(UnauthorizedError);
  });
});

describe('ContestService.create', () => {
  const input = {
    title: 'Cup',
    description: '',
    style: ContestStyle.IOI,
    startAt: '2026-06-01T08:00:00Z',
    endAt: '2026-06-01T13:00:00Z',
    registerType: RegisterType.OPEN,
    registerPassword: '',
    freezeSec: 0,
    penaltySec: 0,
    problems: [
      { problemId: 1, tag: 'A', state: ContestProblemState.NORMAL },
      { problemId: 2, tag: 'B', state: ContestProblemState.NORMAL },
    ],
  };

  it('stores the window as dates and the creator as owner', async () => {
    const { service: contests, calls } = service();
    await expect(contests.create(admin, input)).resolves.toEqual({ id: 9 });
    expect(calls.create[0]?.[0]).toMatchObject({
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      ownerId: admin.id,
    });
  });

  it('validates the window and the problem list', async () => {
    const contests = service().service;
    await expect(contests.create(admin, { ...input, endAt: input.startAt })).rejects.toThrow(BadRequestError);
    const twice = [...input.problems, { problemId: 1, tag: 'C', state: ContestProblemState.NORMAL }];
    await expect(contests.create(admin, { ...input, problems: twice })).rejects.toThrow(/only appear once/);
    const sameTag = [...input.problems, { problemId: 3, tag: 'A', state: ContestProblemState.NORMAL }];
    await expect(contests.create(admin, { ...input, problems: sameTag })).rejects.toThrow(/tags must be unique/);
    const unknown = [...input.problems, { problemId: 404, tag: 'C', state: ContestProblemState.NORMAL }];
    await expect(contests.create(admin, { ...input, problems: unknown })).rejects.toThrow(/Problem 404 does not exist/);
  });

  it('is for administrators only', async () => {
    await expect(service().service.create(user, input)).rejects.toThrow(ForbiddenError);
  });
});

describe('ContestService.scoreboard', () => {
  const problems = [
    { problemId: 1, tag: 'A', state: ContestProblemState.NORMAL, title: 'A' },
    { problemId: 2, tag: 'B', state: ContestProblemState.HIDDEN, title: 'B' },
  ];
  const participants = [
    { userId: user.id, nickname: 'me', state: TeamState.ACCEPTED, note: '', createdAt: now },
    { userId: 20, nickname: 'hidden team', state: TeamState.HIDDEN, note: '', createdAt: now },
    { userId: 21, nickname: 'pending', state: TeamState.PENDING, note: '', createdAt: now },
  ];
  const boardOf = (contest = contestRow()) =>
    service(contest, { listProblems: async () => problems, listParticipants: async () => participants });

  it('opens when the contest starts, earlier only for administrators', async () => {
    const upcoming = contestRow({ startAt: minutesFrom(now, 30), endAt: minutesFrom(now, 90) });
    await expect(boardOf(upcoming).service.scoreboard(user, 1)).rejects.toThrow(ForbiddenError);
    await expect(boardOf(upcoming).service.scoreboard(admin, 1)).resolves.toBeDefined();
  });

  it('lists visible problems and participating teams; hidden teams only for managers', async () => {
    const forUser = await boardOf().service.scoreboard(user, 1);
    expect(forUser.problems.map((p) => p.tag)).toEqual(['A']);
    expect(forUser.rows.map((r) => r.user.nickname)).toEqual(['me']);
    const forAdmin = await boardOf().service.scoreboard(admin, 1);
    expect(forAdmin.rows.map((r) => r.user.nickname).sort()).toEqual(['hidden team', 'me']);
  });

  it('freezes the board for everyone but managers during the last freezeSec seconds', async () => {
    const contest = contestRow({ freezeSec: 2 * 3600 });
    const frozen = boardOf(contest);
    expect((await frozen.service.scoreboard(user, 1)).frozen).toBe(true);
    // Only submissions before the freeze count.
    expect(frozen.calls.forScoreboard[0]?.[3]).toEqual(contest.startAt);

    const managed = boardOf(contest);
    expect((await managed.service.scoreboard(admin, 1)).frozen).toBe(false);
    expect(managed.calls.forScoreboard[0]?.[3]).toEqual(contest.endAt);
  });
});
