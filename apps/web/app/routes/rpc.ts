import { apiUrl } from '~/lib/orpc';
import { getToken } from '~/lib/session.server';
import type { Route } from './+types/rpc';

/**
 * Same-origin gateway for the browser's oRPC client (TanStack Query).
 *
 * The browser cannot reach the API and must not hold the session token, so
 * it calls `/rpc/<namespace>/<procedure>` here. This route attaches the
 * token from the http-only cookie and relays the call unchanged; validation
 * and authorization still happen in the API.
 */

/** Sessions are managed by form actions; judges do not go through the site. */
const BLOCKED = /^(auth|judge)\//;
const PROCEDURE = /^[A-Za-z]+\/[A-Za-z]+$/;

const refuse = (status: number, code: string, message: string) => Response.json({ code, status, message }, { status });

export async function action({ request, params }: Route.ActionArgs) {
  const procedure = params['*'] ?? '';
  if (!PROCEDURE.test(procedure) || BLOCKED.test(procedure)) return refuse(404, 'NOT_FOUND', 'No such procedure');

  // Defence in depth on top of the SameSite=Lax cookie: only this site's own
  // pages may drive the gateway.
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== request.headers.get('Host')) {
    return refuse(403, 'FORBIDDEN', 'Cross-origin calls are not allowed');
  }

  const token = await getToken(request);
  const headers = new Headers({ 'Content-Type': request.headers.get('Content-Type') ?? 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const upstream = await fetch(`${apiUrl()}/${procedure}`, {
    method: 'POST',
    headers,
    body: request.body,
    // Required by fetch when the body is a stream.
    duplex: 'half',
  } as RequestInit);

  const relayed = new Headers({ 'Cache-Control': 'no-store' });
  for (const name of ['Content-Type', 'Content-Disposition']) {
    const value = upstream.headers.get(name);
    if (value) relayed.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: relayed });
}

export const loader = () => refuse(405, 'METHOD_NOT_ALLOWED', 'Use POST');
