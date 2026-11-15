import { ORPCError } from '@orpc/client';
import { ContestPhase } from '@skyoj/contract';
import type { ContestNavData } from '~/components/contest-nav';
import { api, as } from './api.server';
import { positive } from './params';

/**
 * The contest a page was opened from (`?contest=<id>`), for its contest
 * bar. `null` without the parameter, for a contest that does not exist, or
 * when the viewer may not enter it: a stale or hand-made link only loses
 * the bar, never the page.
 */
export async function contestNav(request: Request): Promise<ContestNavData | null> {
  const id = positive(new URL(request.url).searchParams.get('contest'));
  if (id === undefined) return null;
  try {
    const contest = await api.contest.get({ id }, await as(request));
    if (!contest.canEnter) return null;
    return {
      id,
      title: contest.title,
      problems: contest.problems.map(({ problemId, tag, title }) => ({ problemId, tag, title })),
      scoreboard: contest.canManage || contest.phase !== ContestPhase.PREPARING,
    };
  } catch (error) {
    if (error instanceof ORPCError) return null;
    throw error;
  }
}
