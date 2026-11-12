import { UserLevel } from '@skyoj/contract';
import { Link } from 'react-router';
import { Card, Empty, PageHeader, pageParam, Pagination, Time, useRoot } from '~/components/ui';
import { api, load } from '~/lib/api.server';
import type { Route } from './+types/boards';

export async function loader({ request }: Route.LoaderArgs) {
  return load(request, (o) => api.board.list({ page: pageParam(request), pageSize: 30 }, o));
}

export const meta: Route.MetaFunction = () => [{ title: 'Scoreboards' }];

export default function Boards({ loaderData: list }: Route.ComponentProps) {
  const { user } = useRoot();
  return (
    <>
      <PageHeader
        title="Scoreboards"
        meta="Progress of a group of users on a set of problems."
        actions={
          (user?.level ?? 0) >= UserLevel.ADMIN && (
            <Link className="btn btn-primary" to="/scoreboards/new">
              New scoreboard
            </Link>
          )
        }
      />
      <Card>
        {list.items.length === 0 ? (
          <Empty>No scoreboards yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Scoreboard</th>
                  <th>From</th>
                  <th>Until</th>
                  <th className="num">Users</th>
                  <th className="num">Problems</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((board) => (
                  <tr key={board.id}>
                    <td>
                      <Link to={`/scoreboards/${board.id}`}>{board.title}</Link>
                    </td>
                    <td>
                      <Time value={board.startAt} />
                    </td>
                    <td>
                      <Time value={board.endAt} />
                    </td>
                    <td className="num">{board.users}</td>
                    <td className="num">{board.problems}</td>
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
