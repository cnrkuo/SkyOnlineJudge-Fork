import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Language, Verdict } from './enums.js';

/**
 * The C++ judge cannot import this package, so the values it shares with
 * the API are checked against its sources here.
 */
const judgeSource = (file: string) => readFileSync(new URL(`../../../judge/src/${file}`, import.meta.url), 'utf8');

describe('the judge machine agrees with the contract', () => {
  it('uses the same verdict codes', () => {
    const enumBody = /enum class Verdict : int \{([^}]*)\}/.exec(judgeSource('common.hpp'))?.[1] ?? '';
    const judge = Object.fromEntries(
      [...enumBody.matchAll(/(\w+) = (\d+)/g)].map(([, name, code]) => [name, Number(code)]),
    );
    expect(judge).toEqual({
      Accepted: Verdict.AC,
      PresentationError: Verdict.PE,
      WrongAnswer: Verdict.WA,
      OutputLimitExceeded: Verdict.OLE,
      RuntimeError: Verdict.RE,
      TimeLimitExceeded: Verdict.TLE,
      MemoryLimitExceeded: Verdict.MLE,
      RestrictedFunction: Verdict.RF,
      CompileError: Verdict.CE,
      JudgeError: Verdict.JE,
    });
  });

  it('ships a toolchain for every language a submission may use, and no others', () => {
    const defaults = /default_languages\(\) \{([\s\S]*?)\n\}/.exec(judgeSource('config.cpp'))?.[1] ?? '';
    const judgeLanguages = [...defaults.matchAll(/\{"([\w-]+)",\s*\{/g)].map(([, id]) => id);
    expect(judgeLanguages.sort()).toEqual(Object.values(Language).sort());
  });
});
