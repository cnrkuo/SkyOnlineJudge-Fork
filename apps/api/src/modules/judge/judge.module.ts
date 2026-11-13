import { Module } from '@nestjs/common';
import { BundledJudge } from './bundled-judge.js';
import { JudgeController } from './judge.controller.js';
import { JudgeService } from './judge.service.js';
import { JudgeSweeper } from './judge.sweeper.js';
import { WriteQueueConsumer } from './write-queue.consumer.js';

@Module({ controllers: [JudgeController], providers: [BundledJudge, JudgeService, WriteQueueConsumer, JudgeSweeper] })
export class JudgeModule {}
