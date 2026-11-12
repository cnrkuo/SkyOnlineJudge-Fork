import { Form, Link, redirect, useNavigation } from 'react-router';
import { Field, Notice } from '~/components/ui';
import { api, submit } from '~/lib/api.server';
import { startSession } from '~/lib/session.server';
import type { Route } from './+types/register';

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  if (password !== form.get('repeat')) return { ok: false as const, error: 'The two passwords do not match' };
  const result = await submit(request, (o) =>
    api.auth.register({ email: String(form.get('email') ?? ''), nickname: String(form.get('nickname') ?? ''), password }, o),
  );
  if (!result.ok) return result;
  return redirect('/', { headers: { 'Set-Cookie': await startSession(result.data.token) } });
}

export const meta: Route.MetaFunction = () => [{ title: 'Register' }];

export default function Register({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle';
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4">Create an account</h1>
      <Form method="post" className="card space-y-4 p-4">
        <Notice result={actionData} />
        <Field label="E-mail">
          <input className="input" name="email" type="email" autoComplete="email" maxLength={64} required />
        </Field>
        <Field label="Nickname" hint="2–32 characters; shown on scoreboards.">
          <input className="input" name="nickname" autoComplete="nickname" minLength={2} maxLength={32} required />
        </Field>
        <Field label="Password" hint="At least 6 characters.">
          <input className="input" name="password" type="password" autoComplete="new-password" minLength={6} required />
        </Field>
        <Field label="Repeat password">
          <input className="input" name="repeat" type="password" autoComplete="new-password" minLength={6} required />
        </Field>
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Register'}
        </button>
      </Form>
      <p className="mt-3 text-center text-sm text-muted">
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
