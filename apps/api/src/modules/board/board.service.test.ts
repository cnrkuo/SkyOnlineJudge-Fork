import { Verdict } from '@skyoj/contract';
import { describe, expect, it } from 'vitest';
import { BadRequestError, ForbiddenError } from '../../common/errors.js';
import { admin, fake, user } from '../../testing/fixtures.js';
import type { ProblemRepository } from '../problem/problem.repository.js';
import type { UserRepository } from '../user/user.repository.js';
import type { BoardRepository } from './board.repository.js';
import { BoardService } from './board.service.js';

const board = { id: 1, title: 'Class', announce: '', allowJoin: true, startAt: new Date(0), endAt: new Date(1e12) };

function service(repo: Partial<Record<keyof BoardRepository, unknown>> = {}) {
  const created: unknown[][] = [];
  const boards = fake<BoardRepository>({
    findById: async () => ({ board, owner: { id: admin.id, nickname: admin.nickname } }),
    create: async (...args: unknown[]) => {
      created.push(args);
      return 4;
    },
    ...repo,
  });
  const users = fake<UserRepository>({
    findByIds: async (ids: number[]) => ids.filter((id) => id < 100).map((id) => ({ id })),
  });
  const problems = fake<ProblemRepository>({ missingIds: async (ids: number[]) => ids.filter((id) => id > 100) });
  return { service: new BoardService(boards, problems, users), created };
}

const input = {
  title: 'Class',
  announce: '',
  startAt: '2026-01-01T00:00:00Z',
  endAt: '2026-01-01T00:00:00Z',
  allowJoin: false,
  userIds: [1, 2],
  problems: [{ problemId: 1, note: '' }],
};

describe('BoardService.create', () => {
  it('accepts a window that starts and ends at the same moment', async () => {
    const { service: boards, created } = service();
    await expect(boards.create(admin, input)).resolves.toEqual({ id: 4 });
    expect(created[0]?.[1]).toEqual({ userIds: [1, 2], problems: input.problems });
  });

  it('rejects an end before the start, duplicates and unknown members', async () => {
    const boards = service().service;
    await expect(boards.create(admin, { ...input, endAt: '2025-12-31T00:00:00Z' })).rejects.toThrow(BadRequestError);
    await expect(boards.create(admin, { ...input, userIds: [1, 1] })).rejects.toThrow(/listed twice/);
    await expect(boards.create(admin, { ...input, userIds: [1, 404] })).rejects.toThrow(/User 404/);
    const problems = [{ problemId: 404, note: '' }];
    await expect(boards.create(admin, { ...input, problems })).rejects.toThrow(/Problem 404/);
  });
});

describe('BoardService.get', () => {
  it('ranks members by score, then solved problems, then id', async () => {
    const boards = service({
      listUsers: async () => [
        { id: 1, nickname: 'a' },
        { id: 2, nickname: 'b' },
        { id: 3, nickname: 'c' },
      ],
      listProblems: async () => [
        { problemId: 10, note: '' },
        { problemId: 11, note: '' },
      ],
      results: async () => [
        { userId: 1, problemId: 10, score: 100, verdict: Verdict.AC },
        { userId: 2, problemId: 10, score: 100, verdict: Verdict.AC },
        { userId: 2, problemId: 11, score: 50, verdict: Verdict.WA },
      ],
    }).service;
    const result = await boards.get(user, 1);
    expect(result.rows.map((row) => [row.user.id, row.score, row.accepted])).toEqual([
      [2, 150, 1],
      [1, 100, 1],
      [3, 0, 0],
    ]);
    expect(result.rows[2]?.cells).toEqual([
      { verdict: null, score: 0 },
      { verdict: null, score: 0 },
    ]);
    // `user` (id 1) is already a member.
    expect(result.canJoin).toBe(false);
  });
});

describe('BoardService.join', () => {
  it('adds the caller only where joining is allowed', async () => {
    const added: unknown[][] = [];
    await service({ addUser: async (...args: unknown[]) => void added.push(args) }).service.join(user, 1);
    expect(added).toEqual([[1, user.id]]);
    const closed = service({ findById: async () => ({ board: { ...board, allowJoin: false }, owner: {} }) }).service;
    await expect(closed.join(user, 1)).rejects.toThrow(ForbiddenError);
  });
});
