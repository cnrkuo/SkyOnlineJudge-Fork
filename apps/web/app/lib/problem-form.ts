import { AccessLevel } from '@skyoj/contract';

/** Who may read a statement, as offered by the problem editor. */
export const ACCESS_OPTIONS = [
  [AccessLevel.OPEN, 'Everyone'],
  [AccessLevel.ADMIN, 'Administrators'],
  [AccessLevel.HIDDEN, 'Only me and higher-ranked admins'],
] as const;

/** A submitted access level; anything unexpected falls back to the most private one. */
export function parseAccess(value: FormDataEntryValue | null): AccessLevel {
  return ACCESS_OPTIONS.find(([level]) => String(level) === value)?.[0] ?? AccessLevel.HIDDEN;
}

/** A subtask: `[points, testcase count]`. */
export type ScoreGroup = [points: number, count: number];

/**
 * Subtasks written one per line as `<points> <testcase count>` (a comma also
 * separates). Blank lines are ignored. `null` when any line is malformed.
 */
export function parseScoreGroups(text: string): ScoreGroup[] | null {
  const groups: ScoreGroup[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const group = parseScoreGroup(line);
    if (!group) return null;
    groups.push(group);
  }
  return groups;
}

function parseScoreGroup(line: string): ScoreGroup | null {
  const fields = line.trim().split(/[\s,]+/);
  if (fields.length !== 2) return null;
  const [points, count] = fields.map(Number) as [number, number];
  const valid = points >= 0 && Number.isInteger(count) && count >= 1;
  return valid ? [points, count] : null;
}

/** The editor's text form of `parseScoreGroups`. */
export const formatScoreGroups = (groups: readonly (readonly [number, number])[]) =>
  groups.map(([points, count]) => `${points} ${count}`).join('\n');
