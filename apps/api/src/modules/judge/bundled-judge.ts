import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { sha256 } from '../../common/crypto.js';
import { config } from '../../config.js';
import { JudgeRepository } from './judge.repository.js';

/** Shortest accepted `BUNDLED_JUDGE_TOKEN`; tokens are bearer secrets. */
const MIN_TOKEN_LENGTH = 32;

/**
 * Makes sure the judge described by `BUNDLED_JUDGE_TOKEN` exists, so the
 * judge container started by docker compose can log in without anyone
 * creating it in the admin UI first. The token is only stored hashed; an
 * administrator can still disable or delete the judge (deleting it while
 * the variable is set recreates it at the next start).
 */
@Injectable()
export class BundledJudge implements OnApplicationBootstrap {
  private readonly logger = new Logger(BundledJudge.name);

  constructor(private readonly judges: JudgeRepository) {}

  async onApplicationBootstrap(): Promise<void> {
    const token = config.bundledJudgeToken;
    if (!token) return;
    if (token.length < MIN_TOKEN_LENGTH) {
      throw new Error(`BUNDLED_JUDGE_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters long`);
    }
    const name = config.bundledJudgeName;
    const hash = sha256(token);
    const existing = await this.judges.findByName(name);
    if (!existing) {
      await this.judges.create(name, hash);
      this.logger.log(`Registered judge "${name}" from BUNDLED_JUDGE_TOKEN`);
    } else if (existing.tokenHash !== hash) {
      await this.judges.setTokenHash(existing.id, hash);
      this.logger.log(`Updated the token of judge "${name}" from BUNDLED_JUDGE_TOKEN`);
    }
  }
}
