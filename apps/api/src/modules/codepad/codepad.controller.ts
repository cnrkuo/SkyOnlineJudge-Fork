import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@skyoj/contract';
import type { Actor } from '../../common/actor.js';
import { CurrentActor } from '../../common/auth.guard.js';
import { CodepadService } from './codepad.service.js';

const os = implement(contract.codepad);

@Controller()
export class CodepadController {
  constructor(private readonly codepads: CodepadService) {}

  @Implement(contract.codepad)
  routes(@CurrentActor() actor: Actor) {
    const { codepads } = this;
    return {
      create: os.create.handler(({ input }) => codepads.create(actor, input)),
      get: os.get.handler(({ input }) => codepads.get(input.hash)),
      mine: os.mine.handler(() => codepads.mine(actor)),
    };
  }
}
