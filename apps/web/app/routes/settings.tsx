import { INTRODUCTION_MAX_LENGTH } from '@skyoj/contract';
import { Form, redirect } from 'react-router';
import { api, load, submit } from '~/lib/api.server';
import { Button, Card, css, Field, Measure, Notice, Stack } from '~/ui';
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
        introduction: text('introduction') || null,
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
  // The API substitutes a Gravatar when no picture is set; do not echo that back.
  const ownAvatar = profile.avatarUrl?.includes('gravatar.com/avatar/') ? '' : (profile.avatarUrl ?? '');
  return (
    <Measure size="page">
      <Stack gap="lg">
        <h1>Settings</h1>
        <Card title="Profile">
          <Form method="post">
            <Stack>
              <input type="hidden" name="intent" value="profile" />
              {actionData?.intent === 'profile' && <Notice result={actionData} />}
              <Field label="E-mail">
                <input value={me.email} disabled />
              </Field>
              <Field label="Nickname">
                <input name="nickname" defaultValue={profile.nickname} minLength={2} maxLength={32} required />
              </Field>
              <Field label="Real name" hint="Optional.">
                <input name="realname" defaultValue={profile.realname ?? ''} maxLength={30} />
              </Field>
              <Field label="Avatar URL" hint="Optional link to an image. Without one, your Gravatar is shown.">
                <input name="avatarUrl" type="url" defaultValue={ownAvatar} maxLength={500} />
              </Field>
              <Field
                label="Self-introduction"
                hint="Shown on your profile. Markdown with TeX math, like problem statements.">
                <textarea
                  className={css.monoInput}
                  name="introduction"
                  rows={8}
                  defaultValue={profile.introduction ?? ''}
                  maxLength={INTRODUCTION_MAX_LENGTH}
                />
              </Field>
              <div>
                <Button>Save profile</Button>
              </div>
            </Stack>
          </Form>
        </Card>

        <Card title="Password">
          <Form method="post">
            <Stack>
              <input type="hidden" name="intent" value="password" />
              {actionData?.intent === 'password' && <Notice result={actionData} />}
              <Field label="Current password">
                <input name="oldPassword" type="password" autoComplete="current-password" required />
              </Field>
              <Field label="New password">
                <input name="newPassword" type="password" autoComplete="new-password" minLength={6} required />
              </Field>
              <Field label="Repeat new password">
                <input name="repeat" type="password" autoComplete="new-password" minLength={6} required />
              </Field>
              <div>
                <Button variant="secondary">Change password</Button>
              </div>
            </Stack>
          </Form>
        </Card>
      </Stack>
    </Measure>
  );
}
