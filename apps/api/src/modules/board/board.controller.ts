import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@skyoj/contract';
import type { Actor } from '../../common/actor.js';
import { CurrentActor } from '../../common/auth.guard.js';
import { BoardService } from './board.service.js';

const os = implement(contract.board);
const ok = { ok: true as const };

@Controller()
export class BoardController {
  constructor(private readonly boards: BoardService) {}

  @Implement(contract.board)
  routes(@CurrentActor() actor: Actor) {
    const { boards } = this;
    return {
      list: os.list.handler(({ input }) => boards.list(input)),
      get: os.get.handler(({ input }) => boards.get(actor, input.id)),
      create: os.create.handler(({ input }) => boards.create(actor, input)),
      update: os.update.handler(async ({ input: { id, ...patch } }) => {
        await boards.update(actor, id, patch);
        return ok;
      }),
      join: os.join.handler(async ({ input }) => {
        await boards.join(actor, input.id);
        return ok;
      }),
    };
  }
}
