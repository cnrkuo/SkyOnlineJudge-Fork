import { ContestProblemState, ContestStyle, RegisterType } from '@skyoj/contract';
import { SITE_TIMEZONE } from './site.server';
import { localInputToIso } from './time';

const STATE_WORDS: Record<string, ContestProblemState> = {
  normal: ContestProblemState.NORMAL,
  hidden: ContestProblemState.HIDDEN,
  readonly: ContestProblemState.READONLY,
};

export const stateWord = (state: ContestProblemState) =>
  Object.entries(STATE_WORDS).find(([, value]) => value === state)?.[0] ?? 'normal';

/** One problem per line: `<tag> <problem id> [hidden|readonly]`. */
function parseProblems(text: string) {
  const problems: { tag: string; problemId: number; state: ContestProblemState }[] = [];
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const [tag, id, word = 'normal', ...rest] = line.split(/\s+/);
    const problemId = Number(id);
    const state = STATE_WORDS[word.toLowerCase()];
    if (!tag || rest.length || !Number.isInteger(problemId) || problemId <= 0 || state === undefined) return null;
    problems.push({ tag, problemId, state });
  }
  return problems;
}

/** Reads the fields of `<ContestForm>` into a contest create/update input. */
export function parseContestForm(form: FormData) {
  const text = (name: string) => String(form.get(name) ?? '');
  const startAt = localInputToIso(text('startAt'), SITE_TIMEZONE);
  const endAt = localInputToIso(text('endAt'), SITE_TIMEZONE);
  if (!startAt || !endAt) return { ok: false as const, error: 'Enter both a start and an end time' };

  const problems = parseProblems(text('problems'));
  if (!problems) {
    return { ok: false as const, error: 'Problems must be written one per line as "<tag> <problem id> [hidden|readonly]"' };
  }
  const registerType = Object.values(RegisterType).find((type) => String(type) === text('registerType'));
  return {
    ok: true as const,
    value: {
      title: text('title'),
      description: text('description'),
      style: text('style') === ContestStyle.IOI ? ContestStyle.IOI : ContestStyle.ICPC,
      startAt,
      endAt,
      registerType: registerType ?? RegisterType.OPEN,
      registerPassword: text('registerPassword'),
      freezeSec: Math.round(Number(text('freezeMin')) * 60) || 0,
      penaltySec: Math.round(Number(text('penaltyMin')) * 60) || 0,
      problems,
    },
  };
}
