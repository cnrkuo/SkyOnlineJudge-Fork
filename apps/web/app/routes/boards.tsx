import { UserLevel } from '@skyoj/contract';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { prefetch, type api } from '~/lib/api.server';
import { orpc } from '~/lib/orpc';
import { paging } from '~/lib/params';
import { unlessOnlySearchChanged } from '~/lib/revalidate';
import { ButtonLink, Card, Empty, PageHeader, Time, useRoot } from '~/ui';
import { DataTable, Pager, type Column } from '~/ui/data-table';
import type { Route } from './+types/boards';

export async function loader({ request }: Route.LoaderArgs) {
  const input = paging(new URL(request.url).searchParams);
  return { dehydrated: await prefetch(request, (context) => [orpc.board.list.queryOptions({ input, context })]) };
}

export const shouldRevalidate = unlessOnlySearchChanged;
export const meta: Route.MetaFunction = () => [{ title: 'Scoreboards' }];

type Board = Awaited<ReturnType<typeof api.board.list>>['items'][number];

const columns: Column<Board>[] = [
  { id: 'title', header: 'Scoreboard', fixed: true, sortValue: (b) => b.title.toLowerCase(), cell: (b) => <Link to={`/scoreboards/${b.id}`}>{b.title}</Link> },
  { id: 'from', header: 'From', sortValue: (b) => b.startAt, cell: (b) => <Time value={b.startAt} /> },
  { id: 'until', header: 'Until', sortValue: (b) => b.endAt, cell: (b) => <Time value={b.endAt} /> },
  { id: 'users', header: 'Users', align: 'right', descFirst: true, sortValue: (b) => b.users, cell: (b) => b.users },
  { id: 'problems', header: 'Problems', align: 'right', descFirst: true, sortValue: (b) => b.problems, cell: (b) => b.problems },
];

export default function Boards() {
  const [params] = useSearchParams();
  const query = useQuery({ ...orpc.board.list.queryOptions({ input: paging(params) }), placeholderData: keepPreviousData });
  const list = query.data;
  const { user } = useRoot();
  return (
    <>
      <PageHeader
        title="Scoreboards"
        meta="Progress of a group of users on a set of problems."
        actions={
          (user?.level ?? 0) >= UserLevel.ADMIN && (
            <ButtonLink to="/scoreboards/new" variant="primary">
              New scoreboard
            </ButtonLink>
          )
        }
      />
      <Card flush>
        <DataTable
          caption="Scoreboards"
          data={list?.items ?? []}
          columns={columns}
          rowKey={(b) => b.id}
          stale={query.isPlaceholderData}
          empty={<Empty>No scoreboards yet.</Empty>}
          footer={list && <Pager page={list.page} pageSize={list.pageSize} total={list.total} />}
        />
      </Card>
    </>
  );
}
