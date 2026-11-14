import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@skyoj/contract';
import type { Actor } from '../../common/actor.js';
import { CurrentActor } from '../../common/auth.guard.js';
import { OK } from '../../common/orpc.js';
import { UserService } from './user.service.js';

const os = implement(contract.user);

@Controller()
export class UserController {
  constructor(private readonly users: UserService) {}

  @Implement(contract.user)
  routes(@CurrentActor() actor: Actor) {
    return {
      get: os.get.handler(({ input }) => this.users.getProfile(input.id)),
      updateProfile: os.updateProfile.handler(({ input }) => this.users.updateProfile(actor, input)),
      changePassword: os.changePassword.handler(async ({ input }) => {
        await this.users.changePassword(actor, input.oldPassword, input.newPassword);
        return OK;
      }),
    };
  }
}
