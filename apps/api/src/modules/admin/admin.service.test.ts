import { UserLevel } from '@skyoj/contract';
import { describe, expect, it } from 'vitest';
import { sha256 } from '../../common/crypto.js';
import { ConflictError, ForbiddenError } from '../../common/errors.js';
import { actor, admin, fake, root, user } from '../../testing/fixtures.js';
import type { SessionRepository } from '../auth/session.repository.js';
import type { JudgeRepository } from '../judge/judge.repository.js';
import type { UserRepository } from '../user/user.repository.js';
import { AdminService } from './admin.service.js';

const target: { id: number; nickname: string; level: number } = { id: 50, nickname: 'target', level: UserLevel.USER };

function service(stored = target, repo: Partial<Record<keyof UserRepository, unknown>> = {}) {
  const updates: unknown[][] = [];
  const loggedOut: number[] = [];
  const judgesCreated: unknown[][] = [];
  const admin = new AdminService(
    fake<UserRepository>({
      findById: async (id: number) => (id === stored.id ? stored : undefined),
      update: async (...args: unknown[]) => void updates.push(args),
      nicknameTaken: async () => false,
      ...repo,
    }),
    fake<SessionRepository>({ deleteByUser: async (id: number) => void loggedOut.push(id) }),
    fake<JudgeRepository>({
      findByName: async (name: string) => (name === 'taken' ? { id: 1 } : undefined),
      create: async (name: string, tokenHash: string) => {
        judgesCreated.push([name, tokenHash]);
        return { id: 2, name, enabled: true, languages: [], lastSeenAt: null, createdAt: new Date(0) };
      },
    }),
  );
  return { admin, updates, loggedOut, judgesCreated };
}

describe('AdminService.setUserLevel', () => {
  it('lets an administrator promote and demote lower ranks; demotion logs them out', async () => {
    const promote = service();
    await promote.admin.setUserLevel(admin, target.id, UserLevel.UNVERIFIED);
    expect(promote.updates).toEqual([[target.id, { level: UserLevel.UNVERIFIED }]]);
    expect(promote.loggedOut).toEqual([target.id]);

    const ban = service();
    await ban.admin.setUserLevel(root, target.id, UserLevel.ADMIN);
    expect(ban.loggedOut).toEqual([]);
  });

  it('never reaches up: no peers, no own rank, no self, no guest level', async () => {
    const peer = { ...target, level: UserLevel.ADMIN };
    await expect(service(peer).admin.setUserLevel(admin, peer.id, UserLevel.USER)).rejects.toThrow(ForbiddenError);
    await expect(service().admin.setUserLevel(admin, target.id, UserLevel.ADMIN)).rejects.toThrow(ForbiddenError);
    const self = { ...target, id: admin.id, level: admin.level };
    await expect(service(self).admin.setUserLevel(admin, admin.id, UserLevel.USER)).rejects.toThrow(ForbiddenError);
    await expect(service().admin.setUserLevel(admin, target.id, UserLevel.GUEST)).rejects.toThrow(ForbiddenError);
    await expect(service().admin.setUserLevel(user, target.id, UserLevel.BANNED)).rejects.toThrow(ForbiddenError);
  });
});

describe('AdminService.updateUser', () => {
  it('resets a password without the old one and ends the sessions', async () => {
    const { admin: service_, updates, loggedOut } = service();
    await service_.updateUser(admin, { userId: target.id, newPassword: 'n3w-password' });
    expect(updates[0]?.[1]).toHaveProperty('passwordHash');
    expect(loggedOut).toEqual([target.id]);
  });

  it('refuses a nickname in use and accounts of the same rank', async () => {
    const taken = service(target, { nicknameTaken: async () => true }).admin;
    await expect(taken.updateUser(admin, { userId: target.id, nickname: 'other' })).rejects.toThrow(ConflictError);
    const peer = { ...target, level: UserLevel.ADMIN };
    await expect(service(peer).admin.updateUser(admin, { userId: peer.id, realname: 'x' })).rejects.toThrow(
      ForbiddenError,
    );
    const self = { ...target, id: admin.id, level: admin.level };
    await expect(service(self).admin.updateUser(admin, { userId: admin.id, realname: 'me' })).resolves.toBeUndefined();
  });
});

describe('AdminService.createJudge', () => {
  it('returns the token once and stores only its hash', async () => {
    const { admin: service_, judgesCreated } = service();
    const { token, judge } = await service_.createJudge(admin, 'judge-01');
    expect(token).toMatch(/^skyoj_judge_[\w-]{43}$/);
    expect(judgesCreated).toEqual([['judge-01', sha256(token)]]);
    expect(judge).toMatchObject({ name: 'judge-01', languages: [] });
  });

  it('refuses a duplicate name and non-administrators', async () => {
    await expect(service().admin.createJudge(admin, 'taken')).rejects.toThrow(ConflictError);
    await expect(service().admin.createJudge(actor(9, UserLevel.USER), 'x')).rejects.toThrow(ForbiddenError);
  });
});
