import { UserLevel } from '@skyoj/contract';
import { data, Form, isRouteErrorResponse, Link, Links, Meta, NavLink, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { Route } from './+types/root';
import './app.css';
import { api, as } from './lib/api.server';
import { SITE_NAME, SITE_TIMEZONE } from './lib/site.server';


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

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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

const navLinks = [
  { to: '/problems', label: 'Problems' },
  { to: '/submissions', label: 'Submissions' },
  { to: '/contests', label: 'Contests' },
  { to: '/scoreboards', label: 'Scoreboards' },
  { to: '/codepad', label: 'Codepad' },
];

function navClass({ isActive }: { isActive: boolean }) {
  return `rounded-md px-2.5 py-1.5 text-sm font-medium no-underline hover:bg-sunken hover:no-underline ${
    isActive ? 'bg-sunken text-text' : 'text-muted'
  }`;
}

export default function App({ loaderData }: Route.ComponentProps) {
  const { user, siteName } = loaderData;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
          <Link to="/" className="mr-2 text-base font-semibold tracking-tight text-text no-underline hover:no-underline">
            <span className="text-accent">▲</span> {siteName}
          </Link>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
            {navLinks.map((link) => (
              <NavLink key={link.to} to={link.to} className={navClass}>
                {link.label}
              </NavLink>
            ))}
            {user && user.level >= UserLevel.ADMIN && (
              <NavLink to="/admin" className={navClass}>
                Admin
              </NavLink>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {user ? (
              <>
                <NavLink to={`/users/${user.id}`} className={navClass}>
                  {user.nickname}
                </NavLink>
                <NavLink to="/settings" className={navClass}>
                  Settings
                </NavLink>
                <Form method="post" action="/logout">
                  <button className="cursor-pointer rounded-md px-2.5 py-1.5 text-sm font-medium text-muted hover:bg-sunken">
                    Log out
                  </button>
                </Form>
              </>
            ) : (
              <>
                <NavLink to="/login" className={navClass}>
                  Log in
                </NavLink>
                <Link to="/register" className="btn btn-primary">
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-line py-4 text-center text-xs text-muted">{siteName}</footer>
    </div>
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
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1>{title}</h1>
      <p className="mt-2 text-muted">{detail}</p>
      <p className="mt-6">
        <a className="btn" href="/">
          Back to the home page
        </a>
      </p>
    </main>
  );
}
