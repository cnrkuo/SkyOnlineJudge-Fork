import { Module } from '@nestjs/common';
import { ProblemController } from './problem.controller.js';
import { ProblemService } from './problem.service.js';

@Module({ controllers: [ProblemController], providers: [ProblemService], exports: [ProblemService] })
export class ProblemModule {}
