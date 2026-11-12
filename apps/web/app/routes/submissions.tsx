import { LANGUAGE_LABEL, Verdict, VERDICT_LABEL } from '@skyoj/contract';
import { Form, Link } from 'react-router';
import { Card, Empty, PageHeader, pageParam, Pagination, Time, UserLink, VerdictBadge } from '~/components/ui';
import { api, load } from '~/lib/api.server';
import type { Route } from './+types/submissions';

const verdicts = Object.values(Verdict);

function positive(value: string | null): number | undefined {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

export async function loader({ request }: Route.LoaderArgs) {
  const query = new URL(request.url).searchParams;
  const filter = {
    problemId: positive(query.get('problem')),
    userId: positive(query.get('user')),
    verdict: verdicts.find((verdict) => String(verdict) === query.get('verdict')),
  };
  const list = await load(request, (o) => api.submission.list({ page: pageParam(request), pageSize: 30, ...filter }, o));
  return { list, filter };
}

export const meta: Route.MetaFunction = () => [{ title: 'Submissions' }];

export default function Submissions({ loaderData }: Route.ComponentProps) {
  const { list, filter } = loaderData;
  const filtered = Object.values(filter).some((value) => value !== undefined);
  return (
    <>
      <PageHeader title="Submissions" />
      <Form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="text-sm">
          <span className="label">Problem #</span>
          <input className="input w-28" name="problem" inputMode="numeric" defaultValue={filter.problemId ?? ''} />
        </label>
        <label className="text-sm">
          <span className="label">User #</span>
          <input className="input w-28" name="user" inputMode="numeric" defaultValue={filter.userId ?? ''} />
        </label>
        <label className="text-sm">
          <span className="label">Verdict</span>
          <select className="input w-auto" name="verdict" defaultValue={filter.verdict ?? ''}>
            <option value="">Any</option>
            {verdicts.map((verdict) => (
              <option key={verdict} value={verdict}>
                {VERDICT_LABEL[verdict]}
              </option>
            ))}
          </select>
        </label>
        <button className="btn">Filter</button>
        {filtered && (
          <Link className="btn" to="/submissions">
            Clear
          </Link>
        )}
      </Form>

      <Card>
        {list.items.length === 0 ? (
          <Empty>No submissions to show.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>When</th>
                  <th>User</th>
                  <th>Problem</th>
                  <th>Verdict</th>
                  <th className="num">Score</th>
                  <th className="num">Time</th>
                  <th className="num">Memory</th>
                  <th>Language</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((submission) => (
                  <tr key={submission.id}>
                    <td>
                      <Link to={`/submissions/${submission.id}`} className="tabular-nums">
                        {submission.id}
                      </Link>
                    </td>
                    <td className="text-muted">
                      <Time value={submission.createdAt} />
                    </td>
                    <td>
                      <UserLink user={submission.user} />
                    </td>
                    <td>
                      <Link to={`/problems/${submission.problem.id}`}>
                        {submission.problem.id}. {submission.problem.title}
                      </Link>
                    </td>
                    <td>
                      <Link to={`/submissions/${submission.id}`} className="no-underline">
                        <VerdictBadge verdict={submission.verdict} />
                      </Link>
                    </td>
                    <td className="num">{Math.round(submission.score * 100) / 100}</td>
                    <td className="num">{submission.timeMs} ms</td>
                    <td className="num">{submission.memoryKb} KB</td>
                    <td className="text-muted">{LANGUAGE_LABEL[submission.language].split(' (')[0]}</td>
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
