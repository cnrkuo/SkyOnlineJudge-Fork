import { Global, Module } from '@nestjs/common';
import { SessionRepository } from '../modules/auth/session.repository.js';
import { CodepadRepository } from '../modules/codepad/codepad.repository.js';
import { ContestRepository } from '../modules/contest/contest.repository.js';
import { JudgeRepository } from '../modules/judge/judge.repository.js';
import { ProblemRepository } from '../modules/problem/problem.repository.js';
import { SubmissionRepository } from '../modules/submission/submission.repository.js';
import { UserRepository } from '../modules/user/user.repository.js';

const repositories = [
  UserRepository,
  SessionRepository,
  ProblemRepository,
  SubmissionRepository,
  ContestRepository,
  CodepadRepository,
  JudgeRepository,
];

/**
 * The repository layer. Repositories are the only classes that touch the
 * database. The module is global so any service can depend on any repository
 * without creating import cycles between feature modules.
 */
@Global()
@Module({ providers: repositories, exports: repositories })
export class PersistenceModule {}
