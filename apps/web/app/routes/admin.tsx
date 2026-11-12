import { UserLevel } from '@skyoj/contract';
import { Form, Link } from 'react-router';
import { Card, Empty, Notice, PageHeader, pageParam, Pagination, Time, UserLink, useRoot } from '~/components/ui';
import { api, load, submit } from '~/lib/api.server';
import type { Route } from './+types/admin';

const LEVELS: [UserLevel, string][] = [
  [UserLevel.BANNED, 'Banned'],
  [UserLevel.UNVERIFIED, 'Unverified'],
  [UserLevel.USER, 'User'],
  [UserLevel.ADMIN, 'Administrator'],
  [UserLevel.ROOT, 'Site owner'],
];

export async function loader({ request }: Route.LoaderArgs) {
  const search = new URL(request.url).searchParams.get('q')?.trim() || undefined;
  const [users, judges] = await Promise.all([
    load(request, (o) => api.admin.listUsers({ page: pageParam(request), pageSize: 50, search }, o)),
    load(request, (o) => api.admin.listJudges(undefined, o)),
  ]);
  return { users, judges, search: search ?? '', now: Date.now() };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const id = Number(form.get('id'));
  switch (form.get('intent')) {
    case 'level': {
      const level = LEVELS.find(([value]) => String(value) === form.get('level'))?.[0] ?? UserLevel.USER;
      return { scope: 'users', ...(await submit(request, (o) => api.admin.setUserLevel({ userId: id, level }, o))), message: 'User updated.' };
    }
    case 'create-judge': {
      const result = await submit(request, (o) => api.admin.createJudge({ name: String(form.get('name') ?? '') }, o));
      if (!result.ok) return { scope: 'judges', ...result };
      return { scope: 'judges', ok: true as const, message: `Judge "${result.data.judge.name}" created.`, token: result.data.token };
    }
    case 'toggle-judge': {
      const enabled = form.get('enabled') === 'true';
      return { scope: 'judges', ...(await submit(request, (o) => api.admin.setJudgeEnabled({ id, enabled }, o))), message: enabled ? 'Judge enabled.' : 'Judge disabled.' };
    }
    case 'delete-judge':
      return { scope: 'judges', ...(await submit(request, (o) => api.admin.deleteJudge({ id }, o))), message: 'Judge deleted.' };
    default:
      return { scope: 'users', ok: false as const, error: 'Unknown action' };
  }
}

export const meta: Route.MetaFunction = () => [{ title: 'Administration' }];

export default function Admin({ loaderData, actionData }: Route.ComponentProps) {
  const { users, judges, search, now } = loaderData;
  const { user: me } = useRoot();
  const myLevel = me?.level ?? 0;
  const token = actionData && 'token' in actionData ? actionData.token : null;

  return (
    <>
      <PageHeader title="Administration" />
      <div className="space-y-6">
        <Card title="Judge machines">
          <div className="space-y-3 p-4">
            {actionData?.scope === 'judges' && <Notice result={actionData} />}
            {token && (
              <div className="rounded-md border border-line bg-sunken p-3 text-sm">
                <p className="mb-1 font-medium">Copy this token into the judge's config now — it will not be shown again.</p>
                <code className="code break-all select-all">{token}</code>
              </div>
            )}
            <Form method="post" className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <span className="label">Register a new judge</span>
                <input className="input w-64" name="name" placeholder="e.g. judge-01" maxLength={64} required />
              </label>
              <button className="btn btn-primary" name="intent" value="create-judge">
                Create token
              </button>
            </Form>
          </div>
          {judges.length === 0 ? (
            <Empty>No judges registered. Submissions stay in the queue until a judge connects.</Empty>
          ) : (
            <div className="overflow-x-auto border-t border-line">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Last seen</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {judges.map((judge) => {
                    const online = judge.lastSeenAt !== null && now - Date.parse(judge.lastSeenAt) < 30_000;
                    return (
                      <tr key={judge.id}>
                        <td className="font-medium">{judge.name}</td>
                        <td>
                          {!judge.enabled ? (
                            <span className="text-muted">Disabled</span>
                          ) : online ? (
                            <span className="font-semibold text-good">Online</span>
                          ) : (
                            <span className="text-warn">Offline</span>
                          )}
                        </td>
                        <td className="text-muted">{judge.lastSeenAt ? <Time value={judge.lastSeenAt} /> : 'never'}</td>
                        <td>
                          <Form method="post" className="flex justify-end gap-2">
                            <input type="hidden" name="id" value={judge.id} />
                            <input type="hidden" name="enabled" value={String(!judge.enabled)} />
                            <button className="btn" name="intent" value="toggle-judge">
                              {judge.enabled ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              className="btn btn-danger"
                              name="intent"
                              value="delete-judge"
                              onClick={(event) => confirm(`Delete judge "${judge.name}"? Its token stops working.`) || event.preventDefault()}
                            >
                              Delete
                            </button>
                          </Form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title={`Users (${users.total})`}>
          <div className="space-y-3 p-4">
            {actionData?.scope === 'users' && <Notice result={actionData} />}
            <Form method="get" role="search" className="flex gap-2">
              <input className="input w-64" type="search" name="q" defaultValue={search} placeholder="Nickname or e-mail" aria-label="Search users" />
              <button className="btn">Search</button>
            </Form>
          </div>
          <div className="overflow-x-auto border-t border-line">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nickname</th>
                  <th>E-mail</th>
                  <th>Joined</th>
                  <th>Level</th>
                </tr>
              </thead>
              <tbody>
                {users.items.map((user) => {
                  const editable = user.id !== me?.id && user.level < myLevel;
                  return (
                    <tr key={user.id}>
                      <td className="tabular-nums">{user.id}</td>
                      <td>
                        <UserLink user={user} />
                        {(editable || user.id === me?.id) && (
                          <Link className="ml-2 text-xs" to={`/admin/users/${user.id}`}>
                            edit
                          </Link>
                        )}
                      </td>
                      <td className="text-muted">{user.email}</td>
                      <td className="text-muted">
                        <Time value={user.createdAt} />
                      </td>
                      <td>
                        {editable ? (
                          <Form method="post" className="flex items-center gap-2">
                            <input type="hidden" name="id" value={user.id} />
                            <select className="input w-auto" name="level" defaultValue={user.level} aria-label={`Level of ${user.nickname}`}>
                              {LEVELS.filter(([level]) => level < myLevel).map(([level, label]) => (
                                <option key={level} value={level}>
                                  {label}
                                </option>
                              ))}
                            </select>
                            <button className="btn" name="intent" value="level">
                              Set
                            </button>
                          </Form>
                        ) : (
                          LEVELS.find(([level]) => level === user.level)?.[1]
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Pagination page={users.page} pageSize={users.pageSize} total={users.total} />
    </>
  );
}
