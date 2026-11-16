import { Injectable } from '@nestjs/common';
import { USERNAME_CHANGES_IN_WORDS, USERNAME_CHANGES_PER_YEAR, type UserLevel, Verdict } from '@yato/contract';
import { type Actor, requireLogin, toActor } from '../../common/actor.js';
import { hashPassword, md5, verifyPassword } from '../../common/crypto.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors.js';
import { SubmissionRepository } from '../submission/submission.repository.js';
import { type UserPatch, UserRepository } from './user.repository.js';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

@Injectable()
export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly submissions: SubmissionRepository,
  ) {}

  async getProfile(username: string) {
    const user = await this.users.findByUsername(username);
    if (!user) throw new NotFoundError('User');
    const [totals, best] = await Promise.all([
      this.submissions.totalsOfUser(user.id),
      this.submissions.bestVerdicts(user.id),
    ]);
    const byId = (a: number, b: number) => a - b;
    const solved = [...best].filter(([, verdict]) => verdict === Verdict.AC).map(([problemId]) => problemId);
    const tried = [...best].filter(([, verdict]) => verdict !== Verdict.AC).map(([problemId]) => problemId);
    return {
      id: user.id,
      username: user.username,
      level: user.level as UserLevel,
      nickname: user.nickname,
      introduction: user.introduction,
      // Like the legacy site, fall back to the e-mail's Gravatar.
      avatarUrl:
        user.avatarUrl || `https://www.gravatar.com/avatar/${md5(user.email.trim().toLowerCase())}?d=identicon&s=200`,
      createdAt: user.createdAt.toISOString(),
      stats: { ...totals, solvedProblemIds: solved.sort(byId), triedProblemIds: tried.sort(byId) },
    };
  }

  async updateProfile(actor: Actor, patch: Pick<UserPatch, 'username' | 'nickname' | 'introduction' | 'avatarUrl'>) {
    requireLogin(actor);
    if (patch.username && patch.username !== actor.username) {
      if (await this.users.usernameTaken(patch.username, actor.id)) {
        throw new ConflictError('This username is already taken');
      }
      await this.checkRenameAllowed(actor.id);
    }
    const user = await this.users.update(actor.id, patch, actor.id);
    if (!user) throw new NotFoundError('User');
    return toActor(user);
  }

  /** Users may change their own username twice in any 365 days. */
  private async checkRenameAllowed(userId: number): Promise<void> {
    const now = Date.now();
    const changes = await this.users.ownUsernameChangesSince(userId, new Date(now - YEAR_MS));
    if (changes.length < USERNAME_CHANGES_PER_YEAR) return;
    // The window frees up a year after the oldest change that still counts.
    const oldest = changes[changes.length - USERNAME_CHANGES_PER_YEAR]!;
    const next = new Date(oldest.getTime() + YEAR_MS)
      .toISOString()
      .replace(/:\d\d\.\d+Z$/, ' UTC')
      .replace('T', ' ');
    throw new ForbiddenError(
      `You can change your username ${USERNAME_CHANGES_IN_WORDS} a year; the next change is possible from ${next}`,
    );
  }

  async changePassword(actor: Actor, oldPassword: string, newPassword: string): Promise<void> {
    requireLogin(actor);
    const user = await this.users.findById(actor.id);
    if (!user) throw new NotFoundError('User');
    if (!(await verifyPassword(oldPassword, user.passwordHash))) throw new ForbiddenError('The old password is wrong');
    await this.users.update(actor.id, { passwordHash: await hashPassword(newPassword) });
  }
}
