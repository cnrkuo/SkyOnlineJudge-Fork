import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DB, type Database } from '../../database/database.module.js';
import { codepads, users } from '../../database/schema.js';

@Injectable()
export class CodepadRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(data: { hash: string; ownerId: number; language: string; content: string }): Promise<void> {
    await this.db.insert(codepads).values(data);
  }

  async findByHash(hash: string) {
    const [row] = await this.db
      .select({ pad: codepads, owner: { id: users.id, nickname: users.nickname } })
      .from(codepads)
      .leftJoin(users, eq(users.id, codepads.ownerId))
      .where(eq(codepads.hash, hash));
    return row;
  }

  listByOwner(ownerId: number, limit: number) {
    return this.db
      .select({ hash: codepads.hash, language: codepads.language, createdAt: codepads.createdAt })
      .from(codepads)
      .where(eq(codepads.ownerId, ownerId))
      .orderBy(desc(codepads.id))
      .limit(limit);
  }
}
