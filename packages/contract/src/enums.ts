/**
 * Domain enums shared by the API and the web client.
 *
 * Numeric values are kept identical to the legacy PHP implementation
 * (SkyOJ\Core\Permission\*, SkyOJ\Challenge\ResultCode, ...) so the
 * permission arithmetic and verdict ordering keep their meaning.
 */

export const UserLevel = {
  GUEST: 0,
  BANNED: 2,
  UNVERIFIED: 4,
  USER: 6,
  ADMIN: 8,
  ROOT: 100,
} as const;
export type UserLevel = (typeof UserLevel)[keyof typeof UserLevel];

/** Minimum level a viewer must exceed to access an object they do not own. */
export const AccessLevel = {
  /** Everyone, including guests. */
  OPEN: -1,
  /** Administrators only. */
  ADMIN: 7,
  /** Owner and higher-ranked administrators only. */
  HIDDEN: 8,
} as const;
export type AccessLevel = (typeof AccessLevel)[keyof typeof AccessLevel];

/**
 * Verdict codes. A submission's overall verdict is the maximum of its
 * per-testcase verdicts, so the ordering is significant.
 */
export const Verdict = {
  WAIT: 0,
  JUDGING: 10,
  AC: 20,
  PE: 25,
  WA: 30,
  OLE: 35,
  RE: 40,
  TLE: 50,
  MLE: 60,
  RF: 65,
  CE: 70,
  JE: 80,
  /** Scoring failed (bad score configuration). */
  SE: 85,
} as const;
export type Verdict = (typeof Verdict)[keyof typeof Verdict];

export const VERDICT_LABEL: Record<Verdict, string> = {
  [Verdict.WAIT]: 'Waiting',
  [Verdict.JUDGING]: 'Judging',
  [Verdict.AC]: 'Accepted',
  [Verdict.PE]: 'Presentation Error',
  [Verdict.WA]: 'Wrong Answer',
  [Verdict.OLE]: 'Output Limit Exceeded',
  [Verdict.RE]: 'Runtime Error',
  [Verdict.TLE]: 'Time Limit Exceeded',
  [Verdict.MLE]: 'Memory Limit Exceeded',
  [Verdict.RF]: 'Restricted Function',
  [Verdict.CE]: 'Compile Error',
  [Verdict.JE]: 'Judge Error',
  [Verdict.SE]: 'Score Error',
};

export const VERDICT_SHORT: Record<Verdict, string> = {
  [Verdict.WAIT]: 'WAIT',
  [Verdict.JUDGING]: 'JUDGING',
  [Verdict.AC]: 'AC',
  [Verdict.PE]: 'PE',
  [Verdict.WA]: 'WA',
  [Verdict.OLE]: 'OLE',
  [Verdict.RE]: 'RE',
  [Verdict.TLE]: 'TLE',
  [Verdict.MLE]: 'MLE',
  [Verdict.RF]: 'RF',
  [Verdict.CE]: 'CE',
  [Verdict.JE]: 'JE',
  [Verdict.SE]: 'SE',
};

export const Language = {
  C: 'c',
  CPP: 'cpp',
  CPP23: 'cpp23',
  PYTHON3: 'py3',
} as const;
export type Language = (typeof Language)[keyof typeof Language];

export const LANGUAGE_LABEL: Record<Language, string> = {
  c: 'C (gcc -std=c11 -O2)',
  cpp: 'C++17 (g++ -std=c++17 -O2)',
  cpp23: 'C++23 (g++ -std=c++23 -O2)',
  py3: 'Python 3',
};

export const ScoreMode = {
  /** 100 × accepted / total testcases. */
  AVERAGE: 'average',
  /** Subtasks: each group scores `min(testcase score) × group score`. */
  GROUP_MIN: 'group_min',
} as const;
export type ScoreMode = (typeof ScoreMode)[keyof typeof ScoreMode];

export const ContestStyle = {
  ICPC: 'icpc',
  IOI: 'ioi',
} as const;
export type ContestStyle = (typeof ContestStyle)[keyof typeof ContestStyle];

export const RegisterType = {
  /** Only administrators can add participants. */
  CLOSED: 0,
  /** Any logged-in user is accepted immediately. */
  OPEN: 1,
  /** Registration stays pending until an administrator approves it. */
  PERMIT_REQUIRED: 2,
  /** Accepted immediately when the contest password matches. */
  PASSWORD: 3,
} as const;
export type RegisterType = (typeof RegisterType)[keyof typeof RegisterType];

export const TeamState = {
  NOT_REGISTERED: 0,
  PENDING: 1,
  ACCEPTED: 2,
  /** Participates but is not listed on the scoreboard for others. */
  HIDDEN: 3,
  REJECTED: 4,
  UNOFFICIAL: 5,
  DROPPED: 99,
} as const;
export type TeamState = (typeof TeamState)[keyof typeof TeamState];

/** Team states that are allowed to take part in a contest. */
export const PARTICIPATING_STATES: readonly TeamState[] = [
  TeamState.ACCEPTED,
  TeamState.HIDDEN,
  TeamState.UNOFFICIAL,
];

export const ContestProblemState = {
  HIDDEN: 0,
  NORMAL: 1,
  /** Statement is visible but submissions are closed. */
  READONLY: 2,
} as const;
export type ContestProblemState = (typeof ContestProblemState)[keyof typeof ContestProblemState];

export const ContestPhase = {
  PREPARING: 'preparing',
  RUNNING: 'running',
  ENDED: 'ended',
} as const;
export type ContestPhase = (typeof ContestPhase)[keyof typeof ContestPhase];

export const CODE_MAX_LENGTH = 100_000;
