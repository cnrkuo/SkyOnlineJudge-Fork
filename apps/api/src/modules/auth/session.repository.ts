import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, lt } from 'drizzle-orm';
import { type Database, DB } from '../../database/database.module.js';
import { sessions, users } from '../../database/schema.js';
import type { UserRow } from '../user/user.repository.js';

@Injectable()
export class SessionRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(tokenHash: string, userId: number, expiresAt: Date): Promise<void> {
    await this.db.insert(sessions).values({ tokenHash, userId, expiresAt });
  }

  /** Returns the owner of a live session, or `undefined` when unknown or expired. */
  async findUser(tokenHash: string): Promise<UserRow | undefined> {
    const [row] = await this.db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())));
    return row?.user;
  }

  async delete(tokenHash: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }

  async deleteByUser(userId: number): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  }

  async deleteExpired(): Promise<void> {
    await this.db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  }
}
