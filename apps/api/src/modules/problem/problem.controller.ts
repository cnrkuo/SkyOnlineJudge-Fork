import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@skyoj/contract';
import type { Actor } from '../../common/actor.js';
import { CurrentActor } from '../../common/auth.guard.js';
import { OK } from '../../common/orpc.js';
import { ProblemService } from './problem.service.js';

const os = implement(contract.problem);

@Controller()
export class ProblemController {
  constructor(private readonly problems: ProblemService) {}

  @Implement(contract.problem)
  routes(@CurrentActor() actor: Actor) {
    return {
      list: os.list.handler(({ input }) => this.problems.list(actor, input)),
      get: os.get.handler(({ input }) => this.problems.get(actor, input.id)),
      create: os.create.handler(({ input }) => this.problems.create(actor, input.title)),
      update: os.update.handler(async ({ input: { id, ...patch } }) => {
        await this.problems.update(actor, id, patch);
        return OK;
      }),
      stats: os.stats.handler(({ input }) => this.problems.stats(actor, input.id)),

      listTestcases: os.listTestcases.handler(({ input }) => this.problems.listTestcases(actor, input.problemId)),
      uploadTestdata: os.uploadTestdata.handler(({ input }) =>
        this.problems.uploadTestdata(actor, input.problemId, input.archive),
      ),
      clearTestdata: os.clearTestdata.handler(async ({ input }) => {
        await this.problems.clearTestdata(actor, input.problemId);
        return OK;
      }),

      listAttachments: os.listAttachments.handler(({ input }) => this.problems.listAttachments(actor, input.problemId)),
      uploadAttachment: os.uploadAttachment.handler(({ input }) =>
        this.problems.uploadAttachment(actor, input.problemId, input.file),
      ),
      deleteAttachment: os.deleteAttachment.handler(async ({ input }) => {
        await this.problems.deleteAttachment(actor, input.problemId, input.name);
        return OK;
      }),
      getAttachment: os.getAttachment.handler(({ input }) =>
        this.problems.getAttachment(actor, input.problemId, input.name),
      ),
    };
  }
}
