import { describe, expect, it } from 'vitest';
import type { MessageBroker } from '../../messaging/message-broker.js';
import { Queue } from '../../messaging/message-broker.js';
import { fake } from '../../testing/fixtures.js';
import type { SubmissionRepository } from '../submission/submission.repository.js';
import { JudgeSweeper } from './judge.sweeper.js';

function setup(queueDepth: number, stale: number[], waiting: number[]) {
  const published: unknown[] = [];
  const sweeper = new JudgeSweeper(
    fake<MessageBroker>({
      depth: async () => queueDepth,
      publish: async (queue: string, message: unknown) => void published.push([queue, message]),
    }),
    fake<SubmissionRepository>({ releaseStale: async () => stale, waitingIds: async () => waiting }),
  );
  return { sweeper, published };
}

describe('JudgeSweeper.sweep', () => {
  it('requeues submissions whose judge went silent', async () => {
    const { sweeper, published } = setup(3, [8], [1, 2]);
    await sweeper.sweep();
    // The queue still holds tasks, so waiting submissions are not orphans.
    expect(published).toEqual([[Queue.JUDGE, { submissionId: 8 }]]);
  });

  it('requeues waiting submissions once the queue is empty, each once, oldest first', async () => {
    const { sweeper, published } = setup(0, [5], [5, 2]);
    await sweeper.sweep();
    expect(published).toEqual([
      [Queue.JUDGE, { submissionId: 2 }],
      [Queue.JUDGE, { submissionId: 5 }],
    ]);
  });

  it('survives a broker or database outage', async () => {
    const sweeper = new JudgeSweeper(
      fake<MessageBroker>({}),
      fake<SubmissionRepository>({
        releaseStale: async () => {
          throw new Error('connection refused');
        },
      }),
    );
    await expect(sweeper.sweep()).resolves.toBeUndefined();
  });
});
