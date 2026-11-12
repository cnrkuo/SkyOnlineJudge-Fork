import { createORPCClient, ORPCError } from '@orpc/client';
import type { ContractRouterClient } from '@orpc/contract';
import type { JsonifiedClient } from '@orpc/openapi-client';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import { contract } from '@skyoj/contract';
import { data, redirect } from 'react-router';
import { getToken } from './session.server';

/** Per-call context: whose session the call is made with. */
interface ClientContext {
  token?: string;
}

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3001';

/**
 * The one and only API client of the web app.
 *
 * It lives on the web server: loaders and actions call the NestJS API through
 * it and browsers never talk to the API directly. Inputs, outputs and error
 * codes are all inferred from the shared oRPC contract.
 */
export const api: JsonifiedClient<ContractRouterClient<typeof contract, ClientContext>> = createORPCClient(
  new OpenAPILink<ClientContext>(contract, {
    url: API_URL,
    headers: ({ context }) => (context.token ? { authorization: `Bearer ${context.token}` } : {}),
  }),
);

type CallOptions = { context: ClientContext };

/** Call options that make `api` act as the user who sent `request`. */
export async function as(request: Request): Promise<CallOptions> {
  return { context: { token: await getToken(request) } };
}

/**
 * Runs an API call for a loader. Contract errors become the matching HTTP
 * response (rendered by the route error boundary); a missing session
 * redirects to the login page and back.
 */
export async function load<T>(request: Request, call: (options: CallOptions) => Promise<T>): Promise<T> {
  try {
    return await call(await as(request));
  } catch (error) {
    if (!(error instanceof ORPCError)) throw error;
    if (error.code === 'UNAUTHORIZED') {
      const url = new URL(request.url);
      throw redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
    }
    throw data(error.message, { status: error.status });
  }
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Runs an API call for an action. Contract errors are returned so the form
 * can show them next to the fields instead of leaving the page.
 */
export async function submit<T>(request: Request, call: (options: CallOptions) => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await call(await as(request)) };
  } catch (error) {
    if (!(error instanceof ORPCError)) throw error;
    return { ok: false, error: describe(error) };
  }
}

/** Turns validation issues into a readable sentence. */
function describe(error: ORPCError<string, unknown>): string {
  const issues = (error.data as { issues?: { path?: (string | number)[]; message: string }[] } | undefined)?.issues;
  if (!issues?.length) return error.message;
  return issues.map((issue) => `${issue.path?.join('.') || 'input'}: ${issue.message}`).join('; ');
}
