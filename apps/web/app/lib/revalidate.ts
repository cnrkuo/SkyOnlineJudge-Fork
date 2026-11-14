import { useEffect, useState } from 'react';
import { type ShouldRevalidateFunctionArgs, useRevalidator } from 'react-router';

/**
 * For pages whose data is driven by TanStack Query: when only the query
 * string changes (paging, filters, search), skip the loader. The page's
 * `useQuery` sees the new parameters and fetches through `/rpc` itself,
 * keeping the previous rows on screen meanwhile. Loaders still run for the
 * first render, for navigation between pages and after form submissions.
 */
export function unlessOnlySearchChanged({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (formMethod !== undefined && formMethod !== 'GET') return true;
  if (currentUrl.pathname === nextUrl.pathname) return false;
  return defaultShouldRevalidate;
}

/** Waits this long past the moment, so the server is sure to agree it has come. */
const SLACK_MS = 1000;
/** If the server does not agree yet (the browser's clock runs ahead), ask again this often… */
const RETRY_MS = 5000;
/** …for at most this long. */
const GIVE_UP_AFTER_MS = 2 * 60_000;
/** Longest delay `setTimeout` supports (about 24.8 days). */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Reloads the page's data at `instant` — e.g. when a contest starts or
 * ends — so the page does not keep showing the phase it was opened in. The
 * server decides what changed; the browser's clock only picks the moment.
 */
export function useRefreshAt(instant: string | null) {
  const { revalidate } = useRevalidator();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!instant) return;
    const remaining = Date.parse(instant) - Date.now();
    if (remaining < -GIVE_UP_AFTER_MS || remaining > MAX_TIMEOUT_MS) return;
    const timer = setTimeout(
      () => {
        void revalidate();
        setAttempt((count) => count + 1);
      },
      Math.max(remaining + SLACK_MS, attempt > 0 ? RETRY_MS : 0),
    );
    return () => clearTimeout(timer);
  }, [instant, attempt, revalidate]);
}
