import { ContestPhase } from '@skyoj/contract';
import { Link } from 'react-router';
import { Card, Empty, Time, VerdictBadge } from '~/components/ui';
import { api, load } from '~/lib/api.server';
import type { Route } from './+types/home';

export async function loader({ request }: Route.LoaderArgs) {
  const [problems, contests] = await Promise.all([
    load(request, (o) => api.problem.list({ pageSize: 8 }, o)),
    load(request, (o) => api.contest.list({ pageSize: 20 }, o)),
  ]);
  return {
    problems: problems.items,
    contests: contests.items.filter((contest) => contest.phase !== ContestPhase.ENDED).reverse(),
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { problems, contests } = loaderData;
  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <Card title="Latest problems">
        {problems.length === 0 ? (
          <Empty>No problems have been published yet.</Empty>
        ) : (
          <ul>
            {problems.map((problem) => (
              <li key={problem.id} className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-b-0">
                <span className="w-10 text-sm text-muted tabular-nums">#{problem.id}</span>
                <Link to={`/problems/${problem.id}`} className="min-w-0 flex-1 truncate">
                  {problem.title}
                </Link>
                {problem.myVerdict !== null && <VerdictBadge verdict={problem.myVerdict} />}
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-line px-4 py-2 text-sm">
          <Link to="/problems">All problems →</Link>
        </p>
      </Card>

      <Card title="Running and upcoming contests">
        {contests.length === 0 ? (
          <Empty>No contests are scheduled.</Empty>
        ) : (
          <ul>
            {contests.map((contest) => (
              <li key={contest.id} className="border-b border-line px-4 py-2.5 last:border-b-0">
                <Link to={`/contests/${contest.id}`} className="font-medium">
                  {contest.title}
                </Link>
                <div className="text-sm text-muted">
                  {contest.phase === ContestPhase.RUNNING ? (
                    <>
                      <span className="font-medium text-good">Running</span> · ends <Time value={contest.endAt} />
                    </>
                  ) : (
                    <>
                      Starts <Time value={contest.startAt} />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-line px-4 py-2 text-sm">
          <Link to="/contests">All contests →</Link>
        </p>
      </Card>
    </div>
  );
}
