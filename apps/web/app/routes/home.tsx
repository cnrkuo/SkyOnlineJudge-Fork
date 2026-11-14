import { ContestPhase } from '@skyoj/contract';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { prefetch } from '~/lib/api.server';
import { orpc } from '~/lib/orpc';
import { Card, css, Empty, Muted, PhaseBadge, Split, Time, VerdictBadge } from '~/ui';
import type { Route } from './+types/home';

const problemsInput = { page: 1, pageSize: 10 };
const contestsInput = { page: 1, pageSize: 20 };

export async function loader({ request }: Route.LoaderArgs) {
  const dehydrated = await prefetch(request, (context) => [
    orpc.problem.list.queryOptions({ input: problemsInput, context }),
    orpc.contest.list.queryOptions({ input: contestsInput, context }),
  ]);
  return { dehydrated };
}

export default function Home() {
  const problems = useQuery(orpc.problem.list.queryOptions({ input: problemsInput })).data?.items ?? [];
  const contests = (useQuery(orpc.contest.list.queryOptions({ input: contestsInput })).data?.items ?? [])
    .filter((contest) => contest.phase !== ContestPhase.ENDED)
    .reverse();

  return (
    <Split aside="half">
      <Card flush title="Problems" footer={<Link to="/problems">All problems →</Link>}>
        {problems.length === 0 ? (
          <Empty>No problems have been published yet.</Empty>
        ) : (
          <ul className={css.list}>
            {problems.map((problem) => (
              <li key={problem.id} className={css.listItem}>
                <Muted small>#{problem.id}</Muted>
                <Link to={`/problems/${problem.id}`} className={`${css.grow} ${css.truncate}`}>
                  {problem.title}
                </Link>
                {problem.myVerdict !== null && <VerdictBadge verdict={problem.myVerdict} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card flush title="Running and upcoming contests" footer={<Link to="/contests">All contests →</Link>}>
        {contests.length === 0 ? (
          <Empty>No contests are scheduled.</Empty>
        ) : (
          <ul className={css.list}>
            {contests.map((contest) => (
              <li key={contest.id} className={css.listItem}>
                <div className={css.grow}>
                  <Link to={`/contests/${contest.id}`}>{contest.title}</Link>
                  <div>
                    <Muted small>
                      {contest.phase === ContestPhase.RUNNING ? 'Ends ' : 'Starts '}
                      <Time value={contest.phase === ContestPhase.RUNNING ? contest.endAt : contest.startAt} />
                    </Muted>
                  </div>
                </div>
                <PhaseBadge phase={contest.phase} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Split>
  );
}
