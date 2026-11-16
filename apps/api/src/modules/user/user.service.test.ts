import { Verdict } from '@yato/contract';
import { describe, expect, it } from 'vitest';
import { hashPassword } from '../../common/crypto.js';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../common/errors.js';
import { fake, guest, user } from '../../testing/fixtures.js';
import type { SubmissionRepository } from '../submission/submission.repository.js';
import type { UserPatch, UserRepository } from './user.repository.js';
import { UserService } from './user.service.js';

const stored = {
  id: user.id,
  username: user.username,
  email: ' User1@Example.com ',
  level: user.level,
  nickname: null,
  introduction: '> Stay hungry.\n>\n> — Steve Jobs',
  avatarUrl: null,
  passwordHash: '',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function service(users: Partial<Record<keyof UserRepository, unknown>> = {}) {
  const patches: UserPatch[] = [];
  const users_ = fake<UserRepository>({
    findById: async () => stored,
    findByUsername: async (username: string) =>
      username.toLowerCase() === stored.username.toLowerCase() ? stored : undefined,
    update: async (_id: number, patch: UserPatch) => {
      patches.push(patch);
      return { ...stored, ...patch };
    },
    usernameTaken: async () => false,
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
    const profile = await service().service.getProfile(stored.username.toUpperCase());
    expect(profile.introduction).toBe(stored.introduction);
    expect(profile.stats).toEqual({ submissions: 3, accepted: 1, solvedProblemIds: [3, 7], triedProblemIds: [2] });
  });

  it('is found by username, not by id', async () => {
    await expect(service().service.getProfile(String(stored.id))).rejects.toThrow(NotFoundError);
  });

  it("falls back to the e-mail's Gravatar without an avatar", async () => {
    const { avatarUrl } = await service().service.getProfile(stored.username);
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

  it('refuses a username someone else uses, and guests', async () => {
    const taken = service({ usernameTaken: async () => true }).service;
    await expect(taken.updateProfile(user, { username: 'someone' })).rejects.toThrow(ConflictError);
    await expect(service().service.updateProfile(guest, { introduction: 'x' })).rejects.toThrow(UnauthorizedError);
  });

  describe('username changes: twice in any 365 days', () => {
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
    const withChanges = (dates: Date[]) => {
      const asked: Date[] = [];
      const made = service({
        ownUsernameChangesSince: async (_id: number, since: Date) => {
          asked.push(since);
          return dates.filter((date) => date >= since);
        },
      });
      return { ...made, asked };
    };

    it('allows a change with fewer than two in the past year', async () => {
      const { service: users, asked } = withChanges([daysAgo(400), daysAgo(30)]);
      await users.updateProfile(user, { username: 'new.name' });
      expect(Date.now() - asked[0]!.getTime()).toBeCloseTo(365 * 86_400_000, -4);
    });

    it('refuses a third, naming when the next one is possible', async () => {
      const { service: users, patches } = withChanges([daysAgo(300), daysAgo(10)]);
      const error = await users.updateProfile(user, { username: 'new.name' }).catch((e: Error) => e);
      expect(error).toBeInstanceOf(ForbiddenError);
      // The older change leaves the window 65 days from now.
      const next = daysAgo(-65).toISOString().slice(0, 10);
      expect((error as Error).message).toContain(next);
      expect(patches).toEqual([]);
    });

    it('does not count keeping the same username, or other fields', async () => {
      const { service: users, patches } = withChanges([daysAgo(1), daysAgo(2)]);
      await users.updateProfile(user, { username: user.username, nickname: 'Al' });
      expect(patches).toHaveLength(1);
    });
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
