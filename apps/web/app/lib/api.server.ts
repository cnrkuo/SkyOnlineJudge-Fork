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
export async function load<T>(
  request: Request,
  call: (options: CallOptions) => Promise<T>,
  { awaitCreation = false }: { awaitCreation?: boolean } = {},
): Promise<T> {
  const options = await as(request);
  // Writes go through a queue, so something that was just created may take
  // a moment to become readable. `awaitCreation` rides that out.
  for (let attempt = 0; ; attempt++) {
    try {
      return await call(options);
    } catch (error) {
      const pending = awaitCreation && error instanceof ORPCError && error.code === 'NOT_FOUND' && attempt < 25;
      if (!pending) return fail(request, error);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

/** Turns a failed API call into the response a loader should throw. */
function fail(request: Request, error: unknown): never {
  if (!(error instanceof ORPCError)) throw error;
  if (error.code === 'UNAUTHORIZED') {
    const url = new URL(request.url);
    throw redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  throw data(error.message, { status: error.status });
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
  const issues = (error.data as { issues?: { message: string }[] } | undefined)?.issues;
  if (!issues?.length) return error.message;
  // ArkType messages already name the field ("email must be an email address").
  return issues.map((issue) => issue.message).join('; ');
}
