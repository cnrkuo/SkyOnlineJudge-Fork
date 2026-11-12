import { ContestStyle, UserLevel } from '@skyoj/contract';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { prefetch, type api } from '~/lib/api.server';
import { orpc } from '~/lib/orpc';
import { paging } from '~/lib/params';
import { unlessOnlySearchChanged } from '~/lib/revalidate';
import { formatDuration } from '~/lib/time';
import { ButtonLink, Card, Empty, PageHeader, PhaseBadge, Time, useRoot } from '~/ui';
import { DataTable, Pager, type Column } from '~/ui/data-table';
import type { Route } from './+types/contests';

export async function loader({ request }: Route.LoaderArgs) {
  const input = paging(new URL(request.url).searchParams);
  return { dehydrated: await prefetch(request, (context) => [orpc.contest.list.queryOptions({ input, context })]) };
}

export const shouldRevalidate = unlessOnlySearchChanged;
export const meta: Route.MetaFunction = () => [{ title: 'Contests' }];

type Contest = Awaited<ReturnType<typeof api.contest.list>>['items'][number];
const seconds = (contest: Contest) => (Date.parse(contest.endAt) - Date.parse(contest.startAt)) / 1000;

const columns: Column<Contest>[] = [
  { id: 'title', header: 'Contest', fixed: true, sortValue: (c) => c.title.toLowerCase(), cell: (c) => <Link to={`/contests/${c.id}`}>{c.title}</Link> },
  { id: 'status', header: 'Status', cell: (c) => <PhaseBadge phase={c.phase} /> },
  { id: 'start', header: 'Starts', descFirst: true, sortValue: (c) => c.startAt, cell: (c) => <Time value={c.startAt} /> },
  { id: 'length', header: 'Length', sortValue: seconds, cell: (c) => formatDuration(seconds(c)) },
  { id: 'rules', header: 'Rules', cell: (c) => (c.style === ContestStyle.IOI ? 'IOI' : 'ICPC') },
  { id: 'participants', header: 'Participants', align: 'right', descFirst: true, sortValue: (c) => c.participants, cell: (c) => c.participants },
];

export default function Contests() {
  const [params] = useSearchParams();
  const query = useQuery({ ...orpc.contest.list.queryOptions({ input: paging(params) }), placeholderData: keepPreviousData });
  const list = query.data;
  const { user } = useRoot();
  return (
    <>
      <PageHeader
        title="Contests"
        actions={
          (user?.level ?? 0) >= UserLevel.ADMIN && (
            <ButtonLink to="/contests/new" variant="primary">
              New contest
            </ButtonLink>
          )
        }
      />
      <Card flush>
        <DataTable
          caption="Contests"
          data={list?.items ?? []}
          columns={columns}
          rowKey={(c) => c.id}
          stale={query.isPlaceholderData}
          empty={<Empty>No contests yet.</Empty>}
          footer={list && <Pager page={list.page} pageSize={list.pageSize} total={list.total} />}
        />
      </Card>
    </>
  );
}
