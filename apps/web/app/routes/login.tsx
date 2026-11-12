import { Form, Link, redirect, useNavigation } from 'react-router';
import { Button, Card, Field, Measure, Muted, Notice, Stack } from '~/ui';
import { api, submit } from '~/lib/api.server';
import { getToken, startSession } from '~/lib/session.server';
import type { Route } from './+types/login';

/** Only same-site paths are accepted as a post-login destination. */
function safeNext(value: FormDataEntryValue | string | null): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/';
}

export async function loader({ request }: Route.LoaderArgs) {
  const next = safeNext(new URL(request.url).searchParams.get('next'));
  if (await getToken(request)) {
    const user = await api.auth.me(undefined, { context: { token: await getToken(request) } });
    if (user) throw redirect(next);
  }
  return { next };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const result = await submit(request, (o) =>
    api.auth.login({ identifier: String(form.get('identifier') ?? ''), password: String(form.get('password') ?? '') }, o),
  );
  if (!result.ok) return result;
  return redirect(safeNext(form.get('next')), { headers: { 'Set-Cookie': await startSession(result.data.token) } });
}

export const meta: Route.MetaFunction = () => [{ title: 'Log in' }];

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle';
  return (
    <Measure size="form">
      <Stack>
        <h1>Log in</h1>
        <Card>
          <Form method="post">
            <Stack>
              <input type="hidden" name="next" value={loaderData.next} />
              <Notice result={actionData} />
              <Field label="E-mail or nickname">
                <input name="identifier" autoComplete="username" required autoFocus />
              </Field>
              <Field label="Password">
                <input name="password" type="password" autoComplete="current-password" required />
              </Field>
              <Button block busy={busy}>
                Log in
              </Button>
            </Stack>
          </Form>
        </Card>
        <Muted small>
          No account yet? <Link to="/register">Register</Link>
        </Muted>
      </Stack>
    </Measure>
  );
}
