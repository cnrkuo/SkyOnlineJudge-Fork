/**
 * All times are shown and entered in one site-wide time zone (like the
 * legacy system, which was fixed to Asia/Taipei). Formatting with an
 * explicit zone also keeps server-rendered and hydrated markup identical.
 *
 * Time-zone arithmetic is done by date-fns with `@date-fns/tz`: a `TZDate`
 * is an instant viewed in a zone, so formatting, rounding and adding days
 * follow that zone's calendar, daylight-saving changes included.
 */
import { TZDate } from '@date-fns/tz';
import { addDays, addHours, addYears, format, startOfHour } from 'date-fns';

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export type LocalTime = { ok: true; iso: string } | { ok: false; error: string };

/**
 * Reads an `<input type="datetime-local">` value as wall-clock time in
 * `timeZone` and returns the instant as ISO UTC.
 *
 * - A date that does not exist (30 February) is refused.
 * - A time the clocks skip when daylight-saving time starts is refused.
 * - A time that happens twice when it ends means its first occurrence.
 */
export function parseLocalInput(value: string, timeZone: string): LocalTime {
  const match = LOCAL_INPUT.exec(value);
  if (!match) return { ok: false, error: 'Enter a date and a time' };
  const [y, mo, d, h, mi, s] = match.slice(1).map((part) => Number(part ?? 0)) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const calendar = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (calendar.getUTCMonth() !== mo - 1 || calendar.getUTCDate() !== d || calendar.getUTCHours() !== h) {
    return { ok: false, error: `${value.replace('T', ' ')} is not a valid date and time` };
  }
  const zoned = TZDate.tz(timeZone, y, mo - 1, d, h, mi, s);
  // TZDate moves a skipped wall time forward; reading it back shows that.
  const written = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? '00'}`;
  if (format(zoned, "yyyy-MM-dd'T'HH:mm:ss") !== written) {
    return {
      ok: false,
      error: `${value.replace('T', ' ')} does not exist in ${timeZone}: the clocks skip it when daylight-saving time starts`,
    };
  }
  return { ok: true, iso: toUtcIso(zoned) };
}

/** ISO timestamp → `<input type="datetime-local">` value in `timeZone`. */
export const isoToLocalInput = (iso: string, timeZone: string) =>
  format(new TZDate(iso, timeZone), "yyyy-MM-dd'T'HH:mm");

/** `2026-11-12 17:30:05` in `timeZone`. */
export const formatDateTime = (iso: string, timeZone: string) =>
  format(new TZDate(iso, timeZone), 'yyyy-MM-dd HH:mm:ss');

/** The zone's offset at that instant: `UTC+08:00`, `UTC−05:00`, or `UTC`. */
export function formatOffset(iso: string, timeZone: string): string {
  const offset = format(new TZDate(iso, timeZone), 'xxx');
  return offset === '+00:00' ? 'UTC' : `UTC${offset.replace('-', '−')}`;
}

/** UTC ISO form (`…Z`) of an instant; a TZDate's own toISOString() writes its zone's offset. */
const toUtcIso = (date: Date) => new Date(date.getTime()).toISOString();

/** Default window of a new contest: five hours from the next full local hour, a day from now. */
export function defaultContestWindow(timeZone: string, now: number = Date.now()) {
  const start = addDays(startOfHour(addHours(TZDate.tz(timeZone, now), 1)), 1);
  return { startAt: toUtcIso(start), endAt: toUtcIso(addHours(start, 5)) };
}

/** Default window of a new training scoreboard: a year from the current local hour. */
export function defaultBoardWindow(timeZone: string, now: number = Date.now()) {
  const start = startOfHour(TZDate.tz(timeZone, now));
  return { startAt: toUtcIso(start), endAt: toUtcIso(addYears(start, 1)) };
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', minutes || (!days && !hours) ? `${minutes}m` : '']
    .filter(Boolean)
    .join(' ');
}
