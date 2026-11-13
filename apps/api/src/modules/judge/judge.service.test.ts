import { describe, expect, it } from 'vitest';
import { Verdict } from '@skyoj/contract';
import type { JudgeTaskMessage } from '../../messaging/commands.js';
import type { MessageBroker } from '../../messaging/message-broker.js';
import type { ProblemRepository } from '../problem/problem.repository.js';
import type { SubmissionRepository } from '../submission/submission.repository.js';
import type { StorageService } from '../../storage/storage.service.js';
import type { JudgeRepository, JudgeRow } from './judge.repository.js';
import { JudgeService } from './judge.service.js';

/** In-memory stand-ins for the queue and the tables `fetch` touches. */
function setup(waiting: { id: number; language: string }[]) {
  const queue: JudgeTaskMessage[] = waiting.map(({ id }) => ({ submissionId: id }));
  const rows = new Map(waiting.map((s) => [s.id, { ...s, problemId: 1, code: '', verdict: Verdict.WAIT as number }]));
  const seen: { judgeId: number; languages?: readonly string[] }[] = [];

  const broker = {
    pull: async () => queue.shift(),
    publish: async (_queue: string, task: JudgeTaskMessage) => void queue.push(task),
  } as unknown as MessageBroker;
  const submissions = {
    claim: async (id: number, _judge: number, languages?: readonly string[]) => {
      const row = rows.get(id);
      if (!row || row.verdict !== Verdict.WAIT || (languages && !languages.includes(row.language))) return undefined;
      row.verdict = Verdict.JUDGING;
      return row;
    },
    isWaiting: async (id: number) => rows.get(id)?.verdict === Verdict.WAIT,
  } as unknown as SubmissionRepository;
  const judges = {
    touch: async (judgeId: number, languages?: readonly string[]) => void seen.push({ judgeId, languages }),
  } as unknown as JudgeRepository;
  const problems = {
    findById: async () => ({ problem: { timeLimitMs: 1000, memoryLimitKb: 65536 } }),
    listTestcases: async () => [],
  } as unknown as ProblemRepository;

  const service = new JudgeService(judges, submissions, problems, {} as StorageService, broker);
  return { service, queue, seen };
}

const judge = { id: 7 } as JudgeRow;
const ids = (queue: JudgeTaskMessage[]) => queue.map((t) => t.submissionId);

describe('JudgeService.fetch', () => {
  it('hands out the oldest submission when the judge does not list languages', async () => {
    const { service, queue } = setup([{ id: 1, language: 'clang-cpp23' }, { id: 2, language: 'cpp' }]);
    expect((await service.fetch(judge)).task?.submissionId).toBe(1);
    expect(ids(queue)).toEqual([2]);
  });

  it('skips submissions in languages the judge cannot run and keeps them queued', async () => {
    const { service, queue, seen } = setup([
      { id: 1, language: 'clang-cpp23' },
      { id: 2, language: 'clang-cpp17' },
      { id: 3, language: 'cpp' },
    ]);
    expect((await service.fetch(judge, ['c', 'cpp'])).task?.submissionId).toBe(3);
    expect(ids(queue)).toEqual([1, 2]);
    expect(seen).toEqual([{ judgeId: 7, languages: ['c', 'cpp'] }]);
  });

  it('stops after one pass over a queue with nothing it can run, losing no task', async () => {
    const { service, queue } = setup([{ id: 1, language: 'clang-cpp23' }, { id: 2, language: 'clang-cpp17' }]);
    expect((await service.fetch(judge, ['cpp'])).task).toBeNull();
    expect(ids(queue).sort()).toEqual([1, 2]);
  });

  it('drops tasks for submissions that are no longer waiting', async () => {
    const { service, queue } = setup([{ id: 1, language: 'cpp' }]);
    await service.fetch(judge, ['cpp']);
    queue.push({ submissionId: 1 }); // duplicate task
    expect((await service.fetch(judge, ['cpp'])).task).toBeNull();
    expect(queue).toEqual([]);
  });
});
