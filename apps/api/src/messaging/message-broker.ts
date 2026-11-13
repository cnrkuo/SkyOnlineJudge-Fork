import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import amqp, {
  type ChannelModel,
  type ConfirmChannel,
  type ConsumeMessage,
  type RecoveringChannelModel,
} from 'amqplib';
import { ServiceUnavailableError } from '../common/errors.js';
import { config } from '../config.js';

/** The queues this application owns. All are durable. */
export const Queue = {
  /** Database writes waiting to be applied, see `WriteQueueConsumer`. */
  WRITES: 'skyoj.writes',
  /** Submissions waiting for a judge machine. */
  JUDGE: 'skyoj.judge',
  /** Write commands that failed twice; kept for inspection. */
  DEAD: 'skyoj.dead',
} as const;
export type Queue = (typeof Queue)[keyof typeof Queue];

export type MessageHandler = (payload: unknown) => Promise<void>;

interface Consumer {
  queue: Queue;
  prefetch: number;
  handler: MessageHandler;
}

/** How long a publish waits for a broker connection before giving up. */
const CONNECT_WAIT_MS = 5000;

/**
 * Thin wrapper around RabbitMQ (AMQP 0-9-1).
 *
 * - `publish` resolves only after the broker has confirmed the message as
 *   persisted, so callers may treat a resolved publish as durable.
 * - `consume` runs a handler with bounded concurrency (`prefetch`). A message
 *   whose handler throws is retried once and then dead-lettered.
 * - The connection recovers by itself; topology and consumers are re-created
 *   after every reconnect.
 */
@Injectable()
export class MessageBroker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MessageBroker.name);
  private readonly consumers: Consumer[] = [];
  private connection?: RecoveringChannelModel;
  /** The live connection, while there is one. */
  private model?: ChannelModel;
  /** Publishes and pulls. Replaced after every reconnect. */
  private channel?: ConfirmChannel;
  private ready: Promise<void> = new Promise(() => undefined);
  private markReady: () => void = () => undefined;
  private closing = false;

  async onModuleInit(): Promise<void> {
    this.resetReady();
    this.connection = await amqp.connect(config.rabbitmqUrl, {
      recovery: {
        initialDelay: 500,
        maxDelay: 10_000,
        // Resolve immediately; the API starts even when the broker is down
        // and catches up once it is reachable.
        waitForConnect: false,
        setup: (model: ChannelModel) => this.setup(model),
      },
    });
    this.connection.on('disconnect', (error) => {
      if (this.closing) return;
      this.logger.warn(`Lost the RabbitMQ connection: ${error.message}`);
      this.channel = undefined;
      this.model = undefined;
      this.resetReady();
    });
    this.connection.on('connect-failed', (error) => this.logger.warn(`RabbitMQ is unreachable: ${error.message}`));
    this.connection.on('error', (error) => this.logger.error(`RabbitMQ error: ${error.message}`));
  }

  async onApplicationShutdown(): Promise<void> {
    this.closing = true;
    await this.connection?.close().catch(() => undefined);
  }

  private resetReady(): void {
    this.ready = new Promise((resolve) => {
      this.markReady = resolve;
    });
  }

  /** Runs after every (re)connect: declares queues and restarts consumers. */
  private async setup(model: ChannelModel): Promise<void> {
    const channel = await model.createConfirmChannel();
    channel.on('error', (error: Error) => this.logger.error(`RabbitMQ channel error: ${error.message}`));
    await channel.assertQueue(Queue.DEAD, { durable: true });
    await channel.assertQueue(Queue.WRITES, {
      durable: true,
      // Rejected messages move to the dead queue instead of vanishing.
      arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': Queue.DEAD },
    });
    await channel.assertQueue(Queue.JUDGE, { durable: true });

    for (const consumer of this.consumers) await this.startConsumer(model, consumer);
    this.model = model;
    this.channel = channel;
    this.markReady();
    this.logger.log('Connected to RabbitMQ');
  }

  /** Each consumer gets its own channel so its prefetch limit is its own. */
  private async startConsumer(model: ChannelModel, { queue, prefetch, handler }: Consumer): Promise<void> {
    const channel = await model.createChannel();
    channel.on('error', (error: Error) => this.logger.error(`RabbitMQ consumer error (${queue}): ${error.message}`));
    await channel.prefetch(prefetch);
    await channel.consume(queue, (message: ConsumeMessage | null) => {
      if (!message) return;
      void (async () => {
        try {
          await handler(JSON.parse(message.content.toString('utf8')));
          channel.ack(message);
        } catch (error) {
          const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
          if (message.fields.redelivered) {
            this.logger.error(`Dead-lettering a message from ${queue} after a second failure: ${detail}`);
            channel.nack(message, false, false);
          } else {
            this.logger.warn(`Retrying a message from ${queue}: ${detail}`);
            channel.nack(message, false, true);
          }
        }
      })();
    });
  }

  /** Waits briefly for a connection; fails with 503 when the broker stays away. */
  private async connected(): Promise<ConfirmChannel> {
    if (!this.channel) {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new ServiceUnavailableError('The message queue is unavailable')),
          CONNECT_WAIT_MS,
        );
      });
      await Promise.race([this.ready, timeout]).finally(() => clearTimeout(timer));
    }
    if (!this.channel) throw new ServiceUnavailableError('The message queue is unavailable');
    return this.channel;
  }

  /** Publishes a persistent message and waits for the broker's confirmation. */
  async publish(queue: Queue, payload: unknown): Promise<void> {
    const channel = await this.connected();
    await new Promise<void>((resolve, reject) => {
      channel.sendToQueue(
        queue,
        Buffer.from(JSON.stringify(payload)),
        { persistent: true, contentType: 'application/json' },
        (error) => (error ? reject(new ServiceUnavailableError('The message queue rejected the message')) : resolve()),
      );
    });
  }

  /**
   * Registers a long-running consumer. Call from `onModuleInit`; consumers
   * start once the broker is connected and restart after reconnects.
   */
  consume(queue: Queue, prefetch: number, handler: MessageHandler): void {
    const consumer = { queue, prefetch, handler };
    this.consumers.push(consumer);
    // Already connected (registration raced the connection): start it now.
    if (this.model) {
      void this.startConsumer(this.model, consumer).catch((error: Error) =>
        this.logger.error(`Cannot start the ${queue} consumer: ${error.message}`),
      );
    }
  }

  /** Takes one message off a queue, or `undefined` when it is empty. */
  async pull<T>(queue: Queue): Promise<T | undefined> {
    const channel = await this.connected();
    const message = await channel.get(queue, { noAck: true });
    return message ? (JSON.parse(message.content.toString('utf8')) as T) : undefined;
  }

  /** Number of messages waiting in a queue. */
  async depth(queue: Queue): Promise<number> {
    const channel = await this.connected();
    return (await channel.checkQueue(queue)).messageCount;
  }
}
