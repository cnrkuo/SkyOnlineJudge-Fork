import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DB, type Database } from '../../database/database.module.js';
import { judges } from '../../database/schema.js';

export type JudgeRow = typeof judges.$inferSelect;

@Injectable()
export class JudgeRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  list(): Promise<JudgeRow[]> {
    return this.db.select().from(judges).orderBy(asc(judges.id));
  }

  async findByTokenHash(tokenHash: string): Promise<JudgeRow | undefined> {
    const [row] = await this.db.select().from(judges).where(eq(judges.tokenHash, tokenHash));
    return row;
  }

  async findByName(name: string): Promise<JudgeRow | undefined> {
    const [row] = await this.db.select().from(judges).where(eq(judges.name, name));
    return row;
  }

  async create(name: string, tokenHash: string): Promise<JudgeRow> {
    const [row] = await this.db.insert(judges).values({ name, tokenHash }).returning();
    return row!;
  }

  /** Records that the judge is alive and, when it said, which languages it handles. */
  async touch(id: number, languages?: readonly string[]): Promise<void> {
    await this.db
      .update(judges)
      .set({ lastSeenAt: new Date(), ...(languages ? { languages: [...languages] } : {}) })
      .where(eq(judges.id, id));
  }

  async setEnabled(id: number, enabled: boolean): Promise<boolean> {
    const rows = await this.db.update(judges).set({ enabled }).where(eq(judges.id, id)).returning({ id: judges.id });
    return rows.length > 0;
  }

  async delete(id: number): Promise<boolean> {
    const rows = await this.db.delete(judges).where(eq(judges.id, id)).returning({ id: judges.id });
    return rows.length > 0;
  }
}
