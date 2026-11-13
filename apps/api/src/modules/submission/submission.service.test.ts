import { AccessLevel, Language, Verdict } from '@skyoj/contract';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, UnauthorizedError } from '../../common/errors.js';
import type { MessageBroker } from '../../messaging/message-broker.js';
import { Queue } from '../../messaging/message-broker.js';
import { actor, admin, fake, guest, user } from '../../testing/fixtures.js';
import type { ProblemRepository } from '../problem/problem.repository.js';
import type { ProblemService } from '../problem/problem.service.js';
import type { SubmissionRepository } from './submission.repository.js';
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

function service(problem: { contentAccess: number; codeviewAccess: number }, canSubmit = true) {
  const published: [string, unknown][] = [];
  const submissions = new SubmissionService(
    fake<SubmissionRepository>({
      findSummary: async () => summary,
      findById: async () => row,
      reserveId: async () => 77,
      requeue: async () => [5, 6],
    }),
    fake<ProblemRepository>({ findById: async () => ({ problem, owner }) }),
    fake<ProblemService>({ access: async () => ({ canSubmit }) }),
    fake<MessageBroker>({ publish: async (queue: string, message: unknown) => void published.push([queue, message]) }),
  );
  return { submissions, published };
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
    await expect(service(hidden).submissions.get(stranger, 5)).rejects.toThrow(ForbiddenError);
    await expect(service(hidden).submissions.get(admin, 5)).resolves.toMatchObject({ canRejudge: true });
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
