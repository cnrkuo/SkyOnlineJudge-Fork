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
    return {
      create: os.create.handler(({ input }) => this.codepads.create(actor, input)),
      get: os.get.handler(({ input }) => this.codepads.get(input.hash)),
      mine: os.mine.handler(() => this.codepads.mine(actor)),
    };
  }
}
