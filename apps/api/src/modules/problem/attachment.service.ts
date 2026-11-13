import { Injectable } from '@nestjs/common';
import type { Actor } from '../../common/actor.js';
import { BadRequestError, NotFoundError } from '../../common/errors.js';
import { StorageService } from '../../storage/storage.service.js';
import { ProblemRepository } from './problem.repository.js';
import { ProblemService } from './problem.service.js';

const MAX_ATTACHMENT_BYTES = 32 * 1024 * 1024;
const ATTACHMENT_NAME = /^[a-zA-Z0-9._-]{1,64}$/;

/** Files a statement links to (figures, samples). They follow the statement's visibility. */
@Injectable()
export class AttachmentService {
  constructor(
    private readonly problemService: ProblemService,
    private readonly problems: ProblemRepository,
    private readonly storage: StorageService,
  ) {}

  async list(actor: Actor, problemId: number) {
    await this.problemService.access(actor, problemId);
    const rows = await this.problems.listAttachments(problemId);
    return rows.map((row) => ({ name: row.name, size: row.size }));
  }

  async upload(actor: Actor, problemId: number, file: File) {
    await this.problemService.editable(actor, problemId);
    if (!ATTACHMENT_NAME.test(file.name) || file.name.startsWith('.')) {
      throw new BadRequestError('File names may only contain letters, digits, ".", "_" and "-" (max 64 characters)');
    }
    if (file.size > MAX_ATTACHMENT_BYTES) throw new BadRequestError('Attachment is too large');
    await this.storage.put(
      StorageService.attachmentKey(problemId, file.name),
      new Uint8Array(await file.arrayBuffer()),
    );
    await this.problems.upsertAttachment(problemId, file.name, file.size);
    return { name: file.name, size: file.size };
  }

  async delete(actor: Actor, problemId: number, name: string): Promise<void> {
    await this.problemService.editable(actor, problemId);
    if (!(await this.problems.deleteAttachment(problemId, name))) throw new NotFoundError('Attachment');
    await this.storage.delete(StorageService.attachmentKey(problemId, name));
  }

  async get(actor: Actor, problemId: number, name: string): Promise<File> {
    await this.problemService.access(actor, problemId);
    if (!(await this.problems.hasAttachment(problemId, name))) throw new NotFoundError('Attachment');
    const data = await this.storage.get(StorageService.attachmentKey(problemId, name));
    return new File([new Uint8Array(data)], name, { type: 'application/octet-stream' });
  }
}
