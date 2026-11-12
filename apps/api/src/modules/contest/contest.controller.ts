import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@skyoj/contract';
import type { Actor } from '../../common/actor.js';
import { CurrentActor } from '../../common/auth.guard.js';
import { ContestService } from './contest.service.js';

const os = implement(contract.contest);
const ok = { ok: true as const };

@Controller()
export class ContestController {
  constructor(private readonly contests: ContestService) {}

  @Implement(contract.contest)
  routes(@CurrentActor() actor: Actor) {
    const { contests } = this;
    return {
      list: os.list.handler(({ input }) => contests.list(input)),
      get: os.get.handler(({ input }) => contests.get(actor, input.id)),
      settings: os.settings.handler(({ input }) => contests.settings(actor, input.id)),
      create: os.create.handler(({ input }) => contests.create(actor, input)),
      update: os.update.handler(async ({ input: { id, ...patch } }) => {
        await contests.update(actor, id, patch);
        return ok;
      }),
      register: os.register.handler(({ input }) => contests.register(actor, input.id, input.password)),
      participants: os.participants.handler(({ input }) => contests.participants(actor, input.id)),
      setParticipant: os.setParticipant.handler(async ({ input }) => {
        await contests.setParticipant(actor, input.id, input.userId, input.state, input.note);
        return ok;
      }),
      scoreboard: os.scoreboard.handler(({ input }) => contests.scoreboard(actor, input.id)),
    };
  }
}
