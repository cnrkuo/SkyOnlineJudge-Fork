import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

const id = () => integer().primaryKey().generatedAlwaysAsIdentity();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  'users',
  {
    id: id(),
    email: varchar({ length: 64 }).notNull(),
    nickname: varchar({ length: 64 }).notNull(),
    passwordHash: text().notNull(),
    realname: varchar({ length: 30 }),
    level: integer().notNull(),
    quote: text(),
    /** Who the quote is attributed to. */
    quoteRef: varchar({ length: 80 }),
    avatarUrl: text(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('users_email_key').on(t.email), uniqueIndex('users_nickname_key').on(t.nickname)],
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the bearer token; the token itself is never stored. */
    tokenHash: varchar({ length: 64 }).primaryKey(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const problems = pgTable('problems', {
  id: id(),
  ownerId: integer()
    .notNull()
    .references(() => users.id),
  title: varchar({ length: 200 }).notNull(),
  content: text().notNull().default(''),
  contentAccess: integer().notNull(),
  submitOpen: boolean().notNull().default(false),
  codeviewAccess: integer().notNull(),
  timeLimitMs: integer().notNull().default(1000),
  memoryLimitKb: integer().notNull().default(262144),
  scoreMode: varchar({ length: 16 }).notNull().default('average'),
  scoreGroups: jsonb().$type<[number, number][]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const testcases = pgTable(
  'testcases',
  {
    id: id(),
    problemId: integer()
      .notNull()
      .references(() => problems.id, { onDelete: 'cascade' }),
    ordinal: integer().notNull(),
    name: varchar({ length: 64 }).notNull(),
    inputSha256: varchar({ length: 64 }).notNull(),
    outputSha256: varchar({ length: 64 }).notNull(),
    inputSize: integer().notNull(),
    outputSize: integer().notNull(),
  },
  (t) => [uniqueIndex('testcases_problem_ordinal_key').on(t.problemId, t.ordinal)],
);

export const attachments = pgTable(
  'attachments',
  {
    problemId: integer()
      .notNull()
      .references(() => problems.id, { onDelete: 'cascade' }),
    name: varchar({ length: 64 }).notNull(),
    size: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.problemId, t.name] })],
);

export interface StoredTestResult {
  testcaseId: number;
  ordinal: number;
  verdict: number;
  timeMs: number;
  memoryKb: number;
  score: number;
  message: string;
}

export const submissions = pgTable(
  'submissions',
  {
    // BY DEFAULT rather than ALWAYS: ids are reserved from the sequence when
    // a submission is accepted and supplied by the queued insert later.
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    problemId: integer()
      .notNull()
      .references(() => problems.id),
    userId: integer()
      .notNull()
      .references(() => users.id),
    language: varchar({ length: 16 }).notNull(),
    code: text().notNull(),
    verdict: integer().notNull().default(0),
    score: real().notNull().default(0),
    timeMs: integer().notNull().default(0),
    memoryKb: integer().notNull().default(0),
    compileMessage: text().notNull().default(''),
    comment: text().notNull().default(''),
    results: jsonb().$type<StoredTestResult[]>().notNull().default([]),
    judgeId: integer(),
    createdAt: createdAt(),
    judgeStartedAt: timestamp({ withTimezone: true }),
    judgedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('submissions_problem_idx').on(t.problemId),
    index('submissions_user_idx').on(t.userId),
    index('submissions_verdict_idx').on(t.verdict),
    index('submissions_created_idx').on(t.createdAt),
  ],
);

export const contests = pgTable('contests', {
  id: id(),
  ownerId: integer()
    .notNull()
    .references(() => users.id),
  title: varchar({ length: 200 }).notNull(),
  description: text().notNull().default(''),
  style: varchar({ length: 16 }).notNull(),
  startAt: timestamp({ withTimezone: true }).notNull(),
  endAt: timestamp({ withTimezone: true }).notNull(),
  registerType: integer().notNull(),
  registerPassword: varchar({ length: 100 }).notNull().default(''),
  freezeSec: integer().notNull().default(3600),
  penaltySec: integer().notNull().default(1200),
  createdAt: createdAt(),
});

export const contestProblems = pgTable(
  'contest_problems',
  {
    contestId: integer()
      .notNull()
      .references(() => contests.id, { onDelete: 'cascade' }),
    problemId: integer()
      .notNull()
      .references(() => problems.id),
    tag: varchar({ length: 8 }).notNull(),
    state: integer().notNull(),
    priority: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.contestId, t.problemId] }), index('contest_problems_problem_idx').on(t.problemId)],
);

export const contestUsers = pgTable(
  'contest_users',
  {
    contestId: integer()
      .notNull()
      .references(() => contests.id, { onDelete: 'cascade' }),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    state: integer().notNull(),
    note: text().notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.contestId, t.userId] }), index('contest_users_user_idx').on(t.userId)],
);

export const codepads = pgTable(
  'codepads',
  {
    id: id(),
    hash: varchar({ length: 32 }).notNull(),
    ownerId: integer().references(() => users.id, { onDelete: 'set null' }),
    language: varchar({ length: 16 }).notNull(),
    content: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('codepads_hash_key').on(t.hash), index('codepads_owner_idx').on(t.ownerId)],
);

export const judges = pgTable(
  'judges',
  {
    id: id(),
    name: varchar({ length: 64 }).notNull(),
    tokenHash: varchar({ length: 64 }).notNull(),
    enabled: boolean().notNull().default(true),
    lastSeenAt: timestamp({ withTimezone: true }),
    /** Language ids the judge had working toolchains for on its last fetch. */
    languages: varchar({ length: 16 }).array().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('judges_name_key').on(t.name), uniqueIndex('judges_token_key').on(t.tokenHash)],
);

/** Training scoreboards ("rank" in the legacy system): a set of users × a set of problems. */
export const boards = pgTable('boards', {
  id: id(),
  ownerId: integer()
    .notNull()
    .references(() => users.id),
  title: varchar({ length: 200 }).notNull(),
  announce: text().notNull().default(''),
  startAt: timestamp({ withTimezone: true }).notNull(),
  endAt: timestamp({ withTimezone: true }).notNull(),
  allowJoin: boolean().notNull().default(true),
  createdAt: createdAt(),
});

export const boardProblems = pgTable(
  'board_problems',
  {
    boardId: integer()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    problemId: integer()
      .notNull()
      .references(() => problems.id),
    ordinal: integer().notNull(),
    note: varchar({ length: 100 }).notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.boardId, t.problemId] })],
);

export const boardUsers = pgTable(
  'board_users',
  {
    boardId: integer()
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.boardId, t.userId] })],
);
