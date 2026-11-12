/**
 * All times are shown in one site-wide timezone (like the legacy system,
 * which was fixed to Asia/Taipei). Formatting with an explicit zone also
 * keeps server-rendered and hydrated markup identical.
 */

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wall - Math.floor(instant / 1000) * 1000;
}

/** `<input type="datetime-local">` value (wall time in `timeZone`) → ISO UTC. */
export function localInputToIso(value: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  // The offset depends on the instant we are solving for; two passes settle
  // it across daylight-saving transitions.
  let instant = wall - offsetAt(wall, timeZone);
  instant = wall - offsetAt(instant, timeZone);
  return new Date(instant).toISOString();
}

/** ISO timestamp → `<input type="datetime-local">` value in `timeZone`. */
export function isoToLocalInput(iso: string, timeZone: string): string {
  const instant = new Date(iso).getTime();
  return new Date(instant + offsetAt(instant, timeZone)).toISOString().slice(0, 16);
}

/** `2026-11-12 17:30:05` in `timeZone`. */
export function formatDateTime(iso: string, timeZone: string): string {
  const instant = new Date(iso).getTime();
  return new Date(instant + offsetAt(instant, timeZone)).toISOString().slice(0, 19).replace('T', ' ');
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
