import { Module } from '@nestjs/common';
import { SubmissionModule } from '../submission/submission.module.js';
import { BundledJudge } from './bundled-judge.js';
import { JudgeController } from './judge.controller.js';
import { JudgeService } from './judge.service.js';
import { JudgeSweeper } from './judge.sweeper.js';
import { WriteQueueConsumer } from './write-queue.consumer.js';

@Module({
  imports: [SubmissionModule],
  controllers: [JudgeController],
  providers: [BundledJudge, JudgeService, WriteQueueConsumer, JudgeSweeper],
})
export class JudgeModule {}
