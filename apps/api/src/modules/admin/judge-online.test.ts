import { describe, expect, it } from 'vitest';
import { admin, fake } from '../../testing/fixtures.js';
import type { SessionRepository } from '../auth/session.repository.js';
import type { JudgeRepository } from '../judge/judge.repository.js';
import type { UserRepository } from '../user/user.repository.js';
import { AdminService, JUDGE_ONLINE_WITHIN_MS } from './admin.service.js';

const judgeSeen = (msAgo: number | null) => ({
  id: 1,
  name: 'judge',
  enabled: true,
  languages: ['c', 'nonsense'],
  lastSeenAt: msAgo === null ? null : new Date(Date.now() - msAgo),
  createdAt: new Date(0),
});

const list = (msAgo: number | null) =>
  new AdminService(
    fake<UserRepository>({}),
    fake<SessionRepository>({}),
    fake<JudgeRepository>({ list: async () => [judgeSeen(msAgo)] }),
  ).listJudges(admin);

describe('judges online', () => {
  it('is decided on the API clock from the last poll', async () => {
    expect((await list(1000))[0]).toMatchObject({ online: true, languages: ['c'] });
    expect((await list(JUDGE_ONLINE_WITHIN_MS + 1000))[0]?.online).toBe(false);
    expect((await list(null))[0]?.online).toBe(false);
  });
});
