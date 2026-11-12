import { unzipSync } from 'fflate';
import { basename } from 'node:path';
import { BadRequestError } from '../../common/errors.js';

export interface TestcaseFiles {
  name: string;
  input: Uint8Array;
  output: Uint8Array;
}

const INPUT_EXT = 'in';
const OUTPUT_EXTS = ['ans', 'out'];
/** Orders testcase names the way people read them: `2` before `10`. */
export const naturalOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * Extracts testcases from a zip archive. A testcase is a `<name>.in` file
 * with a matching `<name>.ans` (or `<name>.out`); directories are flattened
 * and unpaired files are ignored. Testcases are returned in natural order of
 * their names (`2` before `10`), which becomes their judging order.
 */
export function readTestdataArchive(archive: Uint8Array, maxTotalBytes: number): TestcaseFiles[] {
  let entries: Record<string, Uint8Array>;
  try {
    let budget = maxTotalBytes;
    entries = unzipSync(archive, {
      filter: (file) => {
        if (file.name.endsWith('/')) return false;
        budget -= file.originalSize;
        if (budget < 0) throw new BadRequestError('Testdata archive is too large when extracted');
        return true;
      },
    });
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError('The uploaded file is not a valid zip archive');
  }

  const inputs = new Map<string, Uint8Array>();
  const outputs = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(entries)) {
    const file = basename(path);
    const dot = file.lastIndexOf('.');
    if (dot <= 0 || file.startsWith('.')) continue;
    const name = file.slice(0, dot);
    const ext = file.slice(dot + 1).toLowerCase();
    if (ext === INPUT_EXT) inputs.set(name, data);
    // `.ans` takes precedence over `.out` when both exist.
    else if (OUTPUT_EXTS.includes(ext) && (ext === 'ans' || !outputs.has(name))) outputs.set(name, data);
  }

  return [...inputs.keys()]
    .filter((name) => outputs.has(name))
    .sort(naturalOrder.compare)
    .map((name) => ({ name: name.slice(0, 64), input: inputs.get(name)!, output: outputs.get(name)! }));
}
