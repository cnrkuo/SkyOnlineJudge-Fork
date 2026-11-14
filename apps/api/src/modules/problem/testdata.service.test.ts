import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { sha256 } from '../../common/crypto.js';
import { BadRequestError } from '../../common/errors.js';
import type { StorageService } from '../../storage/storage.service.js';
import { admin, fake } from '../../testing/fixtures.js';
import type { ProblemRepository } from './problem.repository.js';
import type { ProblemService } from './problem.service.js';
import { TestdataService } from './testdata.service.js';

const zip = (files: Record<string, string>) =>
  new File([zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])))], 'td.zip');

function setup(previous: { name: string; content: string }[]) {
  const stored = previous.map(({ name, content }) => ({
    name,
    inputSha256: sha256(`${content}-in`),
    outputSha256: sha256(`${content}-out`),
    inputSize: 1,
    outputSize: 1,
  }));
  const written: string[] = [];
  const deleted: string[] = [];
  let replaced: { name: string; ordinal: number }[] = [];
  const service = new TestdataService(
    fake<ProblemService>({ editable: async () => ({}) }),
    fake<ProblemRepository>({
      listTestcases: async () => stored,
      replaceTestcases: async (_id: number, rows: typeof replaced) => {
        replaced = rows;
      },
    }),
    fake<StorageService>({
      put: async (key: string) => void written.push(key),
      delete: async (key: string) => void deleted.push(key),
    }),
  );
  return { service, written, deleted, replaced: () => replaced };
}

describe('TestdataService.upload', () => {
  it('stores the files, merges with existing testcases and deletes orphaned blobs', async () => {
    const { service, written, deleted, replaced } = setup([
      { name: '1', content: 'old1' },
      { name: '2', content: 'old2' },
    ]);
    const result = await service.upload(
      admin,
      5,
      zip({ '2.in': 'new2-in', '2.ans': 'new2-out', '3.in': 'a', '3.ans': 'b' }),
    );

    expect(result).toEqual({ testcases: 3 });
    expect(replaced().map((t) => [t.name, t.ordinal])).toEqual([
      ['1', 0],
      ['2', 1],
      ['3', 2],
    ]);
    expect(written).toHaveLength(4);
    expect(written.every((key) => key.startsWith('problems/5/testdata/'))).toBe(true);
    // Only the replaced testcase "2" leaves blobs behind.
    expect(deleted.sort()).toEqual(
      [sha256('old2-in'), sha256('old2-out')].map((hash) => `problems/5/testdata/${hash}`).sort(),
    );
  });

  it('rejects an archive without testcase pairs', async () => {
    const { service } = setup([]);
    await expect(service.upload(admin, 5, zip({ 'readme.txt': 'hi', '1.in': 'only input' }))).rejects.toThrow(
      BadRequestError,
    );
  });
});
