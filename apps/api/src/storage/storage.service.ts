import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { config } from '../config.js';

/**
 * Blob storage on the local filesystem, rooted at `DATA_DIR`.
 * Keys are relative POSIX paths such as `problems/12/testdata/<sha256>`.
 */
@Injectable()
export class StorageService {
  private readonly root = config.dataDir;

  private pathOf(key: string): string {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error(`Invalid storage key: ${key}`);
    return full;
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const path = this.pathOf(key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, data);
  }

  get(key: string): Promise<Buffer> {
    return fs.readFile(this.pathOf(key));
  }

  /** Deletes a file or a whole directory tree; missing keys are ignored. */
  async delete(key: string): Promise<void> {
    await fs.rm(this.pathOf(key), { recursive: true, force: true });
  }

  static testdataDir = (problemId: number) => join('problems', String(problemId), 'testdata');
  static testdataKey = (problemId: number, sha256: string) => join(StorageService.testdataDir(problemId), sha256);
  static attachmentKey = (problemId: number, name: string) =>
    join('problems', String(problemId), 'attachments', name);
}
