import { ContestProblemState } from '@skyoj/contract';

/** A contest that lists a problem and that a user takes part in. */
export interface ContestEntry {
  endAt: Date;
  /** How the contest lists the problem (`ContestProblemState`). */
  problemState: number;
}

export interface ContestGrant {
  read: boolean;
  submit: boolean;
}

export const NO_GRANT: ContestGrant = { read: false, submit: false };

/**
 * What the user's running or finished contests allow on a problem that may
 * be hidden from the public: reading it once the contest has started, and
 * submitting while it runs unless the contest made the problem read-only.
 * `entries` only holds contests that have started, list the problem
 * visibly and have the user as a participant.
 */
export function contestGrant(entries: readonly ContestEntry[], now: Date): ContestGrant {
  return {
    read: entries.length > 0,
    submit: entries.some((entry) => entry.problemState === ContestProblemState.NORMAL && now < entry.endAt),
  };
}
