import { describe, expect, it } from 'vitest';
import type { WriteCommand } from '../../messaging/commands.js';
import type { MessageBroker } from '../../messaging/message-broker.js';
import { Queue } from '../../messaging/message-broker.js';
import { fake } from '../../testing/fixtures.js';
import type { SubmissionResultService } from '../submission/result.service.js';
import type { SubmissionRepository } from '../submission/submission.repository.js';
import { WriteQueueConsumer } from './write-queue.consumer.js';

function setup() {
  const log: unknown[][] = [];
  let handler: (payload: unknown) => Promise<void> = async () => undefined;
  const consumer = new WriteQueueConsumer(
    fake<MessageBroker>({
      consume: (queue: string, _prefetch: number, h: typeof handler) => {
        log.push(['consume', queue]);
        handler = h;
      },
      publish: async (queue: string, message: unknown) => void log.push(['publish', queue, message]),
    }),
    fake<SubmissionRepository>({ insert: async (row: unknown) => void log.push(['insert', row]) }),
    fake<SubmissionResultService>({ record: async (...args: unknown[]) => void log.push(['record', ...args]) }),
  );
  consumer.onModuleInit();
  return { log, apply: (command: WriteCommand | { type: string }) => handler(command) };
}

describe('WriteQueueConsumer', () => {
  it('consumes the write queue', () => {
    expect(setup().log).toEqual([['consume', Queue.WRITES]]);
  });

  it('inserts a submission and only then queues it for a judge', async () => {
    const { log, apply } = setup();
    await apply({
      type: 'submission.create',
      id: 7,
      problemId: 1,
      userId: 2,
      language: 'c',
      code: 'x',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(log.slice(1)).toEqual([
      [
        'insert',
        { id: 7, problemId: 1, userId: 2, language: 'c', code: 'x', createdAt: new Date('2026-01-01T00:00:00Z') },
      ],
      ['publish', Queue.JUDGE, { submissionId: 7 }],
    ]);
  });

  it('hands judge results to the result service', async () => {
    const { log, apply } = setup();
    const report = { submissionId: 7, compileMessage: '', results: [] };
    await apply({ type: 'submission.result', judgeId: 3, report });
    expect(log.slice(1)).toEqual([['record', 3, report]]);
  });

  it('fails on unknown commands, so the broker retries and then dead-letters them', async () => {
    await expect(setup().apply({ type: 'submission.delete' })).rejects.toThrow(/Unknown write command/);
  });
});
