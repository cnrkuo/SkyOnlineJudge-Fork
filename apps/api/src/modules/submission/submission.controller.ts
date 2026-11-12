import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@skyoj/contract';
import type { Actor } from '../../common/actor.js';
import { CurrentActor } from '../../common/auth.guard.js';
import { SubmissionService } from './submission.service.js';

const os = implement(contract.submission);
const ok = { ok: true as const };

@Controller()
export class SubmissionController {
  constructor(private readonly submissions: SubmissionService) {}

  @Implement(contract.submission)
  routes(@CurrentActor() actor: Actor) {
    const { submissions } = this;
    return {
      create: os.create.handler(({ input }) => submissions.create(actor, input)),
      list: os.list.handler(({ input }) => submissions.list(actor, input)),
      get: os.get.handler(({ input }) => submissions.get(actor, input.id)),
      rejudge: os.rejudge.handler(async ({ input }) => {
        await submissions.rejudge(actor, input.id);
        return ok;
      }),
      rejudgeProblem: os.rejudgeProblem.handler(({ input }) => submissions.rejudgeProblem(actor, input.problemId)),
      setComment: os.setComment.handler(async ({ input }) => {
        await submissions.setComment(actor, input.id, input.comment);
        return ok;
      }),
    };
  }
}
