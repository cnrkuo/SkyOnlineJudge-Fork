import { Form, Link, redirect, useNavigation } from 'react-router';
import { Field, Notice } from '~/components/ui';
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
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4">Log in</h1>
      <Form method="post" className="card space-y-4 p-4">
        <input type="hidden" name="next" value={loaderData.next} />
        <Notice result={actionData} />
        <Field label="E-mail or nickname">
          <input className="input" name="identifier" autoComplete="username" required autoFocus />
        </Field>
        <Field label="Password">
          <input className="input" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </Form>
      <p className="mt-3 text-center text-sm text-muted">
        No account yet? <Link to="/register">Register</Link>
      </p>
    </div>
  );
}
