import { ContestStyle, UserLevel } from '@skyoj/contract';
import { Link } from 'react-router';
import { Card, Empty, PageHeader, pageParam, Pagination, PhaseBadge, Time, useRoot } from '~/components/ui';
import { api, load } from '~/lib/api.server';
import { formatDuration } from '~/lib/time';
import type { Route } from './+types/contests';

export async function loader({ request }: Route.LoaderArgs) {
  return load(request, (o) => api.contest.list({ page: pageParam(request), pageSize: 30 }, o));
}

export const meta: Route.MetaFunction = () => [{ title: 'Contests' }];

export default function Contests({ loaderData: list }: Route.ComponentProps) {
  const { user } = useRoot();
  return (
    <>
      <PageHeader
        title="Contests"
        actions={
          (user?.level ?? 0) >= UserLevel.ADMIN && (
            <Link className="btn btn-primary" to="/contests/new">
              New contest
            </Link>
          )
        }
      />
      <Card>
        {list.items.length === 0 ? (
          <Empty>No contests yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Contest</th>
                  <th>Status</th>
                  <th>Starts</th>
                  <th>Length</th>
                  <th>Rules</th>
                  <th className="num">Participants</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((contest) => (
                  <tr key={contest.id}>
                    <td>
                      <Link to={`/contests/${contest.id}`}>{contest.title}</Link>
                    </td>
                    <td>
                      <PhaseBadge phase={contest.phase} />
                    </td>
                    <td>
                      <Time value={contest.startAt} />
                    </td>
                    <td>{formatDuration((Date.parse(contest.endAt) - Date.parse(contest.startAt)) / 1000)}</td>
                    <td>{contest.style === ContestStyle.IOI ? 'IOI' : 'ICPC'}</td>
                    <td className="num">{contest.participants}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} />
    </>
  );
}
