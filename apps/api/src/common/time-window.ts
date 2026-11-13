import { BadRequestError } from './errors.js';

/** A period with both ends known, as stored for contests and scoreboards. */
export interface TimeWindow {
  startAt: Date;
  endAt: Date;
}

/**
 * Parses the ISO timestamps of a create or update input. Ends left out keep
 * their `current` value. Returns the changed ends (`patch`, for the
 * repository) and the whole window as it will be afterwards, which is what
 * callers validate.
 */
export function resolveWindow(
  input: { startAt?: string; endAt?: string },
  current?: TimeWindow,
): { patch: Partial<TimeWindow>; window: TimeWindow } {
  const patch: Partial<TimeWindow> = {
    ...(input.startAt === undefined ? {} : { startAt: new Date(input.startAt) }),
    ...(input.endAt === undefined ? {} : { endAt: new Date(input.endAt) }),
  };
  const startAt = patch.startAt ?? current?.startAt;
  const endAt = patch.endAt ?? current?.endAt;
  if (!startAt || !endAt) throw new BadRequestError('Both a start and an end time are required');
  return { patch, window: { startAt, endAt } };
}
