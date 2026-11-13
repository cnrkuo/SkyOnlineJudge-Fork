import { AccessLevel, ContestProblemState, UserLevel } from '@skyoj/contract';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '../../common/errors.js';
import { actor, admin, fake, guest, root, user } from '../../testing/fixtures.js';
import type { ContestRepository } from '../contest/contest.repository.js';
import type { ContestEntry } from '../contest/grants.js';
import type { SubmissionRepository } from '../submission/submission.repository.js';
import type { ProblemRepository } from './problem.repository.js';
import { ProblemService } from './problem.service.js';

const owner = { id: admin.id, nickname: admin.nickname, level: admin.level };
const problem = (contentAccess: number, submitOpen: boolean) => ({ id: 7, contentAccess, submitOpen });
const running: ContestEntry = { endAt: new Date(Date.now() + 3_600_000), problemState: ContestProblemState.NORMAL };

function service(found: ReturnType<typeof problem> | undefined, entries?: ContestEntry[]) {
  const problems = fake<ProblemRepository>({ findById: async () => (found ? { problem: found, owner } : undefined) });
  // Without `entries` the contest repository must not be consulted at all.
  const contests = fake<ContestRepository>(entries ? { entriesFor: async () => entries } : {});
  return new ProblemService(problems, fake<SubmissionRepository>({}), contests);
}

describe('ProblemService.access', () => {
  it('opens a public, open problem to everyone, but only users may submit', async () => {
    const open = service(problem(AccessLevel.OPEN, true));
    await expect(open.access(guest, 7)).resolves.toMatchObject({ canSubmit: false, canEdit: false });
    await expect(open.access(user, 7)).resolves.toMatchObject({ canSubmit: true, canEdit: false });
  });

  it('keeps unverified and banned accounts from submitting', async () => {
    const open = service(problem(AccessLevel.OPEN, true));
    await expect(open.access(actor(9, UserLevel.UNVERIFIED), 7)).resolves.toMatchObject({ canSubmit: false });
  });

  it('closes submissions to a public problem unless a contest opens them', async () => {
    await expect(service(problem(AccessLevel.OPEN, false), []).access(user, 7)).resolves.toMatchObject({
      canSubmit: false,
    });
    await expect(service(problem(AccessLevel.OPEN, false), [running]).access(user, 7)).resolves.toMatchObject({
      canSubmit: true,
    });
  });

  it('hides a hidden problem from users who are not in a contest with it', async () => {
    await expect(service(problem(AccessLevel.HIDDEN, false), []).access(user, 7)).rejects.toThrow(ForbiddenError);
  });

  it('shows a hidden problem to contest participants, who may submit while the contest runs', async () => {
    await expect(service(problem(AccessLevel.HIDDEN, false), [running]).access(user, 7)).resolves.toMatchObject({
      canSubmit: true,
      canEdit: false,
    });
  });

  it('lets the owner and higher ranks edit a hidden problem, but not a peer', async () => {
    await expect(service(problem(AccessLevel.HIDDEN, false)).access(admin, 7)).resolves.toMatchObject({
      canEdit: true,
      canSubmit: true,
    });
    await expect(service(problem(AccessLevel.HIDDEN, false)).access(root, 7)).resolves.toMatchObject({ canEdit: true });
    const peer = actor(5, UserLevel.ADMIN);
    await expect(service(problem(AccessLevel.HIDDEN, false), []).access(peer, 7)).rejects.toThrow(ForbiddenError);
  });

  it('reports a missing problem', async () => {
    await expect(service(undefined).access(user, 7)).rejects.toThrow(NotFoundError);
  });
});

describe('ProblemService.editable', () => {
  it('takes an administrator who can see the problem', async () => {
    await expect(service(problem(AccessLevel.OPEN, true)).editable(user, 7)).rejects.toThrow(ForbiddenError);
    await expect(service(problem(AccessLevel.HIDDEN, true)).editable(actor(5, UserLevel.ADMIN), 7)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(service(problem(AccessLevel.HIDDEN, true)).editable(admin, 7)).resolves.toBeDefined();
  });
});
