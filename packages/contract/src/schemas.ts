import './arktype-config.js';
import { type Type, type } from 'arktype';
import {
  AccessLevel,
  CODE_MAX_LENGTH,
  ContestPhase,
  ContestProblemState,
  ContestStyle,
  INTRODUCTION_MAX_LENGTH,
  Language,
  RegisterType,
  ScoreMode,
  TeamState,
  UserLevel,
  Verdict,
} from './enums.js';

/** Builds a literal union from one of the `as const` enum objects. */
function valuesOf<const T extends Record<string, string | number>>(obj: T): Type<T[keyof T]> {
  return type.enumerated(...Object.values(obj)) as never;
}

/** A string that is trimmed first and must then be `min`..`max` characters. */
const trimmed = (min: number, max: number) => type('string.trim').to(`${min} <= string <= ${max}`);

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
 * Identifier. Numeric strings are parsed because multipart/form-data
 * requests (file uploads) transport every field as a string.
 */
export const IdSchema = type('string.integer.parse | number.integer').to('number.integer > 0');
/** `2026-03-01T08:00:00Z`, `2026-03-01T16:00:00.000+08:00`: date, time and a UTC offset. */
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Whether the written date and time exist on the calendar (no 30 February, no 24:00). */
function isRealDateTime(value: string): boolean {
  const [, year, month, day, hour, minute, second = '0'] = ISO_INSTANT.exec(value) ?? [];
  const parts = [year, month, day, hour, minute, second].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const [y, mo, d, h, mi, s] = parts;
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    date.getUTCHours() === h &&
    date.getUTCMinutes() === mi &&
    date.getUTCSeconds() === s
  );
}

/**
 * An instant, as ISO 8601 with an explicit UTC offset. Dates always travel
 * as strings over the wire. A timestamp without an offset is refused: the
 * server would otherwise read it in its own time zone, so the same input
 * would mean different moments on different machines.
 */
export const TimestampSchema = type('string').narrow(
  (value, ctx) =>
    (ISO_INSTANT.test(value) && isRealDateTime(value)) ||
    ctx.mustBe('a valid date and time with a UTC offset, like 2026-03-01T08:00:00Z'),
);
/** An uploaded or downloaded file. */
export const FileSchema = type('File');

export const PageInputSchema = type({
  page: 'number.integer >= 1 = 1',
  pageSize: '1 <= number.integer <= 100 = 20',
});

/** One page of `t`. */
export const paged = type('<t>', {
  items: 't[]',
  total: 'number.integer',
  page: 'number.integer',
  pageSize: 'number.integer',
});

export const OkSchema = type({ ok: 'true' });

// ---------------------------------------------------------------------- user

export const NicknameSchema = type('string.trim')
  .to('2 <= string <= 32')
  .narrow(
    (value, ctx) =>
      /^[^\s@<>&"'\\/]+$/u.test(value) || ctx.mustBe('free of spaces and the characters @ < > & " \' \\ /'),
  );
export const PasswordSchema = type('6 <= string <= 128');

export const UserRefSchema = type({
  id: 'number.integer',
  nickname: 'string',
});

export const SessionUserSchema = UserRefSchema.merge({
  email: 'string',
  level: UserLevelSchema,
});

export const UserProfileSchema = UserRefSchema.merge({
  level: UserLevelSchema,
  realname: 'string | null',
  /** Self-introduction in Markdown (with TeX math), as written. */
  introduction: 'string | null',
  /** The user's own picture, or their Gravatar when none is set. */
  avatarUrl: 'string | null',
  createdAt: TimestampSchema,
  stats: {
    submissions: 'number.integer',
    accepted: 'number.integer',
    solvedProblemIds: 'number.integer[]',
    triedProblemIds: 'number.integer[]',
  },
});

export const AdminUserSchema = SessionUserSchema.merge({
  realname: 'string | null',
  createdAt: TimestampSchema,
});

export const RegisterInputSchema = type({
  email: 'string.email <= 64',
  nickname: NicknameSchema,
  password: PasswordSchema,
});

export const LoginInputSchema = type({
  /** E-mail address or nickname. */
  identifier: '1 <= string <= 64',
  password: '1 <= string <= 128',
});

export const AuthResultSchema = type({
  /** Opaque bearer token; the web server keeps it in an http-only cookie. */
  token: 'string',
  user: SessionUserSchema,
});

export const UpdateProfileInputSchema = type({
  'nickname?': NicknameSchema,
  'realname?': 'string <= 30 | null',
  'introduction?': `string <= ${INTRODUCTION_MAX_LENGTH} | null`,
  'avatarUrl?': 'string.url <= 500 | null',
});

/** Administrators editing someone else's account; no old password needed. */
export const AdminUpdateUserInputSchema = type({
  userId: IdSchema,
  'nickname?': NicknameSchema,
  'realname?': 'string <= 30 | null',
  'newPassword?': PasswordSchema,
});

export const ChangePasswordInputSchema = type({
  oldPassword: 'string <= 128',
  newPassword: PasswordSchema,
});

// ------------------------------------------------------------------- problem

/** `[[groupScore, testcaseCount], ...]` — see ScoreMode.GROUP_MIN. */
export const ScoreGroupsSchema = type(['number >= 0', 'number.integer >= 1']).array();

export const ProblemSummarySchema = type({
  id: 'number.integer',
  title: 'string',
  contentAccess: AccessLevelSchema,
  acceptedUsers: 'number.integer',
  /** Accepted submissions; with `submissions` this gives the AC rate. */
  accepted: 'number.integer',
  submissions: 'number.integer',
  /** Best verdict of the current user on this problem, if any. */
  myVerdict: VerdictSchema.or('null'),
});

export const ProblemSchema = type({
  id: 'number.integer',
  owner: UserRefSchema,
  title: 'string',
  /** Markdown statement. */
  content: 'string',
  contentAccess: AccessLevelSchema,
  submitOpen: 'boolean',
  codeviewAccess: AccessLevelSchema,
  timeLimitMs: 'number.integer',
  memoryLimitKb: 'number.integer',
  scoreMode: ScoreModeSchema,
  scoreGroups: ScoreGroupsSchema,
  testcaseCount: 'number.integer',
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  canEdit: 'boolean',
  canSubmit: 'boolean',
});

export const ProblemTitleSchema = trimmed(1, 200);

export const ProblemUpdateInputSchema = type({
  id: IdSchema,
  'title?': ProblemTitleSchema,
  'content?': 'string <= 200000',
  'contentAccess?': AccessLevelSchema,
  'submitOpen?': 'boolean',
  'codeviewAccess?': AccessLevelSchema,
  'timeLimitMs?': '100 <= number.integer <= 60000',
  'memoryLimitKb?': '4096 <= number.integer <= 4194304',
  'scoreMode?': ScoreModeSchema,
  'scoreGroups?': ScoreGroupsSchema,
});

export const TestcaseSchema = type({
  id: 'number.integer',
  /** Zero-based position; testcases run in this order. */
  ordinal: 'number.integer',
  name: 'string',
  inputSize: 'number.integer',
  outputSize: 'number.integer',
});

export const AttachmentSchema = type({
  name: 'string',
  size: 'number.integer',
});
export const AttachmentNameSchema = type(/^[a-zA-Z0-9._-]{1,64}$/);

export const ProblemStatsSchema = type({
  verdicts: type({ verdict: VerdictSchema, count: 'number.integer' }).array(),
  fastest: type({
    submissionId: 'number.integer',
    user: UserRefSchema,
    timeMs: 'number.integer',
    memoryKb: 'number.integer',
    language: LanguageSchema,
  }).array(),
});

// ---------------------------------------------------------------- submission

export const SubmissionSummarySchema = type({
  id: 'number.integer',
  problem: { id: 'number.integer', title: 'string' },
  user: UserRefSchema,
  language: LanguageSchema,
  verdict: VerdictSchema,
  score: 'number',
  timeMs: 'number.integer',
  memoryKb: 'number.integer',
  createdAt: TimestampSchema,
});

export const TestResultSchema = type({
  testcaseId: 'number.integer',
  ordinal: 'number.integer',
  verdict: VerdictSchema,
  timeMs: 'number.integer',
  memoryKb: 'number.integer',
  /** 0..1 fraction awarded by the checker. */
  score: 'number',
  message: 'string',
});

export const SubmissionSchema = SubmissionSummarySchema.merge({
  /** `null` when the viewer may not read the source code. */
  code: 'string | null',
  compileMessage: 'string',
  comment: 'string',
  results: TestResultSchema.array(),
  judgedAt: TimestampSchema.or('null'),
  canRejudge: 'boolean',
});

export const SubmitInputSchema = type({
  problemId: IdSchema,
  language: LanguageSchema,
  code: `1 <= string <= ${CODE_MAX_LENGTH}`,
});

export const SubmissionListInputSchema = PageInputSchema.merge({
  'problemId?': IdSchema,
  'userId?': IdSchema,
  'verdict?': VerdictSchema,
});

// ------------------------------------------------------------------- contest

export const ContestProblemSchema = type({
  problemId: 'number.integer',
  /** Short label shown on the scoreboard, e.g. "A". */
  tag: 'string',
  title: 'string',
  state: ContestProblemStateSchema,
});

export const ContestSummarySchema = type({
  id: 'number.integer',
  title: 'string',
  style: ContestStyleSchema,
  startAt: TimestampSchema,
  endAt: TimestampSchema,
  phase: ContestPhaseSchema,
  registerType: RegisterTypeSchema,
  participants: 'number.integer',
});

export const ContestSchema = ContestSummarySchema.merge({
  owner: UserRefSchema,
  description: 'string',
  freezeSec: 'number.integer',
  penaltySec: 'number.integer',
  myState: TeamStateSchema,
  canManage: 'boolean',
  /** Whether the viewer may currently see the problem set. */
  canEnter: 'boolean',
  /** Empty unless `canEnter`. */
  problems: ContestProblemSchema.array(),
});

export const ContestProblemInputSchema = type({
  problemId: IdSchema,
  tag: trimmed(1, 8),
  state: ContestProblemStateSchema.default(ContestProblemState.NORMAL),
});

/** Every editable contest field, without defaults (updates are partial). */
const ContestFieldsSchema = type({
  title: trimmed(1, 200),
  description: 'string <= 50000',
  style: ContestStyleSchema,
  startAt: TimestampSchema,
  endAt: TimestampSchema,
  registerType: RegisterTypeSchema,
  registerPassword: 'string <= 100',
  freezeSec: `0 <= number.integer <= ${86_400 * 30}`,
  penaltySec: '0 <= number.integer <= 86400',
  problems: ContestProblemInputSchema.array().atMostLength(52),
});

export const ContestCreateInputSchema = ContestFieldsSchema.merge({
  description: type('string <= 50000').default(''),
  style: ContestStyleSchema.default(ContestStyle.ICPC),
  registerType: RegisterTypeSchema.default(RegisterType.OPEN),
  registerPassword: type('string <= 100').default(''),
  freezeSec: type(`0 <= number.integer <= ${86_400 * 30}`).default(3600),
  penaltySec: type('0 <= number.integer <= 86400').default(1200),
  problems: ContestProblemInputSchema.array()
    .atMostLength(52)
    .default(() => []),
});

export const ContestUpdateInputSchema = ContestFieldsSchema.partial().merge({ id: IdSchema });

/** Contest settings only administrators may read back. */
export const ContestSettingsSchema = ContestFieldsSchema.merge({ id: 'number.integer' });

export const ParticipantSchema = type({
  user: UserRefSchema,
  state: TeamStateSchema,
  note: 'string',
  registeredAt: TimestampSchema,
});

export const ScoreboardCellSchema = type({
  attempts: 'number.integer',
  accepted: 'boolean',
  firstBlood: 'boolean',
  /** Minutes from contest start to the accepted submission. */
  acceptedMinute: 'number.integer | null',
  score: 'number',
});

export const ScoreboardSchema = type({
  style: ContestStyleSchema,
  /** True when results after the freeze point are withheld from this view. */
  frozen: 'boolean',
  problems: type({
    problemId: 'number.integer',
    tag: 'string',
    attempts: 'number.integer',
    accepted: 'number.integer',
  }).array(),
  rows: type({
    rank: 'number.integer',
    user: UserRefSchema,
    state: TeamStateSchema,
    solved: 'number.integer',
    /** ICPC penalty in minutes. */
    penalty: 'number.integer',
    score: 'number',
    /** One cell per entry of `problems`, same order. */
    cells: ScoreboardCellSchema.array(),
  }).array(),
});

// --------------------------------------------------------------------- board

const BoardHeaderSchema = type({
  id: 'number.integer',
  title: 'string',
  startAt: TimestampSchema,
  endAt: TimestampSchema,
});

export const BoardSummarySchema = BoardHeaderSchema.merge({
  users: 'number.integer',
  problems: 'number.integer',
});

export const BoardSchema = BoardHeaderSchema.merge({
  owner: UserRefSchema,
  /** Markdown. */
  announce: 'string',
  allowJoin: 'boolean',
  canManage: 'boolean',
  /** Whether the viewer may add themselves to the board. */
  canJoin: 'boolean',
  problems: type({ problemId: 'number.integer', title: 'string', note: 'string' }).array(),
  /** Sorted by total score, best first. */
  rows: type({
    user: UserRefSchema,
    score: 'number',
    accepted: 'number.integer',
    /** One cell per entry of `problems`; `verdict` is null when untried. */
    cells: type({ verdict: VerdictSchema.or('null'), score: 'number' }).array(),
  }).array(),
});

export const BoardCreateInputSchema = type({
  title: trimmed(1, 200),
  announce: 'string <= 30000',
  startAt: TimestampSchema,
  endAt: TimestampSchema,
  allowJoin: 'boolean',
  userIds: IdSchema.array().atMostLength(2000),
  problems: type({ problemId: IdSchema, note: type('string <= 100').default('') })
    .array()
    .atMostLength(200),
});
export const BoardUpdateInputSchema = BoardCreateInputSchema.partial().merge({ id: IdSchema });

// ------------------------------------------------------------------- codepad

export const CodepadSchema = type({
  hash: 'string',
  owner: UserRefSchema.or('null'),
  language: LanguageSchema,
  content: 'string',
  createdAt: TimestampSchema,
});

export const CodepadCreateInputSchema = type({
  language: LanguageSchema,
  content: '1 <= string <= 15000',
});

// --------------------------------------------------------------------- judge

export const JudgeMachineSchema = type({
  id: 'number.integer',
  name: 'string',
  enabled: 'boolean',
  /** Languages the judge reported working toolchains for on its last fetch. */
  languages: LanguageSchema.array(),
  /** Whether the judge polled recently, by the API's clock. */
  online: 'boolean',
  lastSeenAt: TimestampSchema.or('null'),
  createdAt: TimestampSchema,
});

/** A unit of work handed to a judge machine. */
export const JudgeTaskSchema = type({
  submissionId: 'number.integer',
  problemId: 'number.integer',
  language: LanguageSchema,
  code: 'string',
  timeLimitMs: 'number.integer',
  memoryLimitKb: 'number.integer',
  testcases: type({
    id: 'number.integer',
    ordinal: 'number.integer',
    /** Content hashes let the judge cache testdata across tasks. */
    inputSha256: 'string',
    outputSha256: 'string',
  }).array(),
});

export const JudgeTestResultSchema = type({
  testcaseId: 'number.integer',
  verdict: VerdictSchema,
  timeMs: 'number.integer >= 0',
  memoryKb: 'number.integer >= 0',
  score: '0 <= number <= 1',
  message: type('string <= 4096').default(''),
});

export const JudgeReportInputSchema = type({
  submissionId: 'number.integer',
  /** Set to CE / JE when the run never reached the testcases. */
  'verdict?': VerdictSchema,
  compileMessage: type('string <= 65536').default(''),
  results: JudgeTestResultSchema.array().default(() => []),
});
