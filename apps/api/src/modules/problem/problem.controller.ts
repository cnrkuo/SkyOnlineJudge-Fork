import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@skyoj/contract';
import type { Actor } from '../../common/actor.js';
import { CurrentActor } from '../../common/auth.guard.js';
import { ProblemService } from './problem.service.js';

const os = implement(contract.problem);
const ok = { ok: true as const };

@Controller()
export class ProblemController {
  constructor(private readonly problems: ProblemService) {}

  @Implement(contract.problem)
  routes(@CurrentActor() actor: Actor) {
    const { problems } = this;
    return {
      list: os.list.handler(({ input }) => problems.list(actor, input)),
      get: os.get.handler(({ input }) => problems.get(actor, input.id)),
      create: os.create.handler(({ input }) => problems.create(actor, input.title)),
      update: os.update.handler(async ({ input: { id, ...patch } }) => {
        await problems.update(actor, id, patch);
        return ok;
      }),
      stats: os.stats.handler(({ input }) => problems.stats(actor, input.id)),

      listTestcases: os.listTestcases.handler(({ input }) => problems.listTestcases(actor, input.problemId)),
      uploadTestdata: os.uploadTestdata.handler(({ input }) =>
        problems.uploadTestdata(actor, input.problemId, input.archive),
      ),
      clearTestdata: os.clearTestdata.handler(async ({ input }) => {
        await problems.clearTestdata(actor, input.problemId);
        return ok;
      }),

      listAttachments: os.listAttachments.handler(({ input }) => problems.listAttachments(actor, input.problemId)),
      uploadAttachment: os.uploadAttachment.handler(({ input }) =>
        problems.uploadAttachment(actor, input.problemId, input.file),
      ),
      deleteAttachment: os.deleteAttachment.handler(async ({ input }) => {
        await problems.deleteAttachment(actor, input.problemId, input.name);
        return ok;
      }),
      getAttachment: os.getAttachment.handler(({ input }) =>
        problems.getAttachment(actor, input.problemId, input.name),
      ),
    };
  }
}
