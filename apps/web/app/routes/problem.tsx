import { AccessLevel, ScoreMode } from '@skyoj/contract';
import { Form, Link, redirect, useNavigation } from 'react-router';
import { Markdown } from '~/components/markdown';
import { api, load, submit } from '~/lib/api.server';
import { renderMarkdown } from '~/lib/markdown.server';
import { idParam } from '~/lib/params';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  Cluster,
  Muted,
  Notice,
  PageHeader,
  Split,
  Stack,
  UserLink,
  useRoot,
  VerdictBadge,
} from '~/ui';
import { CodeInput, LanguageSelect, languageName, parseLanguage } from '~/ui/code';
import { type Column, DataTable } from '~/ui/data-table';
import type { Route } from './+types/problem';

export async function loader({ request, params }: Route.LoaderArgs) {
  const id = idParam(params.id);
  const [problem, stats, attachments] = await Promise.all([
    load(request, (o) => api.problem.get({ id }, o)),
    load(request, (o) => api.problem.stats({ id }, o)),
    load(request, (o) => api.problem.listAttachments({ problemId: id }, o)),
  ]);
  const statement = await renderMarkdown(problem.content, { assetBase: `/problems/${problem.id}/attachments` });
  // The Markdown source stays on the server; the page only needs the HTML.
  return { problem: { ...problem, content: undefined }, statement, stats, attachments };
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const result = await submit(request, (o) =>
    api.submission.create(
      {
        problemId: idParam(params.id),
        language: parseLanguage(form.get('language')),
        code: String(form.get('code') ?? ''),
      },
      o,
    ),
  );
  return result.ok ? redirect(`/submissions/${result.data.id}?new=1`) : result;
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: loaderData ? `${loaderData.problem.id}. ${loaderData.problem.title}` : 'Problem' },
];

type Stats = Route.ComponentProps['loaderData']['stats'];

const subtaskColumns: Column<{ index: number; points: number; count: number }>[] = [
  { id: 'n', header: '#', cell: (g) => g.index + 1 },
  { id: 'count', header: 'Testcases', align: 'right', cell: (g) => g.count },
  { id: 'points', header: 'Points', align: 'right', cell: (g) => g.points },
];

const fastestColumns: Column<Stats['fastest'][number]>[] = [
  { id: 'user', header: 'User', cell: (r) => <UserLink user={r.user} /> },
  { id: 'language', header: 'Language', cell: (r) => <Muted>{languageName(r.language)}</Muted> },
  {
    id: 'time',
    header: 'Time',
    align: 'right',
    cell: (r) => <Link to={`/submissions/${r.submissionId}`}>{r.timeMs} ms</Link>,
  },
];

export default function Problem({ loaderData, actionData }: Route.ComponentProps) {
  const { problem, statement, stats, attachments } = loaderData;
  const { user } = useRoot();
  const busy = useNavigation().state === 'submitting';
  const total = stats.verdicts.reduce((sum, row) => sum + row.count, 0);
  const verdictColumns: Column<Stats['verdicts'][number]>[] = [
    { id: 'verdict', header: 'Verdict', cell: (r) => <VerdictBadge verdict={r.verdict} long /> },
    { id: 'count', header: 'Count', align: 'right', cell: (r) => r.count },
    {
      id: 'share',
      header: 'Share',
      align: 'right',
      cell: (r) => <Muted>{Math.round((100 * r.count) / total)}%</Muted>,
    },
  ];

  return (
    <>
      <PageHeader
        title={
          <>
            <Muted>#{problem.id}</Muted> {problem.title}
          </>
        }
        meta={
          <Cluster>
            <span>Time limit {problem.timeLimitMs} ms</span>
            <span>Memory limit {Math.round(problem.memoryLimitKb / 1024)} MB</span>
            <span>{problem.scoreMode === ScoreMode.GROUP_MIN ? 'Subtask scoring' : 'Per-testcase scoring'}</span>
            <span>
              by <UserLink user={problem.owner} />
            </span>
            {problem.contentAccess !== AccessLevel.OPEN && <Badge>hidden</Badge>}
          </Cluster>
        }
        actions={
          <>
            <ButtonLink to={`/submissions?problem=${problem.id}`}>Submissions</ButtonLink>
            {problem.canEdit && <ButtonLink to="edit">Edit</ButtonLink>}
          </>
        }
      />

      <Split>
        <Stack gap="lg">
          <Card>{statement ? <Markdown html={statement} /> : <Muted>This problem has no statement yet.</Muted>}</Card>

          <Card title="Submit a solution">
            {problem.canSubmit ? (
              <Form method="post">
                <Stack gap="sm">
                  <Notice result={actionData} />
                  <CodeInput />
                  <Cluster>
                    <LanguageSelect />
                    <Button busy={busy}>Submit</Button>
                  </Cluster>
                </Stack>
              </Form>
            ) : user ? (
              <Muted>Submissions are closed for this problem.</Muted>
            ) : (
              <Muted>
                <Link to={`/login?next=/problems/${problem.id}`}>Log in</Link> to submit a solution.
              </Muted>
            )}
          </Card>
        </Stack>

        <Stack gap="lg">
          {problem.scoreMode === ScoreMode.GROUP_MIN && problem.scoreGroups.length > 0 && (
            <Card flush title="Subtasks">
              <DataTable
                data={problem.scoreGroups.map(([points, count], index) => ({ index, points, count }))}
                columns={subtaskColumns}
                rowKey={(g) => g.index}
                empty={null}
              />
            </Card>
          )}

          {attachments.length > 0 && (
            <Card title="Attachments">
              <Stack gap="xs">
                {attachments.map((file) => (
                  <Cluster key={file.name} justify="between">
                    <a href={`/problems/${problem.id}/attachments/${file.name}`}>{file.name}</a>
                    <Muted small>{Math.ceil(file.size / 1024)} KB</Muted>
                  </Cluster>
                ))}
              </Stack>
            </Card>
          )}

          <Card flush title="Statistics">
            <DataTable
              data={stats.verdicts}
              columns={verdictColumns}
              rowKey={(r) => r.verdict}
              empty={
                <CardBody>
                  <Muted>No submissions yet.</Muted>
                </CardBody>
              }
            />
          </Card>

          {stats.fastest.length > 0 && (
            <Card flush title="Fastest solutions">
              <DataTable data={stats.fastest} columns={fastestColumns} rowKey={(r) => r.submissionId} empty={null} />
            </Card>
          )}
        </Stack>
      </Split>
    </>
  );
}
