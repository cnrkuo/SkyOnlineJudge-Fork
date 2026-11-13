import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@skyoj/contract';
import type { Actor } from '../../common/actor.js';
import { CurrentActor } from '../../common/auth.guard.js';
import { OK } from '../../common/orpc.js';
import { AdminService } from './admin.service.js';

const os = implement(contract.admin);

@Controller()
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Implement(contract.admin)
  routes(@CurrentActor() actor: Actor) {
    return {
      listUsers: os.listUsers.handler(({ input }) => this.admin.listUsers(actor, input)),
      setUserLevel: os.setUserLevel.handler(async ({ input }) => {
        await this.admin.setUserLevel(actor, input.userId, input.level);
        return OK;
      }),
      updateUser: os.updateUser.handler(async ({ input }) => {
        await this.admin.updateUser(actor, input);
        return OK;
      }),
      listJudges: os.listJudges.handler(() => this.admin.listJudges(actor)),
      createJudge: os.createJudge.handler(({ input }) => this.admin.createJudge(actor, input.name)),
      setJudgeEnabled: os.setJudgeEnabled.handler(async ({ input }) => {
        await this.admin.setJudgeEnabled(actor, input.id, input.enabled);
        return OK;
      }),
      deleteJudge: os.deleteJudge.handler(async ({ input }) => {
        await this.admin.deleteJudge(actor, input.id);
        return OK;
      }),
    };
  }
}
