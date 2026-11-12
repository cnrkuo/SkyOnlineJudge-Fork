import { Module } from '@nestjs/common';
import { ContestController } from './contest.controller.js';
import { ContestService } from './contest.service.js';

@Module({ controllers: [ContestController], providers: [ContestService] })
export class ContestModule {}
