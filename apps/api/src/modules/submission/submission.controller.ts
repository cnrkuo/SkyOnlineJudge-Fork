import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@skyoj/contract';
import type { Actor } from '../../common/actor.js';
import { CurrentActor } from '../../common/auth.guard.js';
import { OK } from '../../common/orpc.js';
import { SubmissionService } from './submission.service.js';

const os = implement(contract.submission);

@Controller()
export class SubmissionController {
  constructor(private readonly submissions: SubmissionService) {}

  @Implement(contract.submission)
  routes(@CurrentActor() actor: Actor) {
    return {
      create: os.create.handler(({ input }) => this.submissions.create(actor, input)),
      list: os.list.handler(({ input }) => this.submissions.list(actor, input)),
      get: os.get.handler(({ input }) => this.submissions.get(actor, input.id)),
      rejudge: os.rejudge.handler(async ({ input }) => {
        await this.submissions.rejudge(actor, input.id);
        return OK;
      }),
      rejudgeProblem: os.rejudgeProblem.handler(({ input }) => this.submissions.rejudgeProblem(actor, input.problemId)),
      setComment: os.setComment.handler(async ({ input }) => {
        await this.submissions.setComment(actor, input.id, input.comment, input.verdict);
        return OK;
      }),
    };
  }
}
