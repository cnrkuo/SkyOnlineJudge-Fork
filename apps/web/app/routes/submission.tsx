import { LANGUAGE_LABEL, Verdict, VERDICT_LABEL } from '@skyoj/contract';
import { useEffect } from 'react';
import { Form, Link, useRevalidator } from 'react-router';
import { CodeBlock } from '~/components/code';
import { Card, idParam, Notice, PageHeader, Time, UserLink, VerdictBadge } from '~/components/ui';
import { api, load, submit } from '~/lib/api.server';
import type { Route } from './+types/submission';

export async function loader({ request, params }: Route.LoaderArgs) {
  return load(request, (o) => api.submission.get({ id: idParam(params.id) }, o));
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = idParam(params.id);
  const form = await request.formData();
  if (form.get('intent') === 'rejudge') {
    return { ...(await submit(request, (o) => api.submission.rejudge({ id }, o))), message: 'Queued for rejudging.' };
  }
  const comment = String(form.get('comment') ?? '');
  const verdict = Object.values(Verdict).find((value) => String(value) === form.get('verdict'));
  return { ...(await submit(request, (o) => api.submission.setComment({ id, comment, verdict }, o))), message: 'Saved.' };
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Submission #${loaderData?.id ?? ''}` }];

const isPending = (verdict: Verdict) => verdict === Verdict.WAIT || verdict === Verdict.JUDGING;

export default function Submission({ loaderData: submission, actionData }: Route.ComponentProps) {
  const pending = isPending(submission.verdict);
  const { revalidate, state } = useRevalidator();

  // Poll while the judge is working; stops as soon as a verdict arrives.
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && state === 'idle') void revalidate();
    }, 1500);
    return () => clearInterval(timer);
  }, [pending, revalidate, state]);

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
            <Form method="post">
              <button className="btn" name="intent" value="rejudge">
                Rejudge
              </button>
            </Form>
          )
        }
      />
      <div className="mb-4">
        <Notice result={actionData} />
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5" aria-live="polite">
        {[
          ['Verdict', <VerdictBadge key="v" verdict={submission.verdict} long />],
          ['Score', Math.round(submission.score * 100) / 100],
          ['Total time', `${submission.timeMs} ms`],
          ['Peak memory', `${submission.memoryKb} KB`],
          ['Language', LANGUAGE_LABEL[submission.language].split(' (')[0]],
        ].map(([label, value]) => (
          <div key={String(label)} className="card px-4 py-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-6">
        {pending && <p className="text-sm text-muted">Waiting for a judge… this page refreshes by itself.</p>}

        {submission.comment && (
          <Card title="Comment from the judges">
            <p className="p-4 whitespace-pre-wrap">{submission.comment}</p>
          </Card>
        )}

        {submission.compileMessage && (
          <Card title={submission.verdict === Verdict.CE ? 'Compiler output' : 'Judge message'}>
            <pre className="code overflow-x-auto p-4 whitespace-pre-wrap">{submission.compileMessage}</pre>
          </Card>
        )}

        {submission.results.length > 0 && (
          <Card title="Testcases">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Verdict</th>
                    <th className="num">Time</th>
                    <th className="num">Memory</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {submission.results.map((result) => (
                    <tr key={result.testcaseId}>
                      <td className="tabular-nums">{result.ordinal + 1}</td>
                      <td>
                        <VerdictBadge verdict={result.verdict} long />
                      </td>
                      <td className="num">{result.timeMs} ms</td>
                      <td className="num">{result.memoryKb} KB</td>
                      <td className="text-muted">{result.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card title="Source code">
          {submission.code === null ? (
            <p className="p-4 text-sm text-muted">The source code of this submission is not public.</p>
          ) : (
            <div className="p-4">
              <CodeBlock code={submission.code} />
            </div>
          )}
        </Card>

        {submission.canRejudge && (
          <Card title="Review">
            <Form method="post" className="space-y-3 p-4">
              <label className="block">
                <span className="label">Comment (shown to the author)</span>
                <textarea className="input" name="comment" rows={3} maxLength={2000} defaultValue={submission.comment} />
              </label>
              <label className="block">
                <span className="label">Override verdict</span>
                <select className="input w-auto" name="verdict" defaultValue="">
                  <option value="">Keep the judge's verdict</option>
                  {Object.values(Verdict).map((verdict) => (
                    <option key={verdict} value={verdict}>
                      {VERDICT_LABEL[verdict]}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn" name="intent" value="comment">
                Save review
              </button>
            </Form>
          </Card>
        )}
      </div>
    </>
  );
}
