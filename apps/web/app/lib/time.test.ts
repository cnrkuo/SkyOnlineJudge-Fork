import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDuration, isoToLocalInput, localInputToIso } from './time';

describe('site time zone conversion', () => {
  it('reads form input as wall time in the site zone', () => {
    expect(localInputToIso('2026-03-01T08:00', 'Asia/Taipei')).toBe('2026-03-01T00:00:00.000Z');
    expect(localInputToIso('2026-03-01T08:00:30', 'UTC')).toBe('2026-03-01T08:00:30.000Z');
  });

  it('handles daylight-saving time', () => {
    // New York is UTC-5 in January and UTC-4 in July.
    expect(localInputToIso('2026-01-15T12:00', 'America/New_York')).toBe('2026-01-15T17:00:00.000Z');
    expect(localInputToIso('2026-07-15T12:00', 'America/New_York')).toBe('2026-07-15T16:00:00.000Z');
  });

  it('settles the offset on both sides of a transition', () => {
    // US daylight-saving time ends 2026-11-01 at 06:00 UTC.
    expect(localInputToIso('2026-10-31T12:00', 'America/New_York')).toBe('2026-10-31T16:00:00.000Z');
    expect(localInputToIso('2026-11-01T12:00', 'America/New_York')).toBe('2026-11-01T17:00:00.000Z');
    expect(isoToLocalInput('2026-11-01T17:00:00.000Z', 'America/New_York')).toBe('2026-11-01T12:00');
  });

  it('rejects anything but a datetime-local value', () => {
    expect(localInputToIso('', 'UTC')).toBeNull();
    expect(localInputToIso('yesterday', 'UTC')).toBeNull();
  });

  it('round-trips with the input format and formats for display', () => {
    const iso = localInputToIso('2026-11-12T17:30', 'Asia/Taipei') ?? '';
    expect(isoToLocalInput(iso, 'Asia/Taipei')).toBe('2026-11-12T17:30');
    expect(formatDateTime('2026-11-12T09:30:05Z', 'Asia/Taipei')).toBe('2026-11-12 17:30:05');
  });
});

describe('formatDuration', () => {
  it('shows days, hours and minutes, leaving out zero parts', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(5 * 3600)).toBe('5h');
    expect(formatDuration(90 * 60)).toBe('1h 30m');
    expect(formatDuration(86400 + 60)).toBe('1d 1m');
    expect(formatDuration(-30)).toBe('0m');
  });
});
