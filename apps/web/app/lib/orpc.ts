import { createORPCClient } from '@orpc/client';
import type { ContractRouterClient } from '@orpc/contract';
import type { JsonifiedClient } from '@orpc/openapi-client';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import { contract } from '@skyoj/contract';

/** Per-call context: whose session a server-side call is made with. */
export interface ClientContext {
  token?: string;
}

/**
 * The one API client of the web app, typed end to end by the shared oRPC
 * contract. It is the same object on both sides; only its transport differs:
 *
 * - **On the web server** (loaders, actions, SSR) it calls the NestJS API
 *   directly and authenticates with the token passed as call context.
 * - **In the browser** it calls this site's own `/rpc/*` route, which adds
 *   the token from the http-only session cookie and forwards the call
 *   (`routes/rpc.ts`). The browser never sees the token or the API's address.
 */
const link = new OpenAPILink<ClientContext>(
  contract,
  typeof window === 'undefined'
    ? {
        url: process.env.API_URL ?? 'http://127.0.0.1:3001',
        headers: ({ context }) => (context.token ? { authorization: `Bearer ${context.token}` } : {}),
      }
    : { url: `${window.location.origin}/rpc` },
);

export const api: JsonifiedClient<ContractRouterClient<typeof contract, ClientContext>> = createORPCClient(link);

/**
 * TanStack Query bindings: `orpc.problem.list.queryOptions({ input })`,
 * `orpc.submission.rejudge.mutationOptions()`, `orpc.submission.key()` …
 * Query keys are derived from the procedure path and input, so a query
 * prefetched on the server is found again by the same call in the browser.
 */
export const orpc = createTanstackQueryUtils(api);
