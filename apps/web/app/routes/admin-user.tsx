import { Form, redirect } from 'react-router';
import { api, load, submit } from '~/lib/api.server';
import { Button, ButtonLink, Card, Field, Measure, Notice, PageHeader, Stack } from '~/ui';
import type { Route } from './+types/admin-user';

export async function loader({ request, params }: Route.LoaderArgs) {
  // Listing users is admin-only, which also guards this page.
  await load(request, (o) => api.admin.listUsers({ pageSize: 1 }, o));
  return load(request, (o) => api.user.get({ username: params.username }, o));
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const newPassword = String(form.get('newPassword') ?? '');
  const user = await load(request, (o) => api.user.get({ username: params.username }, o));
  const username = String(form.get('username') ?? '').trim();
  const result = await submit(request, (o) =>
    api.admin.updateUser(
      {
        userId: user.id,
        username,
        nickname: String(form.get('nickname') ?? '').trim() || null,
        ...(newPassword ? { newPassword } : {}),
      },
      o,
    ),
  );
  // A new username is a new address for this page.
  if (result.ok && username !== user.username) throw redirect(`/admin/users/${encodeURIComponent(username)}`);
  return { ...result, message: newPassword ? 'Saved. The user has been logged out everywhere.' : 'Saved.' };
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Edit user ${loaderData?.username ?? ''}` }];

export default function AdminUser({ loaderData: user, actionData }: Route.ComponentProps) {
  return (
    <Measure size="page">
      <PageHeader
        title={`Edit ${user.username}`}
        actions={<ButtonLink to="/admin">Back to administration</ButtonLink>}
      />
      <Card>
        <Form method="post">
          <Stack>
            <Notice result={actionData} />
            <Field label="Username">
              <input name="username" defaultValue={user.username} minLength={2} maxLength={32} required />
            </Field>
            <Field label="Nickname">
              <input name="nickname" defaultValue={user.nickname ?? ''} maxLength={30} />
            </Field>
            <Field label="New password" hint="Leave empty to keep the current one. The old password is not needed.">
              <input name="newPassword" type="password" autoComplete="new-password" minLength={6} />
            </Field>
            <div>
              <Button>Save</Button>
            </div>
          </Stack>
        </Form>
      </Card>
    </Measure>
  );
}
