import { Verdict, VERDICT_LABEL } from '@skyoj/contract';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Form, Link, useSearchParams } from 'react-router';
import { prefetch, type api } from '~/lib/api.server';
import { orpc } from '~/lib/orpc';
import { paging, positive } from '~/lib/params';
import { unlessOnlySearchChanged } from '~/lib/revalidate';
import { Button, ButtonLink, Card, Cluster, css, Empty, Field, Muted, PageHeader, Time, UserLink, VerdictBadge } from '~/ui';
import { languageName } from '~/ui/code';
import { DataTable, Pager, type Column } from '~/ui/data-table';
import type { Route } from './+types/submissions';

const verdicts = Object.values(Verdict);
const isPending = (verdict: Verdict) => verdict === Verdict.WAIT || verdict === Verdict.JUDGING;

/** The list query for a given query string — shared by the loader and the page. */
function listInput(params: URLSearchParams) {
  return {
    ...paging(params),
    problemId: positive(params.get('problem')),
    userId: positive(params.get('user')),
    verdict: verdicts.find((verdict) => String(verdict) === params.get('verdict')),
  };
}

export async function loader({ request }: Route.LoaderArgs) {
  const input = listInput(new URL(request.url).searchParams);
  return { dehydrated: await prefetch(request, (context) => [orpc.submission.list.queryOptions({ input, context })]) };
}

export const shouldRevalidate = unlessOnlySearchChanged;

export const meta: Route.MetaFunction = () => [{ title: 'Submissions' }];

type Submission = Awaited<ReturnType<typeof api.submission.list>>['items'][number];

const columns: Column<Submission>[] = [
  { id: 'id', header: '#', fixed: true, cell: (s) => <Link to={`/submissions/${s.id}`}>{s.id}</Link> },
  { id: 'when', header: 'When', cell: (s) => <Muted><Time value={s.createdAt} /></Muted> },
  { id: 'user', header: 'User', cell: (s) => <UserLink user={s.user} /> },
  {
    id: 'problem',
    header: 'Problem',
    fixed: true,
    cell: (s) => (
      <Link to={`/problems/${s.problem.id}`}>
        {s.problem.id}. {s.problem.title}
      </Link>
    ),
  },
  { id: 'verdict', header: 'Verdict', fixed: true, cell: (s) => <VerdictBadge verdict={s.verdict} /> },
  { id: 'score', header: 'Score', align: 'right', descFirst: true, sortValue: (s) => s.score, cell: (s) => Math.round(s.score * 100) / 100 },
  { id: 'time', header: 'Time', align: 'right', sortValue: (s) => s.timeMs, cell: (s) => `${s.timeMs} ms` },
  { id: 'memory', header: 'Memory', align: 'right', sortValue: (s) => s.memoryKb, cell: (s) => `${s.memoryKb} KB` },
  { id: 'language', header: 'Language', cell: (s) => <Muted>{languageName(s.language)}</Muted> },
];

export default function Submissions() {
  const [params] = useSearchParams();
  const input = listInput(params);
  const query = useQuery({
    ...orpc.submission.list.queryOptions({ input }),
    placeholderData: keepPreviousData,
    // Keep the list live while anything on it is still being judged.
    refetchInterval: (current) => (current.state.data?.items.some((s) => isPending(s.verdict)) ? 2000 : false),
  });
  const list = query.data;
  const filtered = input.problemId !== undefined || input.userId !== undefined || input.verdict !== undefined;

  return (
    <>
      <PageHeader title="Submissions" />
      <Card flush>
        <DataTable
          caption="Submissions"
          data={list?.items ?? []}
          columns={columns}
          rowKey={(s) => s.id}
          columnMenu
          stale={query.isPlaceholderData}
          toolbar={
            // A plain GET form: the filters live in the URL and work without JavaScript.
            <Form method="get" key={params.toString()}>
              <Cluster align="end" gap="md">
                <Field label="Problem #">
                  <input className={css.inputWidth.xs} name="problem" inputMode="numeric" defaultValue={input.problemId ?? ''} />
                </Field>
                <Field label="User #">
                  <input className={css.inputWidth.xs} name="user" inputMode="numeric" defaultValue={input.userId ?? ''} />
                </Field>
                <Field label="Verdict">
                  <select className={css.inputWidth.auto} name="verdict" defaultValue={input.verdict ?? ''}>
                    <option value="">Any</option>
                    {verdicts.map((verdict) => (
                      <option key={verdict} value={verdict}>
                        {VERDICT_LABEL[verdict]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button variant="secondary">Filter</Button>
                {filtered && <ButtonLink to="/submissions">Clear</ButtonLink>}
              </Cluster>
            </Form>
          }
          empty={<Empty>No submissions to show.</Empty>}
          footer={list && <Pager page={list.page} pageSize={list.pageSize} total={list.total} sizes />}
        />
      </Card>
    </>
  );
}
