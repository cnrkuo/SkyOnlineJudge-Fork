import { Injectable } from '@nestjs/common';
import { UserLevel } from '@skyoj/contract';
import { GUEST, type Actor } from '../../common/actor.js';
import { hashPassword, isLegacyHash, randomToken, sha256, verifyPassword } from '../../common/crypto.js';
import { ConflictError, ForbiddenError, UnauthorizedError } from '../../common/errors.js';
import { config } from '../../config.js';
import { UserRepository, type UserRow } from '../user/user.repository.js';
import { SessionRepository } from './session.repository.js';

export function toActor(user: UserRow): Actor {
  return { id: user.id, nickname: user.nickname, email: user.email, level: user.level as UserLevel };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
  ) {}

  async register(input: { email: string; nickname: string; password: string }) {
    const taken = await this.users.emailOrNicknameTaken(input.email, input.nickname);
    if (taken) throw new ConflictError(`This ${taken} is already registered`);

    // The very first account becomes the site owner.
    const level = (await this.users.count()) === 0 ? UserLevel.ROOT : UserLevel.USER;
    const user = await this.users.create({
      email: input.email,
      nickname: input.nickname,
      passwordHash: await hashPassword(input.password),
      level,
    });
    return this.openSession(user);
  }

  async login(input: { identifier: string; password: string }) {
    const user = await this.users.findByIdentifier(input.identifier);
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new UnauthorizedError('Wrong account or password');
    }
    if (user.level <= UserLevel.BANNED) throw new ForbiddenError('This account has been banned');
    // Accounts imported from the PHP system upgrade to the current scheme on first login.
    if (isLegacyHash(user.passwordHash)) {
      await this.users.update(user.id, { passwordHash: await hashPassword(input.password) });
    }
    return this.openSession(user);
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.sessions.delete(sha256(token));
  }

  /** Resolves a bearer token to an actor; unknown tokens resolve to the guest. */
  async resolve(token: string | undefined): Promise<Actor> {
    if (!token) return GUEST;
    const user = await this.sessions.findUser(sha256(token));
    return user ? toActor(user) : GUEST;
  }

  private async openSession(user: UserRow) {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + config.sessionTtlDays * 86_400_000);
    await this.sessions.create(sha256(token), user.id, expiresAt);
    void this.sessions.deleteExpired().catch(() => undefined);
    return { token, user: toActor(user) };
  }
}
