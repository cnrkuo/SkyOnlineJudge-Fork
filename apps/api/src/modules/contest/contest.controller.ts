import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@skyoj/contract';
import type { Actor } from '../../common/actor.js';
import { CurrentActor } from '../../common/auth.guard.js';
import { OK } from '../../common/orpc.js';
import { ContestService } from './contest.service.js';

const os = implement(contract.contest);

@Controller()
export class ContestController {
  constructor(private readonly contests: ContestService) {}

  @Implement(contract.contest)
  routes(@CurrentActor() actor: Actor) {
    return {
      list: os.list.handler(({ input }) => this.contests.list(input)),
      get: os.get.handler(({ input }) => this.contests.get(actor, input.id)),
      settings: os.settings.handler(({ input }) => this.contests.settings(actor, input.id)),
      create: os.create.handler(({ input }) => this.contests.create(actor, input)),
      update: os.update.handler(async ({ input: { id, ...patch } }) => {
        await this.contests.update(actor, id, patch);
        return OK;
      }),
      register: os.register.handler(({ input }) => this.contests.register(actor, input.id, input.password)),
      participants: os.participants.handler(({ input }) => this.contests.participants(actor, input.id)),
      setParticipant: os.setParticipant.handler(async ({ input }) => {
        await this.contests.setParticipant(actor, input.id, input.userId, input.state, input.note);
        return OK;
      }),
      scoreboard: os.scoreboard.handler(({ input }) => this.contests.scoreboard(actor, input.id)),
    };
  }
}
