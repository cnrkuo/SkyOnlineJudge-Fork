import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDuration, isoToLocalInput, localInputToIso } from './time';

describe('site-timezone conversions', () => {
  it('converts a fixed-offset zone both ways', () => {
    expect(localInputToIso('2026-11-12T17:30', 'Asia/Taipei')).toBe('2026-11-12T09:30:00.000Z');
    expect(isoToLocalInput('2026-11-12T09:30:00.000Z', 'Asia/Taipei')).toBe('2026-11-12T17:30');
    expect(formatDateTime('2026-11-12T09:30:05.000Z', 'Asia/Taipei')).toBe('2026-11-12 17:30:05');
  });

  it('handles daylight-saving zones on both sides of a transition', () => {
    // US DST ends 2026-11-01 at 06:00 UTC.
    expect(localInputToIso('2026-10-31T12:00', 'America/New_York')).toBe('2026-10-31T16:00:00.000Z');
    expect(localInputToIso('2026-11-01T12:00', 'America/New_York')).toBe('2026-11-01T17:00:00.000Z');
    expect(isoToLocalInput('2026-11-01T17:00:00.000Z', 'America/New_York')).toBe('2026-11-01T12:00');
  });

  it('rejects malformed input', () => {
    expect(localInputToIso('tomorrow', 'UTC')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('prints the significant units', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(5 * 3600)).toBe('5h');
    expect(formatDuration(90 * 60)).toBe('1h 30m');
    expect(formatDuration(2 * 86400 + 60)).toBe('2d 1m');
  });
});
