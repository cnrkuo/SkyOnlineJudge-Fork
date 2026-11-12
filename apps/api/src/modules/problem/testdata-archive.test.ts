import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { BadRequestError } from '../../common/errors.js';
import { readTestdataArchive } from './testdata-archive.js';

const text = (data: Uint8Array) => new TextDecoder().decode(data);

describe('readTestdataArchive', () => {
  it('pairs inputs with answers in natural order and ignores the rest', () => {
    const archive = zipSync({
      '10.in': strToU8('ten'),
      '10.ans': strToU8('TEN'),
      '2.in': strToU8('two'),
      '2.out': strToU8('TWO'),
      'sub/1.in': strToU8('one'),
      'sub/1.ans': strToU8('ONE'),
      'sub/1.out': strToU8('ignored: .ans wins'),
      'orphan.in': strToU8('no answer'),
      'README.md': strToU8('notes'),
    });
    const cases = readTestdataArchive(archive, 1 << 20);
    expect(cases.map((c) => [c.name, text(c.input), text(c.output)])).toEqual([
      ['1', 'one', 'ONE'],
      ['2', 'two', 'TWO'],
      ['10', 'ten', 'TEN'],
    ]);
  });

  it('rejects non-zip uploads and oversized archives', () => {
    expect(() => readTestdataArchive(strToU8('not a zip'), 1 << 20)).toThrow(BadRequestError);
    const big = zipSync({ '1.in': new Uint8Array(4096), '1.ans': new Uint8Array(1) });
    expect(() => readTestdataArchive(big, 1024)).toThrow(/too large/);
  });
});
