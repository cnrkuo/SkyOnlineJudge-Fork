import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@skyoj/contract';
import { BearerToken } from '../../common/auth.guard.js';
import { OK } from '../../common/orpc.js';
import { JudgeService } from './judge.service.js';

const os = implement(contract.judge);

/** Endpoints called by the C++ judge machines. */
@Controller()
export class JudgeController {
  constructor(private readonly judge: JudgeService) {}

  @Implement(contract.judge)
  routes(@BearerToken() token: string | undefined) {
    return {
      fetch: os.fetch.handler(async ({ input }) =>
        this.judge.fetch(await this.judge.authenticate(token), input.languages),
      ),
      testdata: os.testdata.handler(async ({ input }) => {
        await this.judge.authenticate(token);
        return this.judge.testdata(input.testcaseId, input.kind);
      }),
      report: os.report.handler(async ({ input }) => {
        await this.judge.report(await this.judge.authenticate(token), input);
        return OK;
      }),
    };
  }
}
