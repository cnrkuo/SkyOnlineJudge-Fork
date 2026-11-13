import { describe, expect, it } from 'vitest';
import { type HashedTestcase, mergeTestcases, orphanedHashes, type StoredTestcase } from './testdata.js';

const stored = (name: string, hash: string): StoredTestcase => ({
  name,
  inputSha256: `${hash}-in`,
  outputSha256: `${hash}-out`,
  inputSize: 1,
  outputSize: 1,
});
const uploaded = (name: string, hash: string, size = 3): HashedTestcase => ({
  name,
  input: new Uint8Array(size),
  output: new Uint8Array(size + 1),
  inputSha256: `${hash}-in`,
  outputSha256: `${hash}-out`,
});

describe('mergeTestcases', () => {
  it('adds new names, replaces known ones and keeps the rest', () => {
    const merged = mergeTestcases([stored('1', 'a'), stored('2', 'b')], [uploaded('2', 'c'), uploaded('3', 'd')]);
    expect(merged.map((t) => [t.name, t.inputSha256])).toEqual([
      ['1', 'a-in'],
      ['2', 'c-in'],
      ['3', 'd-in'],
    ]);
    expect(merged[1]).toMatchObject({ inputSize: 3, outputSize: 4 });
  });

  it('numbers testcases in natural order of their names', () => {
    const merged = mergeTestcases([], [uploaded('10', 'x'), uploaded('2', 'y'), uploaded('1', 'z')]);
    expect(merged.map((t) => [t.name, t.ordinal])).toEqual([
      ['1', 0],
      ['2', 1],
      ['10', 2],
    ]);
  });
});

describe('orphanedHashes', () => {
  it('lists blobs only the old set used', () => {
    const previous = [stored('1', 'a'), stored('2', 'b')];
    const current = [stored('1', 'a'), stored('2', 'c')];
    expect(orphanedHashes(previous, current).sort()).toEqual(['b-in', 'b-out']);
  });

  it('keeps a blob that moved to another testcase', () => {
    expect(orphanedHashes([stored('1', 'a')], [stored('2', 'a')])).toEqual([]);
  });
});
