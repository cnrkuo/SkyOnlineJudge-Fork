import { Injectable } from '@nestjs/common';
import { AccessLevel, type Language, ScoreMode, type Verdict } from '@skyoj/contract';
import { type Actor, isAdmin, isUser, requireAdmin, satisfies } from '../../common/actor.js';
import { sha256 } from '../../common/crypto.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../common/errors.js';
import { type PageInput, pageOf } from '../../common/pagination.js';
import { config } from '../../config.js';
import { StorageService } from '../../storage/storage.service.js';
import { ContestRepository } from '../contest/contest.repository.js';
import { SubmissionRepository } from '../submission/submission.repository.js';
import { type ProblemPatch, ProblemRepository, type ProblemWithOwner } from './problem.repository.js';
import { naturalOrder, readTestdataArchive } from './testdata-archive.js';

const MAX_ATTACHMENT_BYTES = 32 * 1024 * 1024;
/**
 * Testdata compresses well (repetitive numbers), so an archive may unpack to
 * this many times the upload limit before it is rejected as a zip bomb.
 */
const MAX_TESTDATA_EXPANSION = 4;

export interface ProblemAccess extends ProblemWithOwner {
  canEdit: boolean;
  canSubmit: boolean;
}

@Injectable()
export class ProblemService {
  constructor(
    private readonly problems: ProblemRepository,
    private readonly submissions: SubmissionRepository,
    private readonly contests: ContestRepository,
    private readonly storage: StorageService,
  ) {}

  /**
   * Loads a problem and works out what the actor may do with it.
   * Throws when the actor may not even read the statement.
   */
  async access(actor: Actor, id: number): Promise<ProblemAccess> {
    const found = await this.problems.findById(id);
    if (!found) throw new NotFoundError('Problem');
    const { problem, owner } = found;

    const direct = satisfies(actor, owner, problem.contentAccess);
    const canEdit = isAdmin(actor) && direct;
    // Only consult contests when the direct rules do not already settle it.
    const needGrant = !direct || (!problem.submitOpen && !canEdit);
    const grant = needGrant ? await this.contests.grantsFor(actor.id, id, new Date()) : { read: false, submit: false };
    if (!direct && !grant.read) throw new ForbiddenError('You may not view this problem');

    const canSubmit = isUser(actor) && (canEdit || (direct && problem.submitOpen) || grant.submit);
    return { problem, owner, canEdit, canSubmit };
  }

  /** Editing takes an administrator who may also see the problem. */
  private async editable(actor: Actor, id: number): Promise<ProblemWithOwner> {
    requireAdmin(actor);
    const found = await this.problems.findById(id);
    if (!found) throw new NotFoundError('Problem');
    if (!satisfies(actor, found.owner, found.problem.contentAccess)) {
      throw new ForbiddenError('You may not edit this problem');
    }
    return found;
  }

  async list(actor: Actor, input: PageInput & { search?: string }) {
    const { rows, total } = await this.problems.listVisible(actor, input, input.search);
    const ids = rows.map((row) => row.id);
    const [counters, best] = await Promise.all([
      this.submissions.countersFor(ids),
      this.submissions.bestVerdicts(actor.id, ids),
    ]);
    const items = rows.map((row) => ({
      id: row.id,
      title: row.title,
      contentAccess: row.contentAccess as AccessLevel,
      submissions: counters.get(row.id)?.submissions ?? 0,
      accepted: counters.get(row.id)?.accepted ?? 0,
      acceptedUsers: counters.get(row.id)?.acceptedUsers ?? 0,
      myVerdict: (best.get(row.id) ?? null) as Verdict | null,
    }));
    return pageOf(items, total, input);
  }

  async get(actor: Actor, id: number) {
    const { problem, owner, canEdit, canSubmit } = await this.access(actor, id);
    return {
      id: problem.id,
      owner: { id: owner.id, nickname: owner.nickname },
      title: problem.title,
      content: problem.content,
      contentAccess: problem.contentAccess as AccessLevel,
      submitOpen: problem.submitOpen,
      codeviewAccess: problem.codeviewAccess as AccessLevel,
      timeLimitMs: problem.timeLimitMs,
      memoryLimitKb: problem.memoryLimitKb,
      scoreMode: problem.scoreMode as ScoreMode,
      scoreGroups: problem.scoreGroups,
      testcaseCount: await this.problems.countTestcases(id),
      createdAt: problem.createdAt.toISOString(),
      updatedAt: problem.updatedAt.toISOString(),
      canEdit,
      canSubmit,
    };
  }

  /** New problems start hidden and closed, like a draft. */
  async create(actor: Actor, title: string): Promise<{ id: number }> {
    requireAdmin(actor);
    const id = await this.problems.create(actor.id, {
      title,
      contentAccess: AccessLevel.HIDDEN,
      codeviewAccess: AccessLevel.HIDDEN,
    });
    return { id };
  }

  async update(actor: Actor, id: number, patch: ProblemPatch): Promise<void> {
    const { problem } = await this.editable(actor, id);
    const mode = patch.scoreMode ?? problem.scoreMode;
    const groups = patch.scoreGroups ?? problem.scoreGroups;
    if (mode === ScoreMode.GROUP_MIN && groups.length === 0) {
      throw new BadRequestError('Group-min scoring needs at least one score group');
    }
    await this.problems.update(id, patch);
  }

  async stats(actor: Actor, id: number) {
    await this.access(actor, id);
    const [verdicts, fastest] = await Promise.all([
      this.submissions.verdictHistogram(id),
      this.submissions.fastestAccepted(id, 20),
    ]);
    return {
      verdicts: verdicts.map((row) => ({ verdict: row.verdict as Verdict, count: row.count })),
      fastest: fastest.map((row) => ({
        submissionId: row.id,
        user: { id: row.userId, nickname: row.nickname },
        timeMs: row.timeMs,
        memoryKb: row.memoryKb,
        language: row.language as Language,
      })),
    };
  }

  // ----------------------------------------------------------------- testdata

  async listTestcases(actor: Actor, problemId: number) {
    await this.editable(actor, problemId);
    return this.problems.listTestcases(problemId);
  }

  /** Returns the total number of testcases after the upload. */
  async uploadTestdata(actor: Actor, problemId: number, archive: File): Promise<{ testcases: number }> {
    await this.editable(actor, problemId);
    const cases = readTestdataArchive(
      new Uint8Array(await archive.arrayBuffer()),
      config.maxUploadBytes * MAX_TESTDATA_EXPANSION,
    );
    if (cases.length === 0) {
      throw new BadRequestError('No testcases found: the archive must contain <name>.in / <name>.ans pairs');
    }

    // Like the legacy uploader, an archive adds to the existing set: cases
    // with a known name are overwritten, the others are kept. ("Remove all
    // testcases" starts over.) The merged set is re-ordered by name.
    const previous = await this.problems.listTestcases(problemId);
    const merged = new Map(
      previous.map(({ name, inputSha256, outputSha256, inputSize, outputSize }) => [
        name,
        { name, inputSha256, outputSha256, inputSize, outputSize },
      ]),
    );
    // Blobs are content-addressed, so new files never overwrite ones a judge
    // may still be downloading; unreferenced blobs are swept after the swap.
    for (const testcase of cases) {
      const inputSha256 = sha256(testcase.input);
      const outputSha256 = sha256(testcase.output);
      await this.storage.put(StorageService.testdataKey(problemId, inputSha256), testcase.input);
      await this.storage.put(StorageService.testdataKey(problemId, outputSha256), testcase.output);
      merged.set(testcase.name, {
        name: testcase.name,
        inputSha256,
        outputSha256,
        inputSize: testcase.input.byteLength,
        outputSize: testcase.output.byteLength,
      });
    }
    const rows = [...merged.values()]
      .sort((a, b) => naturalOrder.compare(a.name, b.name))
      .map((row, ordinal) => ({ ...row, ordinal }));
    await this.problems.replaceTestcases(problemId, rows);

    const keep = new Set(rows.flatMap((row) => [row.inputSha256, row.outputSha256]));
    for (const old of previous) {
      for (const hash of [old.inputSha256, old.outputSha256]) {
        if (!keep.has(hash)) await this.storage.delete(StorageService.testdataKey(problemId, hash));
      }
    }
    return { testcases: rows.length };
  }

  async clearTestdata(actor: Actor, problemId: number): Promise<void> {
    await this.editable(actor, problemId);
    await this.problems.replaceTestcases(problemId, []);
    await this.storage.delete(StorageService.testdataDir(problemId));
  }

  // -------------------------------------------------------------- attachments

  async listAttachments(actor: Actor, problemId: number) {
    await this.access(actor, problemId);
    const rows = await this.problems.listAttachments(problemId);
    return rows.map((row) => ({ name: row.name, size: row.size }));
  }

  async uploadAttachment(actor: Actor, problemId: number, file: File) {
    await this.editable(actor, problemId);
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(file.name) || file.name.startsWith('.')) {
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

  async deleteAttachment(actor: Actor, problemId: number, name: string): Promise<void> {
    await this.editable(actor, problemId);
    if (!(await this.problems.deleteAttachment(problemId, name))) throw new NotFoundError('Attachment');
    await this.storage.delete(StorageService.attachmentKey(problemId, name));
  }

  /** Attachments follow the statement's visibility. */
  async getAttachment(actor: Actor, problemId: number, name: string): Promise<File> {
    await this.access(actor, problemId);
    if (!(await this.problems.hasAttachment(problemId, name))) throw new NotFoundError('Attachment');
    const data = await this.storage.get(StorageService.attachmentKey(problemId, name));
    return new File([new Uint8Array(data)], name, { type: 'application/octet-stream' });
  }
}
