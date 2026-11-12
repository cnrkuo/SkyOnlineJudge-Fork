import * as z from 'zod';
import {
  AccessLevel,
  CODE_MAX_LENGTH,
  ContestPhase,
  ContestProblemState,
  ContestStyle,
  Language,
  RegisterType,
  ScoreMode,
  TeamState,
  UserLevel,
  Verdict,
} from './enums.js';

/** Builds a zod literal-union from one of the `as const` enum objects. */
function valuesOf<const T extends Record<string, string | number>>(obj: T) {
  return z.literal(Object.values(obj) as T[keyof T][]);
}

export const UserLevelSchema = valuesOf(UserLevel);
export const AccessLevelSchema = valuesOf(AccessLevel);
export const VerdictSchema = valuesOf(Verdict);
export const LanguageSchema = valuesOf(Language);
export const ScoreModeSchema = valuesOf(ScoreMode);
export const ContestStyleSchema = valuesOf(ContestStyle);
export const RegisterTypeSchema = valuesOf(RegisterType);
export const TeamStateSchema = valuesOf(TeamState);
export const ContestProblemStateSchema = valuesOf(ContestProblemState);
export const ContestPhaseSchema = valuesOf(ContestPhase);

// ---------------------------------------------------------------- primitives

/**
 * Identifier. Coerced because multipart/form-data requests (file uploads)
 * transport every field as a string.
 */
export const IdSchema = z.coerce.number().int().positive();
/** ISO-8601 timestamp. Dates always travel as strings over the wire. */
export const TimestampSchema = z.iso.datetime({ offset: true });

export const PageInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export function paged<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  });
}

export const OkSchema = z.object({ ok: z.literal(true) });

// ---------------------------------------------------------------------- user

export const NicknameSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[^\s@<>&"'\\/]+$/u, 'Nickname contains forbidden characters');
export const PasswordSchema = z.string().min(6).max(128);

export const UserRefSchema = z.object({
  id: z.number().int(),
  nickname: z.string(),
});

export const SessionUserSchema = UserRefSchema.extend({
  email: z.string(),
  level: UserLevelSchema,
});

export const UserProfileSchema = UserRefSchema.extend({
  level: UserLevelSchema,
  realname: z.string().nullable(),
  quote: z.string().nullable(),
  quoteRef: z.string().nullable(),
  /** The user's own picture, or their Gravatar when none is set. */
  avatarUrl: z.string().nullable(),
  createdAt: TimestampSchema,
  stats: z.object({
    submissions: z.number().int(),
    accepted: z.number().int(),
    solvedProblemIds: z.array(z.number().int()),
    triedProblemIds: z.array(z.number().int()),
  }),
});

export const AdminUserSchema = SessionUserSchema.extend({
  realname: z.string().nullable(),
  createdAt: TimestampSchema,
});

export const RegisterInputSchema = z.object({
  email: z.email().max(64),
  nickname: NicknameSchema,
  password: PasswordSchema,
});

export const LoginInputSchema = z.object({
  /** E-mail address or nickname. */
  identifier: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

export const AuthResultSchema = z.object({
  /** Opaque bearer token; the web server keeps it in an http-only cookie. */
  token: z.string(),
  user: SessionUserSchema,
});

export const UpdateProfileInputSchema = z.object({
  nickname: NicknameSchema.optional(),
  realname: z.string().max(30).nullable().optional(),
  quote: z.string().max(500).nullable().optional(),
  quoteRef: z.string().max(80).nullable().optional(),
  avatarUrl: z.url().max(500).nullable().optional(),
});

/** Administrators editing someone else's account; no old password needed. */
export const AdminUpdateUserInputSchema = z.object({
  userId: IdSchema,
  nickname: NicknameSchema.optional(),
  realname: z.string().max(30).nullable().optional(),
  newPassword: PasswordSchema.optional(),
});

export const ChangePasswordInputSchema = z.object({
  oldPassword: z.string().max(128),
  newPassword: PasswordSchema,
});

// ------------------------------------------------------------------- problem

/** `[[groupScore, testcaseCount], ...]` — see ScoreMode.GROUP_MIN. */
export const ScoreGroupsSchema = z.array(
  z.tuple([z.number().min(0), z.number().int().min(1)]),
);

export const ProblemSummarySchema = z.object({
  id: z.number().int(),
  title: z.string(),
  contentAccess: AccessLevelSchema,
  acceptedUsers: z.number().int(),
  /** Accepted submissions; with `submissions` this gives the AC rate. */
  accepted: z.number().int(),
  submissions: z.number().int(),
  /** Best verdict of the current user on this problem, if any. */
  myVerdict: VerdictSchema.nullable(),
});

export const ProblemSchema = z.object({
  id: z.number().int(),
  owner: UserRefSchema,
  title: z.string(),
  /** Markdown statement. */
  content: z.string(),
  contentAccess: AccessLevelSchema,
  submitOpen: z.boolean(),
  codeviewAccess: AccessLevelSchema,
  timeLimitMs: z.number().int(),
  memoryLimitKb: z.number().int(),
  scoreMode: ScoreModeSchema,
  scoreGroups: ScoreGroupsSchema,
  testcaseCount: z.number().int(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  canEdit: z.boolean(),
  canSubmit: z.boolean(),
});

export const ProblemUpdateInputSchema = z.object({
  id: IdSchema,
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().max(200_000).optional(),
  contentAccess: AccessLevelSchema.optional(),
  submitOpen: z.boolean().optional(),
  codeviewAccess: AccessLevelSchema.optional(),
  timeLimitMs: z.number().int().min(100).max(60_000).optional(),
  memoryLimitKb: z.number().int().min(4096).max(4_194_304).optional(),
  scoreMode: ScoreModeSchema.optional(),
  scoreGroups: ScoreGroupsSchema.optional(),
});

export const TestcaseSchema = z.object({
  id: z.number().int(),
  /** Zero-based position; testcases run in this order. */
  ordinal: z.number().int(),
  name: z.string(),
  inputSize: z.number().int(),
  outputSize: z.number().int(),
});

export const AttachmentSchema = z.object({
  name: z.string(),
  size: z.number().int(),
});
export const AttachmentNameSchema = z.string().regex(/^[a-zA-Z0-9._-]{1,64}$/);

export const ProblemStatsSchema = z.object({
  verdicts: z.array(z.object({ verdict: VerdictSchema, count: z.number().int() })),
  fastest: z.array(
    z.object({
      submissionId: z.number().int(),
      user: UserRefSchema,
      timeMs: z.number().int(),
      memoryKb: z.number().int(),
      language: LanguageSchema,
    }),
  ),
});

// ---------------------------------------------------------------- submission

export const SubmissionSummarySchema = z.object({
  id: z.number().int(),
  problem: z.object({ id: z.number().int(), title: z.string() }),
  user: UserRefSchema,
  language: LanguageSchema,
  verdict: VerdictSchema,
  score: z.number(),
  timeMs: z.number().int(),
  memoryKb: z.number().int(),
  createdAt: TimestampSchema,
});

export const TestResultSchema = z.object({
  testcaseId: z.number().int(),
  ordinal: z.number().int(),
  verdict: VerdictSchema,
  timeMs: z.number().int(),
  memoryKb: z.number().int(),
  /** 0..1 fraction awarded by the checker. */
  score: z.number(),
  message: z.string(),
});

export const SubmissionSchema = SubmissionSummarySchema.extend({
  /** `null` when the viewer may not read the source code. */
  code: z.string().nullable(),
  compileMessage: z.string(),
  comment: z.string(),
  results: z.array(TestResultSchema),
  judgedAt: TimestampSchema.nullable(),
  canRejudge: z.boolean(),
});

export const SubmitInputSchema = z.object({
  problemId: IdSchema,
  language: LanguageSchema,
  code: z.string().min(1).max(CODE_MAX_LENGTH),
});

export const SubmissionListInputSchema = PageInputSchema.extend({
  problemId: IdSchema.optional(),
  userId: IdSchema.optional(),
  verdict: VerdictSchema.optional(),
});

// ------------------------------------------------------------------- contest

export const ContestProblemSchema = z.object({
  problemId: z.number().int(),
  /** Short label shown on the scoreboard, e.g. "A". */
  tag: z.string(),
  title: z.string(),
  state: ContestProblemStateSchema,
});

export const ContestSummarySchema = z.object({
  id: z.number().int(),
  title: z.string(),
  style: ContestStyleSchema,
  startAt: TimestampSchema,
  endAt: TimestampSchema,
  phase: ContestPhaseSchema,
  registerType: RegisterTypeSchema,
  participants: z.number().int(),
});

export const ContestSchema = ContestSummarySchema.extend({
  owner: UserRefSchema,
  description: z.string(),
  freezeSec: z.number().int(),
  penaltySec: z.number().int(),
  myState: TeamStateSchema,
  canManage: z.boolean(),
  /** Whether the viewer may currently see the problem set. */
  canEnter: z.boolean(),
  /** Empty unless `canEnter`. */
  problems: z.array(ContestProblemSchema),
});

export const ContestProblemInputSchema = z.object({
  problemId: IdSchema,
  tag: z.string().trim().min(1).max(8),
  state: ContestProblemStateSchema.default(ContestProblemState.NORMAL),
});

const contestFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(50_000),
  style: ContestStyleSchema,
  startAt: TimestampSchema,
  endAt: TimestampSchema,
  registerType: RegisterTypeSchema,
  registerPassword: z.string().max(100),
  freezeSec: z.number().int().min(0).max(86_400 * 30),
  penaltySec: z.number().int().min(0).max(86_400),
  problems: z.array(ContestProblemInputSchema).max(52),
};

export const ContestCreateInputSchema = z.object({
  ...contestFields,
  description: contestFields.description.default(''),
  style: contestFields.style.default(ContestStyle.ICPC),
  registerType: contestFields.registerType.default(RegisterType.OPEN),
  registerPassword: contestFields.registerPassword.default(''),
  freezeSec: contestFields.freezeSec.default(3600),
  penaltySec: contestFields.penaltySec.default(1200),
  problems: contestFields.problems.default([]),
});

export const ContestUpdateInputSchema = z
  .object(contestFields)
  .partial()
  .extend({ id: IdSchema });

/** Contest settings only administrators may read back. */
export const ContestSettingsSchema = z.object({
  ...contestFields,
  id: z.number().int(),
});

export const ParticipantSchema = z.object({
  user: UserRefSchema,
  state: TeamStateSchema,
  note: z.string(),
  registeredAt: TimestampSchema,
});

export const ScoreboardCellSchema = z.object({
  attempts: z.number().int(),
  accepted: z.boolean(),
  firstBlood: z.boolean(),
  /** Minutes from contest start to the accepted submission. */
  acceptedMinute: z.number().int().nullable(),
  score: z.number(),
});

export const ScoreboardSchema = z.object({
  style: ContestStyleSchema,
  /** True when results after the freeze point are withheld from this view. */
  frozen: z.boolean(),
  problems: z.array(
    z.object({
      problemId: z.number().int(),
      tag: z.string(),
      attempts: z.number().int(),
      accepted: z.number().int(),
    }),
  ),
  rows: z.array(
    z.object({
      rank: z.number().int(),
      user: UserRefSchema,
      state: TeamStateSchema,
      solved: z.number().int(),
      /** ICPC penalty in minutes. */
      penalty: z.number().int(),
      score: z.number(),
      /** One cell per entry of `problems`, same order. */
      cells: z.array(ScoreboardCellSchema),
    }),
  ),
});

// --------------------------------------------------------------------- board

export const BoardSummarySchema = z.object({
  id: z.number().int(),
  title: z.string(),
  startAt: TimestampSchema,
  endAt: TimestampSchema,
  users: z.number().int(),
  problems: z.number().int(),
});

export const BoardSchema = BoardSummarySchema.omit({ users: true, problems: true }).extend({
  owner: UserRefSchema,
  /** Markdown. */
  announce: z.string(),
  allowJoin: z.boolean(),
  canManage: z.boolean(),
  /** Whether the viewer may add themselves to the board. */
  canJoin: z.boolean(),
  problems: z.array(z.object({ problemId: z.number().int(), title: z.string(), note: z.string() })),
  /** Sorted by total score, best first. */
  rows: z.array(
    z.object({
      user: UserRefSchema,
      score: z.number(),
      accepted: z.number().int(),
      /** One cell per entry of `problems`; `verdict` is null when untried. */
      cells: z.array(z.object({ verdict: VerdictSchema.nullable(), score: z.number() })),
    }),
  ),
});

const boardFields = {
  title: z.string().trim().min(1).max(200),
  announce: z.string().max(30_000),
  startAt: TimestampSchema,
  endAt: TimestampSchema,
  allowJoin: z.boolean(),
  userIds: z.array(IdSchema).max(2000),
  problems: z.array(z.object({ problemId: IdSchema, note: z.string().max(100).default('') })).max(200),
};
export const BoardCreateInputSchema = z.object(boardFields);
export const BoardUpdateInputSchema = z.object(boardFields).partial().extend({ id: IdSchema });

// ------------------------------------------------------------------- codepad

export const CodepadSchema = z.object({
  hash: z.string(),
  owner: UserRefSchema.nullable(),
  language: LanguageSchema,
  content: z.string(),
  createdAt: TimestampSchema,
});

export const CodepadCreateInputSchema = z.object({
  language: LanguageSchema,
  content: z.string().min(1).max(15_000),
});

// --------------------------------------------------------------------- judge

export const JudgeMachineSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  enabled: z.boolean(),
  lastSeenAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
});

/** A unit of work handed to a judge machine. */
export const JudgeTaskSchema = z.object({
  submissionId: z.number().int(),
  problemId: z.number().int(),
  language: LanguageSchema,
  code: z.string(),
  timeLimitMs: z.number().int(),
  memoryLimitKb: z.number().int(),
  testcases: z.array(
    z.object({
      id: z.number().int(),
      ordinal: z.number().int(),
      /** Content hashes let the judge cache testdata across tasks. */
      inputSha256: z.string(),
      outputSha256: z.string(),
    }),
  ),
});

export const JudgeTestResultSchema = z.object({
  testcaseId: z.number().int(),
  verdict: VerdictSchema,
  timeMs: z.number().int().min(0),
  memoryKb: z.number().int().min(0),
  score: z.number().min(0).max(1),
  message: z.string().max(4096).default(''),
});

export const JudgeReportInputSchema = z.object({
  submissionId: z.number().int(),
  /** Set to CE / JE when the run never reached the testcases. */
  verdict: VerdictSchema.optional(),
  compileMessage: z.string().max(65_536).default(''),
  results: z.array(JudgeTestResultSchema).default([]),
});
