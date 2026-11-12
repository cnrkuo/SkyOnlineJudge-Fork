import { oc, populateContractRouterPaths } from '@orpc/contract';
import * as z from 'zod';
import * as s from './schemas.js';

/** Errors every procedure may raise; services map domain errors onto these. */
const base = oc.errors({
  BAD_REQUEST: {},
  UNAUTHORIZED: {},
  FORBIDDEN: {},
  NOT_FOUND: {},
  CONFLICT: {},
});

const byId = z.object({ id: s.IdSchema });
const byProblem = z.object({ problemId: s.IdSchema });
const created = z.object({ id: z.number().int() });

const auth = {
  register: base.input(s.RegisterInputSchema).output(s.AuthResultSchema),
  login: base.input(s.LoginInputSchema).output(s.AuthResultSchema),
  logout: base.output(s.OkSchema),
  /** Resolves the bearer token; `null` for guests. */
  me: base.output(s.SessionUserSchema.nullable()),
};

const user = {
  get: base.input(byId).output(s.UserProfileSchema),
  updateProfile: base.input(s.UpdateProfileInputSchema).output(s.SessionUserSchema),
  changePassword: base.input(s.ChangePasswordInputSchema).output(s.OkSchema),
};

const problem = {
  list: base
    .input(s.PageInputSchema.extend({ search: z.string().max(100).optional() }))
    .output(s.paged(s.ProblemSummarySchema)),
  get: base.input(byId).output(s.ProblemSchema),
  create: base.input(z.object({ title: z.string().trim().min(1).max(200) })).output(created),
  update: base.input(s.ProblemUpdateInputSchema).output(s.OkSchema),
  stats: base.input(byId).output(s.ProblemStatsSchema),

  listTestcases: base.input(byProblem).output(z.array(s.TestcaseSchema)),
  /** Zip archive of `<name>.in` / `<name>.ans` (or `.out`) pairs; replaces all testcases. */
  uploadTestdata: base
    .input(z.object({ problemId: s.IdSchema, archive: z.file() }))
    .output(z.object({ testcases: z.number().int() })),
  clearTestdata: base.input(byProblem).output(s.OkSchema),

  listAttachments: base.input(byProblem).output(z.array(s.AttachmentSchema)),
  uploadAttachment: base
    .input(z.object({ problemId: s.IdSchema, file: z.file() }))
    .output(s.AttachmentSchema),
  deleteAttachment: base
    .input(z.object({ problemId: s.IdSchema, name: s.AttachmentNameSchema }))
    .output(s.OkSchema),
  getAttachment: base
    .input(z.object({ problemId: s.IdSchema, name: s.AttachmentNameSchema }))
    .output(z.file()),
};

const submission = {
  create: base.input(s.SubmitInputSchema).output(created),
  list: base.input(s.SubmissionListInputSchema).output(s.paged(s.SubmissionSummarySchema)),
  get: base.input(byId).output(s.SubmissionSchema),
  rejudge: base.input(byId).output(s.OkSchema),
  rejudgeProblem: base.input(byProblem).output(z.object({ count: z.number().int() })),
  /** Judges' note on a submission; may also override the verdict by hand. */
  setComment: base
    .input(z.object({ id: s.IdSchema, comment: z.string().max(2000), verdict: s.VerdictSchema.optional() }))
    .output(s.OkSchema),
};

const contest = {
  list: base.input(s.PageInputSchema).output(s.paged(s.ContestSummarySchema)),
  get: base.input(byId).output(s.ContestSchema),
  settings: base.input(byId).output(s.ContestSettingsSchema),
  create: base.input(s.ContestCreateInputSchema).output(created),
  update: base.input(s.ContestUpdateInputSchema).output(s.OkSchema),
  register: base
    .input(z.object({ id: s.IdSchema, password: z.string().max(100).optional() }))
    .output(z.object({ state: s.TeamStateSchema })),
  participants: base.input(byId).output(z.array(s.ParticipantSchema)),
  setParticipant: base
    .input(
      z.object({
        id: s.IdSchema,
        userId: s.IdSchema,
        state: s.TeamStateSchema,
        note: z.string().max(500).optional(),
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
  create: base.input(s.CodepadCreateInputSchema).output(z.object({ hash: z.string() })),
  get: base.input(z.object({ hash: z.string().max(32) })).output(s.CodepadSchema),
  mine: base.output(z.array(s.CodepadSchema.omit({ content: true, owner: true }))),
};

const admin = {
  listUsers: base
    .input(s.PageInputSchema.extend({ search: z.string().max(100).optional() }))
    .output(s.paged(s.AdminUserSchema)),
  setUserLevel: base
    .input(z.object({ userId: s.IdSchema, level: s.UserLevelSchema }))
    .output(s.OkSchema),
  updateUser: base.input(s.AdminUpdateUserInputSchema).output(s.OkSchema),
  listJudges: base.output(z.array(s.JudgeMachineSchema)),
  /** The plaintext token is returned exactly once. */
  createJudge: base
    .input(z.object({ name: z.string().trim().min(1).max(64) }))
    .output(z.object({ judge: s.JudgeMachineSchema, token: z.string() })),
  setJudgeEnabled: base
    .input(z.object({ id: s.IdSchema, enabled: z.boolean() }))
    .output(s.OkSchema),
  deleteJudge: base.input(byId).output(s.OkSchema),
};

/**
 * Protocol spoken by the C++ judge machines. Authenticated with a judge
 * token (`Authorization: Bearer <token>`), not a user session.
 */
const judge = {
  /** Claims the oldest waiting submission, or returns `{ task: null }`. */
  fetch: base.output(z.object({ task: s.JudgeTaskSchema.nullable() })),
  /** Raw bytes of one testcase file. */
  testdata: base
    .input(z.object({ testcaseId: z.number().int(), kind: z.literal(['input', 'output']) }))
    .output(z.file()),
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
