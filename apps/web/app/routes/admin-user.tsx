import { Form, Link } from 'react-router';
import { Card, Field, idParam, Notice, PageHeader } from '~/components/ui';
import { api, load, submit } from '~/lib/api.server';
import type { Route } from './+types/admin-user';

export async function loader({ request, params }: Route.LoaderArgs) {
  const userId = idParam(params.id);
  // Listing users is admin-only, which also guards this page.
  await load(request, (o) => api.admin.listUsers({ pageSize: 1 }, o));
  return load(request, (o) => api.user.get({ id: userId }, o));
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const newPassword = String(form.get('newPassword') ?? '');
  const result = await submit(request, (o) =>
    api.admin.updateUser(
      {
        userId: idParam(params.id),
        nickname: String(form.get('nickname') ?? '').trim(),
        realname: String(form.get('realname') ?? '').trim() || null,
        ...(newPassword ? { newPassword } : {}),
      },
      o,
    ),
  );
  return { ...result, message: newPassword ? 'Saved. The user has been logged out everywhere.' : 'Saved.' };
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Edit user ${loaderData?.nickname ?? ''}` }];

export default function AdminUser({ loaderData: user, actionData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={`Edit user #${user.id}`}
        actions={
          <Link className="btn" to="/admin">
            Back to administration
          </Link>
        }
      />
      <Card>
        <Form method="post" className="space-y-4 p-4">
          <Notice result={actionData} />
          <Field label="Nickname">
            <input className="input" name="nickname" defaultValue={user.nickname} minLength={2} maxLength={32} required />
          </Field>
          <Field label="Real name">
            <input className="input" name="realname" defaultValue={user.realname ?? ''} maxLength={30} />
          </Field>
          <Field label="New password" hint="Leave empty to keep the current one. The old password is not needed.">
            <input className="input" name="newPassword" type="password" autoComplete="new-password" minLength={6} />
          </Field>
          <button className="btn btn-primary">Save</button>
        </Form>
      </Card>
    </div>
  );
}
