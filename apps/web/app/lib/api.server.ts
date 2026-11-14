import { ORPCError } from '@orpc/client';
import { type DehydratedState, dehydrate, type FetchQueryOptions, QueryClient } from '@tanstack/react-query';
import { data, redirect } from 'react-router';
import { api, type ClientContext } from './orpc';
import { getToken } from './session.server';

export { api };

type CallOptions = { context: ClientContext };

/** How long `awaitCreation` waits for a queued write to land: 25 × 200 ms = 5 s. */
const CREATION_WAIT_ATTEMPTS = 25;
const CREATION_WAIT_STEP_MS = 200;

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
      const pending =
        awaitCreation && error instanceof ORPCError && error.code === 'NOT_FOUND' && attempt < CREATION_WAIT_ATTEMPTS;
      if (!pending) return fail(request, error);
      await new Promise((resolve) => setTimeout(resolve, CREATION_WAIT_STEP_MS));
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

/**
 * Options of any query: `prefetch` takes a mixed list (one entry per
 * procedure), which TypeScript can only express with `any` parameters.
 */
// biome-ignore lint/suspicious/noExplicitAny: a heterogeneous list of generic query options.
type AnyQueryOptions = FetchQueryOptions<any, any, any, any>;

/**
 * Runs queries on the server and returns their results in TanStack Query's
 * dehydrated form. A loader returns this as `dehydrated`; the root layout
 * hydrates it, and the page's `useQuery` calls with the same options find
 * the data already there — rendered on the server, then kept fresh in the
 * browser.
 *
 * @example
 *   const dehydrated = await prefetch(request, (context) => [
 *     orpc.submission.get.queryOptions({ input: { id }, context }),
 *   ]);
 */
export async function prefetch(
  request: Request,
  build: (context: ClientContext) => AnyQueryOptions[],
  options: { awaitCreation?: boolean } = {},
): Promise<DehydratedState> {
  const { context } = await as(request);
  const client = new QueryClient();
  await load(request, () => Promise.all(build(context).map((query) => client.fetchQuery(query))), options);
  return dehydrate(client);
}

/**
 * Dehydrated state for data a loader already has in hand (because it needed
 * the value itself, e.g. to highlight code): `[queryKey, data]` pairs.
 */
export function seed(entries: [key: readonly unknown[], value: unknown][]): DehydratedState {
  const client = new QueryClient();
  for (const [key, value] of entries) client.setQueryData(key, value);
  return dehydrate(client);
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Runs an API call for an action. Contract errors are returned so the form
 * can show them next to the fields instead of leaving the page.
 */
export async function submit<T>(
  request: Request,
  call: (options: CallOptions) => Promise<T>,
): Promise<ActionResult<T>> {
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
