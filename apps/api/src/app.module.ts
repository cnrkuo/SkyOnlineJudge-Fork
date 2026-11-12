import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ORPCModule } from '@orpc/nest';
import { AuthGuard } from './common/auth.guard.js';
import { orpcConfig } from './common/orpc.js';
import { DatabaseModule } from './database/database.module.js';
import { PersistenceModule } from './database/persistence.module.js';
import { MessagingModule } from './messaging/messaging.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { BoardModule } from './modules/board/board.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CodepadModule } from './modules/codepad/codepad.module.js';
import { ContestModule } from './modules/contest/contest.module.js';
import { JudgeModule } from './modules/judge/judge.module.js';
import { ProblemModule } from './modules/problem/problem.module.js';
import { SubmissionModule } from './modules/submission/submission.module.js';
import { UserModule } from './modules/user/user.module.js';
import { StorageModule } from './storage/storage.module.js';

/**
 * Layering: Controller (oRPC contract, transport) -> Service (business rules,
 * authorization) -> Repository (Drizzle queries). See docs/architecture.md.
 */
@Module({
  imports: [
    ORPCModule.forRoot(orpcConfig),
    DatabaseModule,
    PersistenceModule,
    StorageModule,
    MessagingModule,
    AuthModule,
    UserModule,
    ProblemModule,
    SubmissionModule,
    ContestModule,
    BoardModule,
    CodepadModule,
    AdminModule,
    JudgeModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
