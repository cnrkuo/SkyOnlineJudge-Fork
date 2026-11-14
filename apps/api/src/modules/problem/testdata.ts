import { naturalOrder, type TestcaseFiles } from './testdata-archive.js';

/** A testcase as stored: content hashes and sizes of its two files. */
export interface StoredTestcase {
  name: string;
  inputSha256: string;
  outputSha256: string;
  inputSize: number;
  outputSize: number;
}

/** An uploaded testcase together with the hashes its files are stored under. */
export interface HashedTestcase extends TestcaseFiles {
  inputSha256: string;
  outputSha256: string;
}

/**
 * Merges an upload into the existing set, like the legacy uploader: a
 * testcase with a known name is replaced, the others are kept. The result is
 * in natural order of the names, which is the judging order (`ordinal`).
 */
export function mergeTestcases(
  previous: readonly StoredTestcase[],
  uploaded: readonly HashedTestcase[],
): (StoredTestcase & { ordinal: number })[] {
  const byName = new Map<string, StoredTestcase>();
  for (const { name, inputSha256, outputSha256, inputSize, outputSize } of previous) {
    byName.set(name, { name, inputSha256, outputSha256, inputSize, outputSize });
  }
  for (const { name, inputSha256, outputSha256, input, output } of uploaded) {
    byName.set(name, { name, inputSha256, outputSha256, inputSize: input.byteLength, outputSize: output.byteLength });
  }
  return [...byName.values()]
    .sort((a, b) => naturalOrder.compare(a.name, b.name))
    .map((testcase, ordinal) => ({ ...testcase, ordinal }));
}

/** Content hashes the old set used that the new set no longer references. */
export function orphanedHashes(previous: readonly StoredTestcase[], current: readonly StoredTestcase[]): string[] {
  const kept = new Set(current.flatMap((t) => [t.inputSha256, t.outputSha256]));
  const old = new Set(previous.flatMap((t) => [t.inputSha256, t.outputSha256]));
  return [...old].filter((hash) => !kept.has(hash));
}
