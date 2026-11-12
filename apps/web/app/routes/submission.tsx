import { Verdict, VERDICT_LABEL } from '@skyoj/contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Form, Link } from 'react-router';
import { api, load, seed, submit } from '~/lib/api.server';
import { highlight } from '~/lib/highlight.server';
import { orpc } from '~/lib/orpc';
import { idParam } from '~/lib/params';
import { Button, Callout, Card, CardBody, css, Field, Muted, Notice, PageHeader, Stack, Stats, Time, UserLink, VerdictBadge } from '~/ui';
import { CodeView, languageName } from '~/ui/code';
import { DataTable, type Column } from '~/ui/data-table';
import { Tabs } from '~/ui/overlays';
import type { Route } from './+types/submission';

export async function loader({ request, params }: Route.LoaderArgs) {
  const id = idParam(params.id);
  // Arriving straight from the submit form: the insert may still be queued.
  const awaitCreation = new URL(request.url).searchParams.has('new');
  const submission = await load(request, (o) => api.submission.get({ id }, o), { awaitCreation });
  return {
    id,
    // Highlighted once here; the source never changes while the page polls.
    codeHtml: submission.code === null ? null : await highlight(submission.code, submission.language),
    dehydrated: seed([[orpc.submission.get.queryKey({ input: { id } }), submission]]),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = idParam(params.id);
  const form = await request.formData();
  const comment = String(form.get('comment') ?? '');
  const verdict = Object.values(Verdict).find((value) => String(value) === form.get('verdict'));
  return { ...(await submit(request, (o) => api.submission.setComment({ id, comment, verdict }, o))), message: 'Saved.' };
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Submission #${loaderData?.id ?? ''}` }];

const isPending = (verdict: Verdict) => verdict === Verdict.WAIT || verdict === Verdict.JUDGING;

type Result = Awaited<ReturnType<typeof api.submission.get>>['results'][number];

const resultColumns: Column<Result>[] = [
  { id: 'n', header: '#', cell: (r) => r.ordinal + 1 },
  { id: 'verdict', header: 'Verdict', sortValue: (r) => r.verdict, cell: (r) => <VerdictBadge verdict={r.verdict} long /> },
  { id: 'time', header: 'Time', align: 'right', sortValue: (r) => r.timeMs, cell: (r) => `${r.timeMs} ms` },
  { id: 'memory', header: 'Memory', align: 'right', sortValue: (r) => r.memoryKb, cell: (r) => `${r.memoryKb} KB` },
  { id: 'message', header: 'Message', cell: (r) => <Muted>{r.message}</Muted> },
];

export default function Submission({ loaderData, actionData }: Route.ComponentProps) {
  const { id, codeHtml } = loaderData;
  const queryClient = useQueryClient();
  const options = orpc.submission.get.queryOptions({ input: { id } });
  // Poll while the judge is working; stops as soon as a verdict arrives.
  const { data: submission } = useQuery({
    ...options,
    refetchInterval: (current) => (current.state.data && isPending(current.state.data.verdict) ? 1500 : false),
  });
  const rejudge = useMutation(
    orpc.submission.rejudge.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: options.queryKey }) }),
  );
  if (!submission) return null;
  const pending = isPending(submission.verdict);

  const tabs = [
    ...(submission.compileMessage
      ? [
          {
            id: 'message',
            label: submission.verdict === Verdict.CE ? 'Compiler output' : 'Judge message',
            content: (
              <CardBody>
                <pre className={css.preWrap}>{submission.compileMessage}</pre>
              </CardBody>
            ),
          },
        ]
      : []),
    ...(submission.results.length > 0
      ? [
          {
            id: 'testcases',
            label: `Testcases (${submission.results.length})`,
            content: <DataTable data={submission.results} columns={resultColumns} rowKey={(r) => r.testcaseId} empty={null} />,
          },
        ]
      : []),
    {
      id: 'source',
      label: 'Source code',
      content: <CardBody>{codeHtml === null ? <Muted>The source code of this submission is not public.</Muted> : <CodeView html={codeHtml} />}</CardBody>,
    },
  ];

  return (
    <>
      <PageHeader
        title={`Submission #${submission.id}`}
        meta={
          <>
            <UserLink user={submission.user} /> on{' '}
            <Link to={`/problems/${submission.problem.id}`}>
              {submission.problem.id}. {submission.problem.title}
            </Link>{' '}
            · <Time value={submission.createdAt} />
          </>
        }
        actions={
          submission.canRejudge && (
            <Button variant="secondary" busy={rejudge.isPending} onClick={() => rejudge.mutate({ id })}>
              Rejudge
            </Button>
          )
        }
      />

      <Stack gap="lg">
        <Notice result={actionData} />
        {rejudge.isError && <Notice result={{ ok: false, error: rejudge.error.message }} />}

        <div aria-live="polite">
          <Stats
            items={[
              ['Verdict', <VerdictBadge key="v" verdict={submission.verdict} long />],
              ['Score', Math.round(submission.score * 100) / 100],
              ['Total time', `${submission.timeMs} ms`],
              ['Peak memory', `${submission.memoryKb} KB`],
              ['Language', languageName(submission.language)],
            ]}
          />
        </div>

        {pending && <Callout>Waiting for a judge… this page updates by itself.</Callout>}

        {submission.comment && (
          <Card title="Comment from the judges">
            <p className={css.preWrap}>{submission.comment}</p>
          </Card>
        )}

        <Card flush>
          {/* Remount when the set of tabs changes so the first one is selected. */}
          <Tabs key={tabs.map((tab) => tab.id).join()} tabs={tabs} />
        </Card>

        {submission.canRejudge && (
          <Card title="Review">
            <Form method="post">
              <Stack>
                <Field label="Comment (shown to the author)">
                  <textarea name="comment" rows={3} maxLength={2000} defaultValue={submission.comment} />
                </Field>
                <Field label="Override verdict">
                  <select className={css.inputWidth.auto} name="verdict" defaultValue="">
                    <option value="">Keep the judge's verdict</option>
                    {Object.values(Verdict).map((verdict) => (
                      <option key={verdict} value={verdict}>
                        {VERDICT_LABEL[verdict]}
                      </option>
                    ))}
                  </select>
                </Field>
                <div>
                  <Button variant="secondary">Save review</Button>
                </div>
              </Stack>
            </Form>
          </Card>
        )}
      </Stack>
    </>
  );
}
