import { fileURLToPath } from 'node:url';
import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { config } from '../config.js';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

/** Injection token for the Drizzle database handle. */
export const DB = Symbol('DB');
const POOL = Symbol('POOL');

/**
 * Waits up to `DATABASE_WAIT_SEC` (default 60) for PostgreSQL to accept
 * connections, so the API can start together with its database (containers
 * start in order but do not wait for each other to be ready).
 */
async function waitForDatabase(pool: pg.Pool): Promise<void> {
  const logger = new Logger('Database');
  const deadline = Date.now() + config.databaseWaitSec * 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      (await pool.connect()).release();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      if (attempt === 1) logger.warn(`PostgreSQL is not reachable yet (${(error as Error).message}); waiting`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

@Global()
@Module({
  providers: [
    { provide: POOL, useFactory: () => new pg.Pool({ connectionString: config.databaseUrl }) },
    {
      provide: DB,
      inject: [POOL],
      useFactory: async (pool: pg.Pool): Promise<Database> => {
        await waitForDatabase(pool);
        const db = drizzle(pool, { schema, casing: 'snake_case' });
        const migrationsFolder = fileURLToPath(new URL('../../migrations', import.meta.url));
        await migrate(db, { migrationsFolder });
        new Logger('Database').log('Migrations are up to date');
        return db;
      },
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
