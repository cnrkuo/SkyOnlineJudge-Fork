import { redirect } from 'react-router';
import { api, submit } from '~/lib/api.server';
import { endSession } from '~/lib/session.server';
import type { Route } from './+types/logout';

export async function action({ request }: Route.ActionArgs) {
  // Revoke the token server-side, then drop the cookie either way.
  await submit(request, (o) => api.auth.logout(undefined, o));
  return redirect('/', { headers: { 'Set-Cookie': await endSession() } });
}

export const loader = () => redirect('/');
