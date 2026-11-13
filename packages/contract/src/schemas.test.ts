import { type } from 'arktype';
import { describe, expect, it } from 'vitest';
import { CODE_MAX_LENGTH, Language } from './enums.js';
import { IdSchema, NicknameSchema, PageInputSchema, PasswordSchema, SubmitInputSchema } from './schemas.js';

const ok = <T>(result: T | InstanceType<typeof type.errors>) => {
  if (result instanceof type.errors) throw new Error(result.summary);
  return result;
};
const rejects = (result: unknown) => expect(result).toBeInstanceOf(type.errors);

describe('IdSchema', () => {
  it('accepts positive integers, also as strings (multipart form fields)', () => {
    expect(ok(IdSchema(12))).toBe(12);
    expect(ok(IdSchema('12'))).toBe(12);
  });

  it('rejects zero, negatives, fractions and words', () => {
    for (const value of [0, -1, 1.5, 'twelve']) rejects(IdSchema(value));
  });
});

describe('PageInputSchema', () => {
  it('defaults to the first page of 20 and caps the page size', () => {
    expect(ok(PageInputSchema({}))).toEqual({ page: 1, pageSize: 20 });
    rejects(PageInputSchema({ pageSize: 101 }));
    rejects(PageInputSchema({ page: 0 }));
  });
});

describe('account fields', () => {
  it('trims nicknames before checking them', () => {
    expect(ok(NicknameSchema('  alice  '))).toBe('alice');
  });

  it('needs passwords of at least six characters', () => {
    rejects(PasswordSchema('12345'));
    expect(ok(PasswordSchema('123456'))).toBe('123456');
  });
});

describe('SubmitInputSchema', () => {
  const submission = { problemId: 1, language: Language.CPP23, code: 'int main() {}' };

  it('accepts code in a known language', () => {
    expect(ok(SubmitInputSchema(submission))).toEqual(submission);
  });

  it('rejects unknown languages, empty code and code over the size limit', () => {
    rejects(SubmitInputSchema({ ...submission, language: 'brainfuck' }));
    rejects(SubmitInputSchema({ ...submission, code: '' }));
    rejects(SubmitInputSchema({ ...submission, code: 'x'.repeat(CODE_MAX_LENGTH + 1) }));
  });
});
