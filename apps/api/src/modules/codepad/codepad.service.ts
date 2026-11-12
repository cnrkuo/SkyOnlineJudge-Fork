import { Injectable } from '@nestjs/common';
import type { Language } from '@skyoj/contract';
import { requireLogin, requireUser, type Actor } from '../../common/actor.js';
import { randomToken } from '../../common/crypto.js';
import { NotFoundError } from '../../common/errors.js';
import { CodepadRepository } from './codepad.repository.js';

/** Pastebin for sharing code snippets by unguessable link. */
@Injectable()
export class CodepadService {
  constructor(private readonly codepads: CodepadRepository) {}

  async create(actor: Actor, input: { language: Language; content: string }): Promise<{ hash: string }> {
    requireUser(actor);
    const hash = randomToken(12);
    await this.codepads.create({ hash, ownerId: actor.id, ...input });
    return { hash };
  }

  /** Anyone holding the link may read a pad. */
  async get(hash: string) {
    const found = await this.codepads.findByHash(hash);
    if (!found) throw new NotFoundError('Codepad');
    return {
      hash: found.pad.hash,
      owner: found.owner,
      language: found.pad.language as Language,
      content: found.pad.content,
      createdAt: found.pad.createdAt.toISOString(),
    };
  }

  async mine(actor: Actor) {
    requireLogin(actor);
    const rows = await this.codepads.listByOwner(actor.id, 100);
    return rows.map((row) => ({
      hash: row.hash,
      language: row.language as Language,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
