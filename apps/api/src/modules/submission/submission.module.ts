import { Module } from '@nestjs/common';
import { ProblemModule } from '../problem/problem.module.js';
import { SubmissionController } from './submission.controller.js';
import { SubmissionService } from './submission.service.js';

@Module({ imports: [ProblemModule], controllers: [SubmissionController], providers: [SubmissionService] })
export class SubmissionModule {}
