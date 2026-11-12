import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config.js';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

/** Injection token for the Drizzle database handle. */
export const DB = Symbol('DB');
const POOL = Symbol('POOL');

@Global()
@Module({
  providers: [
    { provide: POOL, useFactory: () => new pg.Pool({ connectionString: config.databaseUrl }) },
    {
      provide: DB,
      inject: [POOL],
      useFactory: async (pool: pg.Pool): Promise<Database> => {
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
