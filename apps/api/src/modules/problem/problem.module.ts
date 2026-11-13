import { Module } from '@nestjs/common';
import { AttachmentService } from './attachment.service.js';
import { ProblemController } from './problem.controller.js';
import { ProblemService } from './problem.service.js';
import { TestdataService } from './testdata.service.js';

@Module({
  controllers: [ProblemController],
  providers: [ProblemService, TestdataService, AttachmentService],
  exports: [ProblemService],
})
export class ProblemModule {}
