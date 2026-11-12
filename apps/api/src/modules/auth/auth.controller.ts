import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@skyoj/contract';
import { isLoggedIn, type Actor } from '../../common/actor.js';
import { BearerToken, CurrentActor } from '../../common/auth.guard.js';
import { AuthService } from './auth.service.js';

const os = implement(contract.auth);

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Implement(contract.auth)
  routes(@CurrentActor() actor: Actor, @BearerToken() token: string | undefined) {
    return {
      register: os.register.handler(({ input }) => this.auth.register(input)),
      login: os.login.handler(({ input }) => this.auth.login(input)),
      logout: os.logout.handler(async () => {
        await this.auth.logout(token);
        return { ok: true as const };
      }),
      me: os.me.handler(() => (isLoggedIn(actor) ? actor : null)),
    };
  }
}
