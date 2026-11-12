import { Form, redirect } from 'react-router';
import { Card, Field, Notice } from '~/components/ui';
import { api, load, submit } from '~/lib/api.server';
import type { Route } from './+types/settings';

export async function loader({ request }: Route.LoaderArgs) {
  const me = await load(request, (o) => api.auth.me(undefined, o));
  if (!me) throw redirect('/login?next=/settings');
  return { me, profile: await load(request, (o) => api.user.get({ id: me.id }, o)) };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? '').trim();

  if (form.get('intent') === 'password') {
    if (form.get('newPassword') !== form.get('repeat')) {
      return { intent: 'password', ok: false as const, error: 'The two passwords do not match' };
    }
    const result = await submit(request, (o) =>
      api.user.changePassword(
        { oldPassword: String(form.get('oldPassword') ?? ''), newPassword: String(form.get('newPassword') ?? '') },
        o,
      ),
    );
    return { intent: 'password', ...result, message: 'Password changed.' };
  }

  const result = await submit(request, (o) =>
    api.user.updateProfile(
      {
        nickname: text('nickname'),
        realname: text('realname') || null,
        quote: text('quote') || null,
        quoteRef: text('quoteRef') || null,
        avatarUrl: text('avatarUrl') || null,
      },
      o,
    ),
  );
  return { intent: 'profile', ...result, message: 'Profile saved.' };
}

export const meta: Route.MetaFunction = () => [{ title: 'Settings' }];

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const { me, profile } = loaderData;
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1>Settings</h1>
      <Card title="Profile">
        <Form method="post" className="space-y-4 p-4">
          <input type="hidden" name="intent" value="profile" />
          {actionData?.intent === 'profile' && <Notice result={actionData} />}
          <Field label="E-mail">
            <input className="input" value={me.email} disabled />
          </Field>
          <Field label="Nickname">
            <input className="input" name="nickname" defaultValue={profile.nickname} minLength={2} maxLength={32} required />
          </Field>
          <Field label="Real name" hint="Optional.">
            <input className="input" name="realname" defaultValue={profile.realname ?? ''} maxLength={30} />
          </Field>
          <Field label="Avatar URL" hint="Optional link to an image. Without one, your Gravatar is shown.">
            <input className="input" name="avatarUrl" type="url" defaultValue={profile.avatarUrl?.includes('gravatar.com/avatar/') ? '' : (profile.avatarUrl ?? '')} maxLength={500} />
          </Field>
          <Field label="Quote">
            <textarea className="input" name="quote" rows={3} defaultValue={profile.quote ?? ''} maxLength={500} />
          </Field>
          <Field label="Quote source" hint="Who said it.">
            <input className="input" name="quoteRef" defaultValue={profile.quoteRef ?? ''} maxLength={80} />
          </Field>
          <button className="btn btn-primary">Save profile</button>
        </Form>
      </Card>

      <Card title="Password">
        <Form method="post" className="space-y-4 p-4">
          <input type="hidden" name="intent" value="password" />
          {actionData?.intent === 'password' && <Notice result={actionData} />}
          <Field label="Current password">
            <input className="input" name="oldPassword" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="New password">
            <input className="input" name="newPassword" type="password" autoComplete="new-password" minLength={6} required />
          </Field>
          <Field label="Repeat new password">
            <input className="input" name="repeat" type="password" autoComplete="new-password" minLength={6} required />
          </Field>
          <button className="btn">Change password</button>
        </Form>
      </Card>
    </div>
  );
}
