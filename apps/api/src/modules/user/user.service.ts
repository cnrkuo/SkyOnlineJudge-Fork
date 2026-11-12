import { Injectable } from '@nestjs/common';
import { Verdict, type UserLevel } from '@skyoj/contract';
import { requireLogin, type Actor } from '../../common/actor.js';
import { hashPassword, md5, verifyPassword } from '../../common/crypto.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors.js';
import { toActor } from '../auth/auth.service.js';
import { SubmissionRepository } from '../submission/submission.repository.js';
import { UserRepository, type UserPatch } from './user.repository.js';

@Injectable()
export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly submissions: SubmissionRepository,
  ) {}

  async getProfile(id: number) {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError('User');
    const [totals, best] = await Promise.all([this.submissions.totalsOfUser(id), this.submissions.bestVerdicts(id)]);
    const byId = (a: number, b: number) => a - b;
    const solved = [...best].filter(([, verdict]) => verdict === Verdict.AC).map(([problemId]) => problemId);
    const tried = [...best].filter(([, verdict]) => verdict !== Verdict.AC).map(([problemId]) => problemId);
    return {
      id: user.id,
      nickname: user.nickname,
      level: user.level as UserLevel,
      realname: user.realname,
      quote: user.quote,
      quoteRef: user.quoteRef,
      // Like the legacy site, fall back to the e-mail's Gravatar.
      avatarUrl: user.avatarUrl || `https://www.gravatar.com/avatar/${md5(user.email.trim().toLowerCase())}?d=identicon&s=200`,
      createdAt: user.createdAt.toISOString(),
      stats: { ...totals, solvedProblemIds: solved.sort(byId), triedProblemIds: tried.sort(byId) },
    };
  }

  async updateProfile(actor: Actor, patch: Pick<UserPatch, 'nickname' | 'realname' | 'quote' | 'quoteRef' | 'avatarUrl'>) {
    requireLogin(actor);
    if (patch.nickname && patch.nickname !== actor.nickname) {
      if (await this.users.emailOrNicknameTaken('', patch.nickname, actor.id)) {
        throw new ConflictError('This nickname is already taken');
      }
    }
    const user = await this.users.update(actor.id, patch);
    if (!user) throw new NotFoundError('User');
    return toActor(user);
  }

  async changePassword(actor: Actor, oldPassword: string, newPassword: string): Promise<void> {
    requireLogin(actor);
    const user = await this.users.findById(actor.id);
    if (!user) throw new NotFoundError('User');
    if (!(await verifyPassword(oldPassword, user.passwordHash))) throw new ForbiddenError('The old password is wrong');
    await this.users.update(actor.id, { passwordHash: await hashPassword(newPassword) });
  }
}
