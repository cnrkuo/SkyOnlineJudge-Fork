import { Injectable, type OnModuleInit } from '@nestjs/common';
import { config } from '../../config.js';
import type { JudgeTaskMessage, WriteCommand } from '../../messaging/commands.js';
import { MessageBroker, Queue } from '../../messaging/message-broker.js';
import { SubmissionRepository } from '../submission/submission.repository.js';
import { JudgeService } from './judge.service.js';

/**
 * Applies queued writes to PostgreSQL.
 *
 * Request handlers only publish a command and return; this consumer is the
 * one place where submissions and judge results hit the database. RabbitMQ
 * delivers at most `DB_WRITE_CONCURRENCY` unacknowledged commands at a time,
 * so a burst of submissions becomes a queue backlog rather than a spike of
 * concurrent transactions.
 *
 * Every command is idempotent: the broker may deliver one twice.
 */
@Injectable()
export class WriteQueueConsumer implements OnModuleInit {
  constructor(
    private readonly broker: MessageBroker,
    private readonly submissions: SubmissionRepository,
    private readonly judge: JudgeService,
  ) {}

  onModuleInit(): void {
    this.broker.consume(Queue.WRITES, config.dbWriteConcurrency, (payload) => this.apply(payload as WriteCommand));
  }

  private async apply(command: WriteCommand): Promise<void> {
    switch (command.type) {
      case 'submission.create': {
        const { type: _, createdAt, ...row } = command;
        await this.submissions.insert({ ...row, createdAt: new Date(createdAt) });
        // Only now that the row exists may a judge pick it up.
        await this.broker.publish(Queue.JUDGE, { submissionId: command.id } satisfies JudgeTaskMessage);
        return;
      }
      case 'submission.result':
        await this.judge.applyReport(command.judgeId, command.report);
        return;
      default:
        throw new Error(`Unknown write command: ${JSON.stringify(command).slice(0, 200)}`);
    }
  }
}
