import { AccessLevel, Language, Verdict } from '@skyoj/contract';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../common/errors.js';
import type { MessageBroker } from '../../messaging/message-broker.js';
import { Queue } from '../../messaging/message-broker.js';
import { actor, admin, fake, guest, user } from '../../testing/fixtures.js';
import type { ContestRepository } from '../contest/contest.repository.js';
import type { ProblemRepository } from '../problem/problem.repository.js';
import type { ProblemService } from '../problem/problem.service.js';
import type { SubmissionFilter, SubmissionRepository } from './submission.repository.js';
import { SubmissionService } from './submission.service.js';

const owner = { id: admin.id, nickname: admin.nickname, level: admin.level };
const summary = {
  id: 5,
  problemId: 3,
  problemTitle: 'A + B',
  userId: user.id,
  nickname: user.nickname,
  language: Language.CPP,
  verdict: Verdict.AC,
  score: 100,
  timeMs: 1,
  memoryKb: 1,
  createdAt: new Date(0),
};
const row = {
  ...summary,
  code: 'int main(){}',
  compileMessage: 'warning: x',
  comment: '',
  results: [],
  judgedAt: null,
};

const contestStart = new Date('2026-12-01T00:00:00Z');
const contestEnd = new Date('2026-12-01T05:00:00Z');

/**
 * `readable`: whether the viewer may read the problem, as ProblemService
 * decides it (the owner's rules, or a contest the viewer takes part in).
 */
function service(
  problem: { contentAccess: number; codeviewAccess: number },
  canSubmit = true,
  readable = problem.contentAccess === AccessLevel.OPEN,
) {
  const published: [string, unknown][] = [];
  const filters: SubmissionFilter[] = [];
  const submissions = new SubmissionService(
    fake<SubmissionRepository>({
      findSummary: async () => summary,
      findById: async () => row,
      reserveId: async () => 77,
      requeue: async () => [5, 6],
      list: async (_actor: unknown, filter: SubmissionFilter) => {
        filters.push(filter);
        return { rows: [summary], total: 1 };
      },
    }),
    fake<ProblemRepository>({ findById: async () => ({ problem, owner }) }),
    fake<ProblemService>({
      access: async () => {
        if (!readable) throw new ForbiddenError('You may not view this problem');
        return { canSubmit };
      },
    }),
    fake<ContestRepository>({
      findById: async (id: number) =>
        id === 9 ? { contest: { startAt: contestStart, endAt: contestEnd } } : undefined,
      listProblems: async () => [{ problemId: 3 }, { problemId: 4 }],
    }),
    fake<MessageBroker>({ publish: async (queue: string, message: unknown) => void published.push([queue, message]) }),
  );
  return { submissions, published, filters };
}
const publicCode = { contentAccess: AccessLevel.OPEN, codeviewAccess: AccessLevel.OPEN };
const privateCode = { contentAccess: AccessLevel.OPEN, codeviewAccess: AccessLevel.HIDDEN };

describe('SubmissionService.create', () => {
  it('reserves an id and queues the insert instead of writing it', async () => {
    const { submissions, published } = service(publicCode);
    await expect(
      submissions.create(user, { problemId: 3, language: Language.PYTHON3, code: 'print(1)' }),
    ).resolves.toEqual({ id: 77 });
    expect(published).toEqual([
      [
        Queue.WRITES,
        expect.objectContaining({ type: 'submission.create', id: 77, userId: user.id, language: Language.PYTHON3 }),
      ],
    ]);
  });

  it('needs a user account and an open problem', async () => {
    const input = { problemId: 3, language: Language.C, code: 'x' };
    await expect(service(publicCode).submissions.create(guest, input)).rejects.toThrow(UnauthorizedError);
    await expect(service(publicCode, false).submissions.create(user, input)).rejects.toThrow(ForbiddenError);
  });
});

describe('SubmissionService.get', () => {
  const stranger = actor(30);

  it('shows the author everything', async () => {
    const own = await service(privateCode).submissions.get(user, 5);
    expect(own).toMatchObject({ code: row.code, compileMessage: row.compileMessage, canRejudge: false });
  });

  it('shows others the code only when the problem publishes it, never the compiler output', async () => {
    expect(await service(privateCode).submissions.get(stranger, 5)).toMatchObject({ code: null, compileMessage: '' });
    expect(await service(publicCode).submissions.get(stranger, 5)).toMatchObject({
      code: row.code,
      compileMessage: '',
    });
  });

  it('hides submissions to problems the viewer may not see', async () => {
    const hidden = { contentAccess: AccessLevel.HIDDEN, codeviewAccess: AccessLevel.OPEN };
    await expect(service(hidden).submissions.get(stranger, 5)).rejects.toThrow('You may not view this submission');
    await expect(service(hidden).submissions.get(admin, 5)).resolves.toMatchObject({ canRejudge: true });
  });

  it("shows contest participants each other's results (the scoreboard links them), but not the code", async () => {
    const contestOnly = { contentAccess: AccessLevel.HIDDEN, codeviewAccess: AccessLevel.HIDDEN };
    const seen = await service(contestOnly, true, true).submissions.get(stranger, 5);
    expect(seen).toMatchObject({ verdict: summary.verdict, code: null, compileMessage: '' });
  });
});

describe('SubmissionService.rejudgeProblem', () => {
  it('queues every reset submission for the judges', async () => {
    const { submissions, published } = service(publicCode);
    await expect(submissions.rejudgeProblem(admin, 3)).resolves.toEqual({ count: 2 });
    expect(published).toEqual([
      [Queue.JUDGE, { submissionId: 5 }],
      [Queue.JUDGE, { submissionId: 6 }],
    ]);
    await expect(submissions.rejudgeProblem(user, 3)).rejects.toThrow(ForbiddenError);
  });
});

describe('SubmissionService.list', () => {
  it('narrows to a contest: its problems, while it ran — like its scoreboard', async () => {
    const { submissions, filters } = service(publicCode);
    await submissions.list(user, { page: 1, pageSize: 20, userId: user.id, contestId: 9 });
    expect(filters).toEqual([{ userId: user.id, within: { problemIds: [3, 4], from: contestStart, to: contestEnd } }]);
  });

  it('lists without a contest filter as before, and reports an unknown contest', async () => {
    const { submissions, filters } = service(publicCode);
    await submissions.list(user, { page: 1, pageSize: 20, problemId: 3 });
    expect(filters).toEqual([{ problemId: 3, within: undefined }]);
    await expect(submissions.list(user, { page: 1, pageSize: 20, contestId: 404 })).rejects.toThrow(NotFoundError);
  });
});
