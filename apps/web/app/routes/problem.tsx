import { AccessLevel, LANGUAGE_LABEL, ScoreMode } from '@skyoj/contract';
import { Form, Link, redirect, useNavigation } from 'react-router';
import { CodeInput, LanguageSelect, parseLanguage } from '~/components/code';
import { Markdown } from '~/components/markdown';
import { Card, idParam, Notice, PageHeader, UserLink, useRoot, VerdictBadge } from '~/components/ui';
import { api, load, submit } from '~/lib/api.server';
import type { Route } from './+types/problem';

export async function loader({ request, params }: Route.LoaderArgs) {
  const id = idParam(params.id);
  const [problem, stats, attachments] = await Promise.all([
    load(request, (o) => api.problem.get({ id }, o)),
    load(request, (o) => api.problem.stats({ id }, o)),
    load(request, (o) => api.problem.listAttachments({ problemId: id }, o)),
  ]);
  return { problem, stats, attachments };
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const result = await submit(request, (o) =>
    api.submission.create(
      { problemId: idParam(params.id), language: parseLanguage(form.get('language')), code: String(form.get('code') ?? '') },
      o,
    ),
  );
  return result.ok ? redirect(`/submissions/${result.data.id}?new=1`) : result;
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: loaderData ? `${loaderData.problem.id}. ${loaderData.problem.title}` : 'Problem' },
];

export default function Problem({ loaderData, actionData }: Route.ComponentProps) {
  const { problem, stats, attachments } = loaderData;
  const { user } = useRoot();
  const busy = useNavigation().state === 'submitting';
  const total = stats.verdicts.reduce((sum, row) => sum + row.count, 0);

  return (
    <>
      <PageHeader
        title={
          <>
            <span className="text-muted">#{problem.id}</span> {problem.title}
          </>
        }
        meta={
          <>
            Time limit {problem.timeLimitMs} ms · Memory limit {Math.round(problem.memoryLimitKb / 1024)} MB ·{' '}
            {problem.scoreMode === ScoreMode.GROUP_MIN ? 'Subtask scoring' : 'Per-testcase scoring'} · by{' '}
            <UserLink user={problem.owner} />
            {problem.contentAccess !== AccessLevel.OPEN && <span className="ml-2 rounded bg-sunken px-1.5 py-0.5 text-xs">hidden</span>}
          </>
        }
        actions={
          <>
            <Link className="btn" to={`/submissions?problem=${problem.id}`}>
              Submissions
            </Link>
            {problem.canEdit && (
              <Link className="btn" to="edit">
                Edit
              </Link>
            )}
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-6">
          <Card className="p-5">
            {problem.content.trim() ? (
              <Markdown source={problem.content} assetBase={`/problems/${problem.id}/attachments`} />
            ) : (
              <p className="text-muted">This problem has no statement yet.</p>
            )}
          </Card>

          <Card title="Submit a solution">
            {problem.canSubmit ? (
              <Form method="post" className="space-y-3 p-4">
                <Notice result={actionData} />
                <CodeInput />
                <div className="flex flex-wrap items-center gap-2">
                  <LanguageSelect />
                  <button className="btn btn-primary" disabled={busy}>
                    {busy ? 'Submitting…' : 'Submit'}
                  </button>
                </div>
              </Form>
            ) : (
              <p className="p-4 text-sm text-muted">
                {user ? (
                  'Submissions are closed for this problem.'
                ) : (
                  <>
                    <Link to={`/login?next=/problems/${problem.id}`}>Log in</Link> to submit a solution.
                  </>
                )}
              </p>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          {problem.scoreMode === ScoreMode.GROUP_MIN && problem.scoreGroups.length > 0 && (
            <Card title="Subtasks">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="num">Testcases</th>
                    <th className="num">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {problem.scoreGroups.map(([points, count], index) => (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      <td className="num">{count}</td>
                      <td className="num">{points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {attachments.length > 0 && (
            <Card title="Attachments">
              <ul className="p-4 text-sm">
                {attachments.map((file) => (
                  <li key={file.name}>
                    <a href={`/problems/${problem.id}/attachments/${file.name}`}>{file.name}</a>{' '}
                    <span className="text-muted">({Math.ceil(file.size / 1024)} KB)</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Statistics">
            {total === 0 ? (
              <p className="p-4 text-sm text-muted">No submissions yet.</p>
            ) : (
              <table className="table">
                <tbody>
                  {stats.verdicts.map((row) => (
                    <tr key={row.verdict}>
                      <td>
                        <VerdictBadge verdict={row.verdict} long />
                      </td>
                      <td className="num">{row.count}</td>
                      <td className="num text-muted">{Math.round((100 * row.count) / total)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {stats.fastest.length > 0 && (
            <Card title="Fastest solutions">
              <table className="table">
                <tbody>
                  {stats.fastest.map((row) => (
                    <tr key={row.submissionId}>
                      <td>
                        <UserLink user={row.user} />
                      </td>
                      <td className="num" title={LANGUAGE_LABEL[row.language]}>
                        <Link to={`/submissions/${row.submissionId}`}>{row.timeMs} ms</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
