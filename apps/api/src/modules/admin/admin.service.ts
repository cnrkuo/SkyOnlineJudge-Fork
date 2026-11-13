import { Injectable } from '@nestjs/common';
import { Language, UserLevel } from '@skyoj/contract';
import { type Actor, requireAdmin } from '../../common/actor.js';
import { hashPassword, randomToken, sha256 } from '../../common/crypto.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors.js';
import { type PageInput, pageOf } from '../../common/pagination.js';
import { SessionRepository } from '../auth/session.repository.js';
import { JudgeRepository, type JudgeRow } from '../judge/judge.repository.js';
import { UserRepository } from '../user/user.repository.js';

const LANGUAGES = new Set<string>(Object.values(Language));
const isLanguage = (id: string): id is Language => LANGUAGES.has(id);

function toJudge(row: JudgeRow) {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    languages: row.languages.filter(isLanguage),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly judges: JudgeRepository,
  ) {}

  async listUsers(actor: Actor, input: PageInput & { search?: string }) {
    requireAdmin(actor);
    const { rows, total } = await this.users.list(input, input.search);
    const items = rows.map((user) => ({
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      level: user.level as UserLevel,
      realname: user.realname,
      createdAt: user.createdAt.toISOString(),
    }));
    return pageOf(items, total, input);
  }

  /**
   * Admins may only manage accounts ranked below themselves and may not
   * promote anyone to their own rank or higher.
   */
  async setUserLevel(actor: Actor, userId: number, level: UserLevel): Promise<void> {
    requireAdmin(actor);
    const target = await this.users.findById(userId);
    if (!target) throw new NotFoundError('User');
    if (target.id === actor.id) throw new ForbiddenError('You cannot change your own level');
    if (target.level >= actor.level || level >= actor.level || level === UserLevel.GUEST) {
      throw new ForbiddenError('You may not assign this level to this user');
    }
    await this.users.update(userId, { level });
    // Force a fresh login so a ban or demotion takes effect immediately.
    if (level < target.level) await this.sessions.deleteByUser(userId);
  }

  /**
   * Edits another account. As in the legacy system an administrator does not
   * need the account's old password; they may only touch lower-ranked users.
   */
  async updateUser(
    actor: Actor,
    input: { userId: number; nickname?: string; realname?: string | null; newPassword?: string },
  ): Promise<void> {
    requireAdmin(actor);
    const target = await this.users.findById(input.userId);
    if (!target) throw new NotFoundError('User');
    if (target.id !== actor.id && target.level >= actor.level) {
      throw new ForbiddenError('You may not edit this user');
    }
    if (input.nickname && input.nickname !== target.nickname) {
      if (await this.users.nicknameTaken(input.nickname, target.id)) {
        throw new ConflictError('This nickname is already taken');
      }
    }
    await this.users.update(target.id, {
      ...(input.nickname === undefined ? {} : { nickname: input.nickname }),
      ...(input.realname === undefined ? {} : { realname: input.realname }),
      ...(input.newPassword === undefined ? {} : { passwordHash: await hashPassword(input.newPassword) }),
    });
    if (input.newPassword !== undefined) await this.sessions.deleteByUser(target.id);
  }

  async listJudges(actor: Actor) {
    requireAdmin(actor);
    return (await this.judges.list()).map(toJudge);
  }

  async createJudge(actor: Actor, name: string) {
    requireAdmin(actor);
    if (await this.judges.findByName(name)) throw new ConflictError('A judge with this name already exists');
    const token = `skyoj_judge_${randomToken()}`;
    const row = await this.judges.create(name, sha256(token));
    return { judge: toJudge(row), token };
  }

  async setJudgeEnabled(actor: Actor, id: number, enabled: boolean): Promise<void> {
    requireAdmin(actor);
    if (!(await this.judges.setEnabled(id, enabled))) throw new NotFoundError('Judge');
  }

  async deleteJudge(actor: Actor, id: number): Promise<void> {
    requireAdmin(actor);
    if (!(await this.judges.delete(id))) throw new NotFoundError('Judge');
  }
}
