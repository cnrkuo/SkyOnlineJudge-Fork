import { Module } from '@nestjs/common';
import { JudgeController } from './judge.controller.js';
import { JudgeService } from './judge.service.js';

@Module({ controllers: [JudgeController], providers: [JudgeService] })
export class JudgeModule {}
