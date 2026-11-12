import { Form } from 'react-router';
import { idParam } from '~/lib/params';
import { Button, ButtonLink, Card, Field, Measure, Notice, PageHeader, Stack } from '~/ui';
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
    <Measure size="page">
      <PageHeader title={`Edit user #${user.id}`} actions={<ButtonLink to="/admin">Back to administration</ButtonLink>} />
      <Card>
        <Form method="post">
          <Stack>
            <Notice result={actionData} />
            <Field label="Nickname">
              <input name="nickname" defaultValue={user.nickname} minLength={2} maxLength={32} required />
            </Field>
            <Field label="Real name">
              <input name="realname" defaultValue={user.realname ?? ''} maxLength={30} />
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
