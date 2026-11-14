import { Form, Link, redirect, useNavigation } from 'react-router';
import { api, submit } from '~/lib/api.server';
import { startSession } from '~/lib/session.server';
import { Button, Card, Field, Measure, Muted, Notice, Stack } from '~/ui';
import type { Route } from './+types/register';

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  if (password !== form.get('repeat')) return { ok: false as const, error: 'The two passwords do not match' };
  const result = await submit(request, (o) =>
    api.auth.register(
      { email: String(form.get('email') ?? ''), nickname: String(form.get('nickname') ?? ''), password },
      o,
    ),
  );
  if (!result.ok) return result;
  return redirect('/', { headers: { 'Set-Cookie': await startSession(result.data.token) } });
}

export const meta: Route.MetaFunction = () => [{ title: 'Register' }];

export default function Register({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle';
  return (
    <Measure size="form">
      <Stack>
        <h1>Create an account</h1>
        <Card>
          <Form method="post">
            <Stack>
              <Notice result={actionData} />
              <Field label="E-mail">
                <input name="email" type="email" autoComplete="email" maxLength={64} required />
              </Field>
              <Field label="Nickname" hint="2–32 characters; shown on scoreboards.">
                <input name="nickname" autoComplete="nickname" minLength={2} maxLength={32} required />
              </Field>
              <Field label="Password" hint="At least 6 characters.">
                <input name="password" type="password" autoComplete="new-password" minLength={6} required />
              </Field>
              <Field label="Repeat password">
                <input name="repeat" type="password" autoComplete="new-password" minLength={6} required />
              </Field>
              <Button block busy={busy}>
                Register
              </Button>
            </Stack>
          </Form>
        </Card>
        <Muted small>
          Already registered? <Link to="/login">Log in</Link>
        </Muted>
      </Stack>
    </Measure>
  );
}
