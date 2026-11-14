import { describe, expect, it } from 'vitest';
import {
  defaultBoardWindow,
  defaultContestWindow,
  formatDateTime,
  formatDuration,
  formatOffset,
  isoToLocalInput,
  parseLocalInput,
} from './time';

const iso = (value: string, timeZone: string) => {
  const parsed = parseLocalInput(value, timeZone);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.iso;
};

describe('site time zone conversion', () => {
  it('reads form input as wall time in the site zone', () => {
    expect(iso('2026-03-01T08:00', 'Asia/Taipei')).toBe('2026-03-01T00:00:00.000Z');
    expect(iso('2026-03-01T08:00:30', 'UTC')).toBe('2026-03-01T08:00:30.000Z');
    expect(iso('2026-03-01T08:00', 'Asia/Kolkata')).toBe('2026-03-01T02:30:00.000Z');
  });

  it('follows daylight-saving time', () => {
    // New York is UTC-5 in January and UTC-4 in July.
    expect(iso('2026-01-15T12:00', 'America/New_York')).toBe('2026-01-15T17:00:00.000Z');
    expect(iso('2026-07-15T12:00', 'America/New_York')).toBe('2026-07-15T16:00:00.000Z');
  });

  it('settles the offset on both sides of a transition', () => {
    // US daylight-saving time ends 2026-11-01 at 06:00 UTC.
    expect(iso('2026-10-31T12:00', 'America/New_York')).toBe('2026-10-31T16:00:00.000Z');
    expect(iso('2026-11-01T12:00', 'America/New_York')).toBe('2026-11-01T17:00:00.000Z');
    expect(isoToLocalInput('2026-11-01T17:00:00.000Z', 'America/New_York')).toBe('2026-11-01T12:00');
  });

  it('refuses a time the clocks skip, and reads a repeated time as its first occurrence', () => {
    // 2026-03-08 02:00 → 03:00 in New York; 2026-11-01 02:00 → 01:00.
    const skipped = parseLocalInput('2026-03-08T02:30', 'America/New_York');
    expect(skipped).toMatchObject({ ok: false, error: expect.stringMatching(/does not exist in America\/New_York/) });
    expect(iso('2026-11-01T01:30', 'America/New_York')).toBe('2026-11-01T05:30:00.000Z');
  });

  it('refuses dates that do not exist and anything but a datetime-local value', () => {
    expect(parseLocalInput('2026-02-30T08:00', 'UTC')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/not a valid date/),
    });
    expect(parseLocalInput('', 'UTC')).toMatchObject({ ok: false });
    expect(parseLocalInput('yesterday', 'UTC')).toMatchObject({ ok: false });
  });

  it('round-trips with the input format and formats for display', () => {
    expect(isoToLocalInput(iso('2026-11-12T17:30', 'Asia/Taipei'), 'Asia/Taipei')).toBe('2026-11-12T17:30');
    expect(formatDateTime('2026-11-12T09:30:05Z', 'Asia/Taipei')).toBe('2026-11-12 17:30:05');
  });
});

describe('formatOffset', () => {
  it("names the zone's offset at that instant", () => {
    expect(formatOffset('2026-11-12T09:30:05Z', 'Asia/Taipei')).toBe('UTC+08:00');
    expect(formatOffset('2026-01-15T12:00:00Z', 'America/New_York')).toBe('UTC−05:00');
    expect(formatOffset('2026-07-15T12:00:00Z', 'America/New_York')).toBe('UTC−04:00');
    expect(formatOffset('2026-07-15T12:00:00Z', 'UTC')).toBe('UTC');
  });
});

describe('default windows', () => {
  const now = Date.parse('2026-11-14T04:50:00Z'); // 10:20 in Kolkata (UTC+05:30)

  it('starts a new contest on a full local hour, tomorrow, for five hours', () => {
    expect(defaultContestWindow('Asia/Kolkata', now)).toEqual({
      startAt: '2026-11-15T05:30:00.000Z', // 11:00 local
      endAt: '2026-11-15T10:30:00.000Z',
    });
  });

  it('starts a new scoreboard at the current local hour, for a year', () => {
    expect(defaultBoardWindow('Asia/Kolkata', now)).toEqual({
      startAt: '2026-11-14T04:30:00.000Z', // 10:00 local
      endAt: '2027-11-14T04:30:00.000Z',
    });
  });
});

describe('formatDuration', () => {
  it('prints the significant units', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(5 * 3600)).toBe('5h');
    expect(formatDuration(90 * 60)).toBe('1h 30m');
    expect(formatDuration(2 * 86400 + 60)).toBe('2d 1m');
    expect(formatDuration(-30)).toBe('0m');
  });
});
