import { Module } from '@nestjs/common';
import { JudgeController } from './judge.controller.js';
import { JudgeService } from './judge.service.js';
import { JudgeSweeper } from './judge.sweeper.js';
import { WriteQueueConsumer } from './write-queue.consumer.js';

@Module({ controllers: [JudgeController], providers: [JudgeService, WriteQueueConsumer, JudgeSweeper] })
export class JudgeModule {}
