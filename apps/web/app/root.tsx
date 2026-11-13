import { UserLevel } from '@skyoj/contract';
import { HydrationBoundary, QueryClient, QueryClientProvider, type DehydratedState } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import {
  data,
  Form,
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  useMatches,
} from 'react-router';
import type { Route } from './+types/root';
import { api, as } from './lib/api.server';
import { SITE_NAME, SITE_TIMEZONE } from './lib/site.server';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/400-italic.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/400-italic.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/app.css';
import { Button, ButtonLink, css } from './ui';
import { shell } from './ui/classes';
import { TooltipProvider } from './ui/overlays';

const MAX_BODY_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 256) * 1024 * 1024;

/**
 * Runs before every loader and action. Uploads are buffered in memory, so
 * oversized requests are turned away before anything reads the body.
 */
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request }, next) => {
    if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) {
      throw data('The upload is too large', { status: 413 });
    }
    return next();
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await api.auth.me(undefined, await as(request));
  return { user, siteName: SITE_NAME, timeZone: SITE_TIMEZONE };
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: loaderData?.siteName ?? 'Online Judge' }];

/** Only refetch the session after a mutation, not on every navigation. */
export function shouldRevalidate({ formMethod }: { formMethod?: string }) {
  return formMethod !== undefined && formMethod !== 'GET';
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    // Dark mode only: Bootstrap's dark palette, fixed for every visitor.
    <html lang="en" data-bs-theme="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Puts everything the active routes prefetched (`prefetch()` in their
 * loaders) into the query cache before the page renders, so `useQuery`
 * starts with data on the server and in the browser alike.
 */
function Hydrated({ children }: { children: ReactNode }) {
  const states = useMatches()
    .map((match) => (match.loaderData as { dehydrated?: DehydratedState } | undefined)?.dehydrated)
    .filter((state) => state !== undefined);
  return states.reduceRight<ReactNode>((inner, state) => <HydrationBoundary state={state}>{inner}</HydrationBoundary>, children);
}

const navLinkClass = ({ isActive }: { isActive: boolean }) => (isActive ? shell.navLinkActive : shell.navLink);

const navLinks = [
  { to: '/problems', label: 'Problems' },
  { to: '/submissions', label: 'Submissions' },
  { to: '/contests', label: 'Contests' },
  { to: '/scoreboards', label: 'Scoreboards' },
  { to: '/codepad', label: 'Codepad' },
];

export default function App({ loaderData }: Route.ComponentProps) {
  const { user, siteName } = loaderData;
  // One cache per browser tab, and a fresh one for every server render.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Server-rendered data is fresh; do not refetch it on arrival.
          queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <div className={shell.page}>
          <header className={shell.header}>
            <nav aria-label="Main" className={`${css.container} ${shell.nav}`}>
              <Link to="/" className={shell.brand}>
                {siteName}
              </Link>
              <div className={shell.navLinks}>
                {navLinks.map((link) => (
                  <NavLink key={link.to} to={link.to} className={navLinkClass}>
                    {link.label}
                  </NavLink>
                ))}
                {user && user.level >= UserLevel.ADMIN && (
                  <NavLink to="/admin" className={navLinkClass}>
                    Admin
                  </NavLink>
                )}
              </div>
              <div className={shell.navEnd}>
                {user ? (
                  <>
                    <NavLink to={`/users/${user.id}`} className={navLinkClass}>
                      {user.nickname}
                    </NavLink>
                    <NavLink to="/settings" className={navLinkClass}>
                      Settings
                    </NavLink>
                    <Form method="post" action="/logout">
                      <Button variant="secondary" size="sm">
                        Log out
                      </Button>
                    </Form>
                  </>
                ) : (
                  <>
                    <NavLink to="/login" className={navLinkClass}>
                      Log in
                    </NavLink>
                    <ButtonLink to="/register" size="sm">
                      Register
                    </ButtonLink>
                  </>
                )}
              </div>
            </nav>
          </header>
          <main className={`${css.container} ${shell.main}`}>
            <Hydrated>
              <Outlet />
            </Hydrated>
          </main>
          <footer className={shell.footer}>{siteName}</footer>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = 'Something went wrong';
  let detail = 'An unexpected error occurred. Please try again.';
  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? 'Not found' : error.status === 403 ? 'Access denied' : `Error ${error.status}`;
    detail = typeof error.data === 'string' && error.data ? error.data : error.statusText || detail;
  } else if (import.meta.env.DEV && error instanceof Error) {
    detail = error.message;
  }
  return (
    <main className={shell.errorPage}>
      <h1>{title}</h1>
      <p className={css.muted}>{detail}</p>
      <p>
        <a role="button" className={css.button({ variant: 'secondary' })} href="/">
          Back to the home page
        </a>
      </p>
    </main>
  );
}
