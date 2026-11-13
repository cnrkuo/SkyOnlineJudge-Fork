import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@skyoj/contract';
import type { Actor } from '../../common/actor.js';
import { CurrentActor } from '../../common/auth.guard.js';
import { OK } from '../../common/orpc.js';
import { BoardService } from './board.service.js';

const os = implement(contract.board);

@Controller()
export class BoardController {
  constructor(private readonly boards: BoardService) {}

  @Implement(contract.board)
  routes(@CurrentActor() actor: Actor) {
    return {
      list: os.list.handler(({ input }) => this.boards.list(input)),
      get: os.get.handler(({ input }) => this.boards.get(actor, input.id)),
      create: os.create.handler(({ input }) => this.boards.create(actor, input)),
      update: os.update.handler(async ({ input: { id, ...patch } }) => {
        await this.boards.update(actor, id, patch);
        return OK;
      }),
      join: os.join.handler(async ({ input }) => {
        await this.boards.join(actor, input.id);
        return OK;
      }),
    };
  }
}
