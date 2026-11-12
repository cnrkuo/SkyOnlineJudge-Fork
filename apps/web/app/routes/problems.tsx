import { AccessLevel, UserLevel } from '@skyoj/contract';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Form, Link, redirect, useSearchParams } from 'react-router';
import { api, prefetch, submit } from '~/lib/api.server';
import { orpc } from '~/lib/orpc';
import { paging } from '~/lib/params';
import { unlessOnlySearchChanged } from '~/lib/revalidate';
import { Badge, Button, Card, Cluster, Control, css, Empty, Notice, PageHeader, Stack, useRoot, VerdictBadge } from '~/ui';
import { DataTable, Pager, type Column } from '~/ui/data-table';
import type { Route } from './+types/problems';

/** The list query for a given query string — shared by the loader and the page. */
function listInput(params: URLSearchParams) {
  return { ...paging(params), search: params.get('q')?.trim() || undefined };
}

export async function loader({ request }: Route.LoaderArgs) {
  const input = listInput(new URL(request.url).searchParams);
  return { dehydrated: await prefetch(request, (context) => [orpc.problem.list.queryOptions({ input, context })]) };
}

export const shouldRevalidate = unlessOnlySearchChanged;

/** Creates a draft problem and jumps to its editor. */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const result = await submit(request, (o) => api.problem.create({ title: String(form.get('title') ?? '') }, o));
  return result.ok ? redirect(`/problems/${result.data.id}/edit`) : result;
}

export const meta: Route.MetaFunction = () => [{ title: 'Problems' }];

type Problem = Awaited<ReturnType<typeof api.problem.list>>['items'][number];

const columns: Column<Problem>[] = [
  { id: 'id', header: '#', fixed: true, sortValue: (p) => p.id, cell: (p) => <span className={css.muted}>{p.id}</span> },
  {
    id: 'title',
    header: 'Title',
    fixed: true,
    sortValue: (p) => p.title.toLowerCase(),
    cell: (p) => (
      <Cluster>
        <Link to={`/problems/${p.id}`}>{p.title}</Link>
        {p.contentAccess !== AccessLevel.OPEN && <Badge>hidden</Badge>}
      </Cluster>
    ),
  },
  { id: 'solved', header: 'Solved by', align: 'right', descFirst: true, sortValue: (p) => p.acceptedUsers, cell: (p) => p.acceptedUsers },
  {
    id: 'rate',
    header: 'AC rate',
    align: 'right',
    descFirst: true,
    sortValue: (p) => (p.submissions ? p.accepted / p.submissions : -1),
    cell: (p) => (p.submissions ? `${((100 * p.accepted) / p.submissions).toFixed(1)}%` : '—'),
  },
  {
    id: 'submissions',
    header: 'Submissions',
    align: 'right',
    descFirst: true,
    hidden: true,
    sortValue: (p) => p.submissions,
    cell: (p) => <Link to={`/submissions?problem=${p.id}`}>{p.submissions}</Link>,
  },
  {
    id: 'mine',
    header: 'You',
    sortValue: (p) => p.myVerdict ?? 999,
    cell: (p) => p.myVerdict !== null && <VerdictBadge verdict={p.myVerdict} />,
  },
];

export default function Problems({ actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const input = listInput(params);
  const query = useQuery({ ...orpc.problem.list.queryOptions({ input }), placeholderData: keepPreviousData });
  const list = query.data;
  const { user } = useRoot();
  const isAdmin = (user?.level ?? 0) >= UserLevel.ADMIN;

  return (
    <>
      <PageHeader title="Problems" meta={list && `${list.total} problem${list.total === 1 ? '' : 's'}`} />
      <Stack>
        {isAdmin && (
          <Card>
            <Form method="post">
              <Stack gap="sm">
                <Notice result={actionData} />
                <Cluster>
                  <Control>
                    <input className={css.grow} name="title" placeholder="Title of a new problem" aria-label="New problem title" maxLength={200} required />
                  </Control>
                  <Button>Create problem</Button>
                </Cluster>
              </Stack>
            </Form>
          </Card>
        )}

        <Card flush>
          <DataTable
            caption="Problems"
            data={list?.items ?? []}
            columns={columns}
            rowKey={(p) => p.id}
            columnMenu
            stale={query.isPlaceholderData}
            toolbar={
              <Form method="get" role="search">
                <Cluster>
                  <Control>
                    <input className={css.inputWidth.md} type="search" name="q" defaultValue={input.search ?? ''} placeholder="Search titles" aria-label="Search problems" />
                  </Control>
                  <Button variant="secondary">Search</Button>
                </Cluster>
              </Form>
            }
            empty={<Empty>{input.search ? 'No problems match your search.' : 'No problems have been published yet.'}</Empty>}
            footer={list && <Pager page={list.page} pageSize={list.pageSize} total={list.total} sizes />}
          />
        </Card>
      </Stack>
    </>
  );
}
