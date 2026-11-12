import { AccessLevel, UserLevel } from '@skyoj/contract';
import { Form, Link, redirect } from 'react-router';
import { Card, Empty, Notice, PageHeader, pageParam, Pagination, useRoot, VerdictBadge } from '~/components/ui';
import { api, load, submit } from '~/lib/api.server';
import type { Route } from './+types/problems';

export async function loader({ request }: Route.LoaderArgs) {
  const search = new URL(request.url).searchParams.get('q')?.trim() || undefined;
  const list = await load(request, (o) => api.problem.list({ page: pageParam(request), pageSize: 50, search }, o));
  return { list, search: search ?? '' };
}

/** Creates a draft problem and jumps to its editor. */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const result = await submit(request, (o) => api.problem.create({ title: String(form.get('title') ?? '') }, o));
  return result.ok ? redirect(`/problems/${result.data.id}/edit`) : result;
}

export const meta: Route.MetaFunction = () => [{ title: 'Problems' }];

export default function Problems({ loaderData, actionData }: Route.ComponentProps) {
  const { list, search } = loaderData;
  const { user } = useRoot();
  const isAdmin = (user?.level ?? 0) >= UserLevel.ADMIN;
  return (
    <>
      <PageHeader
        title="Problems"
        meta={`${list.total} problem${list.total === 1 ? '' : 's'}`}
        actions={
          <Form method="get" role="search" className="flex gap-2">
            <input className="input w-56" type="search" name="q" defaultValue={search} placeholder="Search titles" aria-label="Search problems" />
            <button className="btn">Search</button>
          </Form>
        }
      />

      {isAdmin && (
        <Form method="post" className="card mb-4 flex flex-wrap items-center gap-2 p-3">
          <input className="input max-w-md flex-1" name="title" placeholder="Title of a new problem" aria-label="New problem title" maxLength={200} required />
          <button className="btn btn-primary">Create problem</button>
          <Notice result={actionData} />
        </Form>
      )}

      <Card>
        {list.items.length === 0 ? (
          <Empty>{search ? 'No problems match your search.' : 'No problems have been published yet.'}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-16">#</th>
                  <th>Title</th>
                  <th className="num">Solved by</th>
                  <th className="num">Submissions</th>
                  <th className="w-24">You</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((problem) => (
                  <tr key={problem.id}>
                    <td className="text-muted tabular-nums">{problem.id}</td>
                    <td>
                      <Link to={`/problems/${problem.id}`}>{problem.title}</Link>
                      {problem.contentAccess !== AccessLevel.OPEN && (
                        <span className="ml-2 rounded bg-sunken px-1.5 py-0.5 text-xs text-muted">hidden</span>
                      )}
                    </td>
                    <td className="num">{problem.acceptedUsers}</td>
                    <td className="num">
                      <Link to={`/submissions?problem=${problem.id}`}>{problem.submissions}</Link>
                    </td>
                    <td>{problem.myVerdict !== null && <VerdictBadge verdict={problem.myVerdict} />}</td>
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
