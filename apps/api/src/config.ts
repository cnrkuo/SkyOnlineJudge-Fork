import { resolve } from 'node:path';

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

/** Runtime configuration, read once from the environment. */
export const config = {
  port: int('PORT', 3001),
  host: process.env.HOST ?? '127.0.0.1',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://skyoj:skyoj@localhost:5432/skyoj',
  /** How long boot waits for PostgreSQL to come up. */
  databaseWaitSec: int('DATABASE_WAIT_SEC', 60),
  rabbitmqUrl: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  /** How many queued writes are applied to PostgreSQL at the same time. */
  dbWriteConcurrency: int('DB_WRITE_CONCURRENCY', 8),
  dataDir: resolve(process.env.DATA_DIR ?? './data'),
  sessionTtlDays: int('SESSION_TTL_DAYS', 30),
  /** A submission stuck in JUDGING longer than this is handed out again. */
  judgeTimeoutSec: int('JUDGE_TIMEOUT_SEC', 600),
  /**
   * Registers (or re-keys) a judge machine with this token at boot, so a
   * judge started next to the API (docker compose) needs no manual setup.
   */
  bundledJudgeToken: process.env.BUNDLED_JUDGE_TOKEN ?? '',
  bundledJudgeName: process.env.BUNDLED_JUDGE_NAME || 'bundled',
  maxUploadBytes: int('MAX_UPLOAD_MB', 256) * 1024 * 1024,
};
