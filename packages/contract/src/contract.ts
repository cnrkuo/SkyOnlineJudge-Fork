import { oc, populateContractRouterPaths } from '@orpc/contract';
import * as s from './schemas.js';
// `schemas.js` loads the ArkType configuration before `arktype` itself.
import { type } from 'arktype';

/** Errors every procedure may raise; services map domain errors onto these. */
const base = oc.errors({
  BAD_REQUEST: {},
  UNAUTHORIZED: {},
  FORBIDDEN: {},
  NOT_FOUND: {},
  CONFLICT: {},
  /** The write queue is down; safe to retry. */
  SERVICE_UNAVAILABLE: {},
});

const byId = type({ id: s.IdSchema });
const byProblem = type({ problemId: s.IdSchema });
const created = type({ id: 'number.integer' });

const auth = {
  register: base.input(s.RegisterInputSchema).output(s.AuthResultSchema),
  login: base.input(s.LoginInputSchema).output(s.AuthResultSchema),
  logout: base.output(s.OkSchema),
  /** Resolves the bearer token; `null` for guests. */
  me: base.output(s.SessionUserSchema.or('null')),
};

const user = {
  get: base.input(byId).output(s.UserProfileSchema),
  updateProfile: base.input(s.UpdateProfileInputSchema).output(s.SessionUserSchema),
  changePassword: base.input(s.ChangePasswordInputSchema).output(s.OkSchema),
};

const problem = {
  list: base
    .input(s.PageInputSchema.merge({ 'search?': 'string <= 100' }))
    .output(s.paged(s.ProblemSummarySchema)),
  get: base.input(byId).output(s.ProblemSchema),
  create: base.input(type({ title: s.ProblemTitleSchema })).output(created),
  update: base.input(s.ProblemUpdateInputSchema).output(s.OkSchema),
  stats: base.input(byId).output(s.ProblemStatsSchema),

  listTestcases: base.input(byProblem).output(s.TestcaseSchema.array()),
  /** Zip archive of `<name>.in` / `<name>.ans` (or `.out`) pairs; replaces all testcases. */
  uploadTestdata: base
    .input(type({ problemId: s.IdSchema, archive: s.FileSchema }))
    .output(type({ testcases: 'number.integer' })),
  clearTestdata: base.input(byProblem).output(s.OkSchema),

  listAttachments: base.input(byProblem).output(s.AttachmentSchema.array()),
  uploadAttachment: base
    .input(type({ problemId: s.IdSchema, file: s.FileSchema }))
    .output(s.AttachmentSchema),
  deleteAttachment: base
    .input(type({ problemId: s.IdSchema, name: s.AttachmentNameSchema }))
    .output(s.OkSchema),
  getAttachment: base
    .input(type({ problemId: s.IdSchema, name: s.AttachmentNameSchema }))
    .output(s.FileSchema),
};

const submission = {
  create: base.input(s.SubmitInputSchema).output(created),
  list: base.input(s.SubmissionListInputSchema).output(s.paged(s.SubmissionSummarySchema)),
  get: base.input(byId).output(s.SubmissionSchema),
  rejudge: base.input(byId).output(s.OkSchema),
  rejudgeProblem: base.input(byProblem).output(type({ count: 'number.integer' })),
  /** Judges' note on a submission; may also override the verdict by hand. */
  setComment: base
    .input(type({ id: s.IdSchema, comment: 'string <= 2000', 'verdict?': s.VerdictSchema }))
    .output(s.OkSchema),
};

const contest = {
  list: base.input(s.PageInputSchema).output(s.paged(s.ContestSummarySchema)),
  get: base.input(byId).output(s.ContestSchema),
  settings: base.input(byId).output(s.ContestSettingsSchema),
  create: base.input(s.ContestCreateInputSchema).output(created),
  update: base.input(s.ContestUpdateInputSchema).output(s.OkSchema),
  register: base
    .input(type({ id: s.IdSchema, 'password?': 'string <= 100' }))
    .output(type({ state: s.TeamStateSchema })),
  participants: base.input(byId).output(s.ParticipantSchema.array()),
  setParticipant: base
    .input(
      type({
        id: s.IdSchema,
        userId: s.IdSchema,
        state: s.TeamStateSchema,
        'note?': 'string <= 500',
      }),
    )
    .output(s.OkSchema),
  scoreboard: base.input(byId).output(s.ScoreboardSchema),
};

/** Training scoreboards: progress of a group of users on a problem set. */
const board = {
  list: base.input(s.PageInputSchema).output(s.paged(s.BoardSummarySchema)),
  get: base.input(byId).output(s.BoardSchema),
  create: base.input(s.BoardCreateInputSchema).output(created),
  update: base.input(s.BoardUpdateInputSchema).output(s.OkSchema),
  /** Adds the caller to a board that allows joining. */
  join: base.input(byId).output(s.OkSchema),
};

const codepad = {
  create: base.input(s.CodepadCreateInputSchema).output(type({ hash: 'string' })),
  get: base.input(type({ hash: 'string <= 32' })).output(s.CodepadSchema),
  mine: base.output(s.CodepadSchema.omit('content', 'owner').array()),
};

const admin = {
  listUsers: base
    .input(s.PageInputSchema.merge({ 'search?': 'string <= 100' }))
    .output(s.paged(s.AdminUserSchema)),
  setUserLevel: base
    .input(type({ userId: s.IdSchema, level: s.UserLevelSchema }))
    .output(s.OkSchema),
  updateUser: base.input(s.AdminUpdateUserInputSchema).output(s.OkSchema),
  listJudges: base.output(s.JudgeMachineSchema.array()),
  /** The plaintext token is returned exactly once. */
  createJudge: base
    .input(type({ name: type('string.trim').to('1 <= string <= 64') }))
    .output(type({ judge: s.JudgeMachineSchema, token: 'string' })),
  setJudgeEnabled: base
    .input(type({ id: s.IdSchema, enabled: 'boolean' }))
    .output(s.OkSchema),
  deleteJudge: base.input(byId).output(s.OkSchema),
};

/**
 * Protocol spoken by the C++ judge machines. Authenticated with a judge
 * token (`Authorization: Bearer <token>`), not a user session.
 */
const judge = {
  /**
   * Claims the next waiting submission in one of `languages` (the languages
   * this judge has a working toolchain for), or returns `{ task: null }`.
   * Without `languages`, any submission may be handed out.
   */
  fetch: base
    .input(type({ 'languages?': s.LanguageSchema.array().atMostLength(64) }))
    .output(type({ task: s.JudgeTaskSchema.or('null') })),
  /** Raw bytes of one testcase file. */
  testdata: base
    .input(type({ testcaseId: 'number.integer', kind: "'input' | 'output'" }))
    .output(s.FileSchema),
  report: base.input(s.JudgeReportInputSchema).output(s.OkSchema),
};

/**
 * The single source of truth for the HTTP API. Every procedure is exposed as
 * `POST /<namespace>/<name>`; the NestJS controllers implement it with
 * `@orpc/nest` and the web app consumes it through one typed client.
 */
export const contract = populateContractRouterPaths({
  auth,
  user,
  problem,
  submission,
  contest,
  board,
  codepad,
  admin,
  judge,
});

export type Contract = typeof contract;
