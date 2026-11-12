import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@skyoj/contract';
import type { Actor } from '../../common/actor.js';
import { CurrentActor } from '../../common/auth.guard.js';
import { AdminService } from './admin.service.js';

const os = implement(contract.admin);
const ok = { ok: true as const };

@Controller()
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Implement(contract.admin)
  routes(@CurrentActor() actor: Actor) {
    const { admin } = this;
    return {
      listUsers: os.listUsers.handler(({ input }) => admin.listUsers(actor, input)),
      setUserLevel: os.setUserLevel.handler(async ({ input }) => {
        await admin.setUserLevel(actor, input.userId, input.level);
        return ok;
      }),
      updateUser: os.updateUser.handler(async ({ input }) => {
        await admin.updateUser(actor, input);
        return ok;
      }),
      listJudges: os.listJudges.handler(() => admin.listJudges(actor)),
      createJudge: os.createJudge.handler(({ input }) => admin.createJudge(actor, input.name)),
      setJudgeEnabled: os.setJudgeEnabled.handler(async ({ input }) => {
        await admin.setJudgeEnabled(actor, input.id, input.enabled);
        return ok;
      }),
      deleteJudge: os.deleteJudge.handler(async ({ input }) => {
        await admin.deleteJudge(actor, input.id);
        return ok;
      }),
    };
  }
}
