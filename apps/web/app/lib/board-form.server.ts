import { SITE_TIMEZONE } from './site.server';
import { localInputToIso } from './time';

/** Reads the fields of `<BoardForm>` into a board create/update input. */
export function parseBoardForm(form: FormData) {
  const text = (name: string) => String(form.get(name) ?? '');
  const startAt = localInputToIso(text('startAt'), SITE_TIMEZONE);
  const endAt = localInputToIso(text('endAt'), SITE_TIMEZONE);
  if (!startAt || !endAt) return { ok: false as const, error: 'Enter both a start and an end time' };

  // Users: ids separated by commas, spaces or new lines.
  const userIds = text('users').split(/[\s,]+/).filter(Boolean).map(Number);
  if (userIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return { ok: false as const, error: 'Users must be listed by their numeric id' };
  }

  // Problems: one per line, `<problem id> [note]`.
  const problems: { problemId: number; note: string }[] = [];
  for (const line of text('problems').split('\n').map((l) => l.trim()).filter(Boolean)) {
    const [id = '', ...note] = line.split(/\s+/);
    const problemId = Number(id);
    if (!Number.isInteger(problemId) || problemId <= 0) {
      return { ok: false as const, error: 'Problems must be written one per line as "<problem id> [note]"' };
    }
    problems.push({ problemId, note: note.join(' ').slice(0, 100) });
  }

  return {
    ok: true as const,
    value: {
      title: text('title'),
      announce: text('announce'),
      startAt,
      endAt,
      allowJoin: form.get('allowJoin') === 'on',
      userIds,
      problems,
    },
  };
}
