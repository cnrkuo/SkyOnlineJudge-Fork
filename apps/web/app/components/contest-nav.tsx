import { Link } from 'react-router';
import { ButtonLink, Card, Cluster, css, useRoot } from '~/ui';

/** The contest a page belongs to, as `contestNav()` in `lib/contest-nav.server.ts` finds it. */
export interface ContestNavData {
  id: number;
  title: string;
  problems: { problemId: number; tag: string; title: string }[];
  /** Whether the viewer may open the scoreboard yet. */
  scoreboard: boolean;
}

/** `?contest=<id>`, which keeps a page in its contest's context. */
export const inContest = (contest: { id: number } | null | undefined) => (contest ? `?contest=${contest.id}` : '');

/**
 * Bar shown on problem and submission pages opened from a contest: the
 * contest's problems, its scoreboard and the viewer's submissions in it.
 * `current` marks the problem the page is about.
 */
export function ContestNav({ contest, current }: { contest: ContestNavData; current?: number }) {
  const { user } = useRoot();
  return (
    <nav aria-label={`Contest: ${contest.title}`} className={css.contextBar}>
      <Card>
        <Cluster justify="between">
          <Cluster gap="sm">
            <Link to={`/contests/${contest.id}`}>{contest.title}</Link>
            {contest.problems.map((problem) => (
              <ButtonLink
                key={problem.problemId}
                size="sm"
                to={`/problems/${problem.problemId}${inContest(contest)}`}
                title={problem.title}
                aria-current={problem.problemId === current ? 'page' : undefined}>
                {problem.tag}
              </ButtonLink>
            ))}
          </Cluster>
          <Cluster gap="sm">
            {contest.scoreboard && (
              <ButtonLink size="sm" to={`/contests/${contest.id}/scoreboard`}>
                Scoreboard
              </ButtonLink>
            )}
            {user && (
              <ButtonLink size="sm" to={`/submissions?contest=${contest.id}&user=${encodeURIComponent(user.username)}`}>
                My submissions
              </ButtonLink>
            )}
          </Cluster>
        </Cluster>
      </Card>
    </nav>
  );
}
