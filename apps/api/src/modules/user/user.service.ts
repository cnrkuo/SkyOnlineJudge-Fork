import { Injectable } from '@nestjs/common';
import { type UserLevel, Verdict } from '@skyoj/contract';
import { type Actor, requireLogin, toActor } from '../../common/actor.js';
import { hashPassword, md5, verifyPassword } from '../../common/crypto.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors.js';
import { SubmissionRepository } from '../submission/submission.repository.js';
import { type UserPatch, UserRepository } from './user.repository.js';

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
