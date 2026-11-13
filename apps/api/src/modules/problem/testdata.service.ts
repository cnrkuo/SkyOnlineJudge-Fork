import { Injectable } from '@nestjs/common';
import type { Actor } from '../../common/actor.js';
import { sha256 } from '../../common/crypto.js';
import { BadRequestError } from '../../common/errors.js';
import { config } from '../../config.js';
import { StorageService } from '../../storage/storage.service.js';
import { ProblemRepository } from './problem.repository.js';
import { ProblemService } from './problem.service.js';
import { type HashedTestcase, mergeTestcases, orphanedHashes } from './testdata.js';
import { readTestdataArchive, type TestcaseFiles } from './testdata-archive.js';

/**
 * Testdata compresses well (repetitive numbers), so an archive may unpack to
 * this many times the upload limit before it is rejected as a zip bomb.
 */
const MAX_TESTDATA_EXPANSION = 4;

/** A problem's testcases: zip uploads, listing and removal. Editors only. */
@Injectable()
export class TestdataService {
  constructor(
    private readonly problemService: ProblemService,
    private readonly problems: ProblemRepository,
    private readonly storage: StorageService,
  ) {}

  async list(actor: Actor, problemId: number) {
    await this.problemService.editable(actor, problemId);
    return this.problems.listTestcases(problemId);
  }

  /**
   * Adds the testcases of a zip archive to the problem; returns how many it
   * has afterwards. Blobs are content-addressed, so new files never
   * overwrite ones a judge may still be downloading; blobs nothing refers to
   * any more are removed after the swap.
   */
  async upload(actor: Actor, problemId: number, archive: File): Promise<{ testcases: number }> {
    await this.problemService.editable(actor, problemId);
    const uploaded = readTestdataArchive(
      new Uint8Array(await archive.arrayBuffer()),
      config.maxUploadBytes * MAX_TESTDATA_EXPANSION,
    );
    if (uploaded.length === 0) {
      throw new BadRequestError('No testcases found: the archive must contain <name>.in / <name>.ans pairs');
    }

    const previous = await this.problems.listTestcases(problemId);
    const current = mergeTestcases(previous, await this.storeFiles(problemId, uploaded));
    await this.problems.replaceTestcases(problemId, current);
    await this.deleteBlobs(problemId, orphanedHashes(previous, current));
    return { testcases: current.length };
  }

  async clear(actor: Actor, problemId: number): Promise<void> {
    await this.problemService.editable(actor, problemId);
    await this.problems.replaceTestcases(problemId, []);
    await this.storage.delete(StorageService.testdataDir(problemId));
  }

  private async storeFiles(problemId: number, testcases: TestcaseFiles[]): Promise<HashedTestcase[]> {
    const hashed: HashedTestcase[] = [];
    for (const testcase of testcases) {
      const inputSha256 = sha256(testcase.input);
      const outputSha256 = sha256(testcase.output);
      await this.storage.put(StorageService.testdataKey(problemId, inputSha256), testcase.input);
      await this.storage.put(StorageService.testdataKey(problemId, outputSha256), testcase.output);
      hashed.push({ ...testcase, inputSha256, outputSha256 });
    }
    return hashed;
  }

  private async deleteBlobs(problemId: number, hashes: string[]): Promise<void> {
    for (const hash of hashes) await this.storage.delete(StorageService.testdataKey(problemId, hash));
  }
}
