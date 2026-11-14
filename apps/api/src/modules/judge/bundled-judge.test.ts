import { afterEach, describe, expect, it } from 'vitest';
import { sha256 } from '../../common/crypto.js';
import { config } from '../../config.js';
import { fake } from '../../testing/fixtures.js';
import { BundledJudge } from './bundled-judge.js';
import type { JudgeRepository } from './judge.repository.js';

const TOKEN = 'skyoj_judge_0123456789abcdef0123456789abcdef';

function setup(existing?: { id: number; tokenHash: string }) {
  const created: unknown[][] = [];
  const rekeyed: unknown[][] = [];
  const bundled = new BundledJudge(
    fake<JudgeRepository>({
      findByName: async () => existing,
      create: async (...args: unknown[]) => void created.push(args),
      setTokenHash: async (...args: unknown[]) => void rekeyed.push(args),
    }),
  );
  return { bundled, created, rekeyed };
}

describe('BundledJudge', () => {
  afterEach(() => {
    config.bundledJudgeToken = '';
  });

  it('does nothing without BUNDLED_JUDGE_TOKEN', async () => {
    const { bundled, created } = setup();
    await bundled.onApplicationBootstrap();
    expect(created).toEqual([]);
  });

  it('registers the judge once, by hash, and re-keys it when the token changes', async () => {
    config.bundledJudgeToken = TOKEN;
    const fresh = setup();
    await fresh.bundled.onApplicationBootstrap();
    expect(fresh.created).toEqual([['bundled', sha256(TOKEN)]]);

    const same = setup({ id: 4, tokenHash: sha256(TOKEN) });
    await same.bundled.onApplicationBootstrap();
    expect([...same.created, ...same.rekeyed]).toEqual([]);

    const changed = setup({ id: 4, tokenHash: sha256('old') });
    await changed.bundled.onApplicationBootstrap();
    expect(changed.rekeyed).toEqual([[4, sha256(TOKEN)]]);
  });

  it('refuses a token too short to be a secret', async () => {
    config.bundledJudgeToken = 'short';
    await expect(setup().bundled.onApplicationBootstrap()).rejects.toThrow(/at least 32/);
  });
});
