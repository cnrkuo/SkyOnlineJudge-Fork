import { Verdict } from '@skyoj/contract';
import { describe, expect, it } from 'vitest';
import { hashPassword } from '../../common/crypto.js';
import { ConflictError, ForbiddenError, UnauthorizedError } from '../../common/errors.js';
import { fake, guest, user } from '../../testing/fixtures.js';
import type { SubmissionRepository } from '../submission/submission.repository.js';
import type { UserPatch, UserRepository } from './user.repository.js';
import { UserService } from './user.service.js';

const stored = {
  id: user.id,
  nickname: user.nickname,
  email: ' User1@Example.com ',
  level: user.level,
  realname: null,
  introduction: '> Stay hungry.\n>\n> — Steve Jobs',
  avatarUrl: null,
  passwordHash: '',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function service(users: Partial<Record<keyof UserRepository, unknown>> = {}) {
  const patches: UserPatch[] = [];
  const users_ = fake<UserRepository>({
    findById: async () => stored,
    update: async (_id: number, patch: UserPatch) => {
      patches.push(patch);
      return { ...stored, ...patch };
    },
    nicknameTaken: async () => false,
    ...users,
  });
  const submissions = fake<SubmissionRepository>({
    totalsOfUser: async () => ({ submissions: 3, accepted: 1 }),
    bestVerdicts: async () =>
      new Map([
        [7, Verdict.AC],
        [2, Verdict.WA],
        [3, Verdict.AC],
      ]),
  });
  return { service: new UserService(users_, submissions), patches };
}

describe('UserService.getProfile', () => {
  it('shows the self-introduction as written and the solved and tried problems in order', async () => {
    const profile = await service().service.getProfile(user.id);
    expect(profile.introduction).toBe(stored.introduction);
    expect(profile.stats).toEqual({ submissions: 3, accepted: 1, solvedProblemIds: [3, 7], triedProblemIds: [2] });
  });

  it("falls back to the e-mail's Gravatar without an avatar", async () => {
    const { avatarUrl } = await service().service.getProfile(user.id);
    // md5 of the trimmed, lower-cased address
    expect(avatarUrl).toMatch(/^https:\/\/www\.gravatar\.com\/avatar\/[0-9a-f]{32}\?d=identicon&s=200$/);
  });
});

describe('UserService.updateProfile', () => {
  it('saves the self-introduction', async () => {
    const { service: users, patches } = service();
    await users.updateProfile(user, { introduction: 'I like graphs.' });
    expect(patches).toEqual([{ introduction: 'I like graphs.' }]);
  });

  it('refuses a nickname someone else uses, and guests', async () => {
    const taken = service({ nicknameTaken: async () => true }).service;
    await expect(taken.updateProfile(user, { nickname: 'someone' })).rejects.toThrow(ConflictError);
    await expect(service().service.updateProfile(guest, { introduction: 'x' })).rejects.toThrow(UnauthorizedError);
  });
});

describe('UserService.changePassword', () => {
  it('needs the old password', async () => {
    const withPassword = { ...stored, passwordHash: await hashPassword('old-secret') };
    const { service: users, patches } = service({ findById: async () => withPassword });
    await expect(users.changePassword(user, 'wrong', 'new-secret')).rejects.toThrow(ForbiddenError);
    await users.changePassword(user, 'old-secret', 'new-secret');
    expect(patches[0]).toHaveProperty('passwordHash');
  });
});
