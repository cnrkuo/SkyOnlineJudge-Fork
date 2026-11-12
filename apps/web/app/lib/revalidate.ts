import type { ShouldRevalidateFunctionArgs } from 'react-router';

/**
 * For pages whose data is driven by TanStack Query: when only the query
 * string changes (paging, filters, search), skip the loader. The page's
 * `useQuery` sees the new parameters and fetches through `/rpc` itself,
 * keeping the previous rows on screen meanwhile. Loaders still run for the
 * first render, for navigation between pages and after form submissions.
 */
export function unlessOnlySearchChanged({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (formMethod !== undefined && formMethod !== 'GET') return true;
  if (currentUrl.pathname === nextUrl.pathname) return false;
  return defaultShouldRevalidate;
}
