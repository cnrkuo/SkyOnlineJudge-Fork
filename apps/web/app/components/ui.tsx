import { ContestPhase, Verdict, VERDICT_LABEL, VERDICT_SHORT } from '@skyoj/contract';
import type { ReactNode } from 'react';
import { Link, useRouteLoaderData, useSearchParams } from 'react-router';
import { formatDateTime } from '~/lib/time';
import type { loader as rootLoader } from '~/root';

export function useRoot() {
  return useRouteLoaderData<typeof rootLoader>('root')!;
}

export function PageHeader({ title, meta, actions }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1>{title}</h1>
        {meta && <div className="mt-1 text-sm text-muted">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && <h2 className="border-b border-line px-4 py-2.5 text-base">{title}</h2>}
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

/** Feedback from an action: an error, or a confirmation. */
export function Notice({ result }: { result?: { ok: boolean; error?: string; message?: string } | null }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
        {result.error}
      </p>
    );
  }
  if (!result.message) return null;
  return (
    <p role="status" className="rounded-md border border-good/40 bg-good/10 px-3 py-2 text-sm text-good">
      {result.message}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-muted">{children}</p>;
}

function verdictTone(verdict: Verdict): string {
  if (verdict === Verdict.AC) return 'text-good';
  if (verdict === Verdict.WAIT || verdict === Verdict.JUDGING) return 'text-muted';
  if (verdict === Verdict.CE || verdict === Verdict.JE || verdict === Verdict.SE) return 'text-info';
  if (verdict === Verdict.TLE || verdict === Verdict.MLE || verdict === Verdict.OLE) return 'text-warn';
  return 'text-bad';
}

export function VerdictBadge({ verdict, long = false }: { verdict: Verdict; long?: boolean }) {
  return (
    <span className={`font-semibold whitespace-nowrap ${verdictTone(verdict)}`} title={VERDICT_LABEL[verdict]}>
      {long ? VERDICT_LABEL[verdict] : VERDICT_SHORT[verdict]}
    </span>
  );
}

export function PhaseBadge({ phase }: { phase: ContestPhase }) {
  const tone = phase === ContestPhase.RUNNING ? 'text-good' : phase === ContestPhase.PREPARING ? 'text-accent' : 'text-muted';
  const label = phase === ContestPhase.RUNNING ? 'Running' : phase === ContestPhase.PREPARING ? 'Upcoming' : 'Ended';
  return <span className={`font-semibold ${tone}`}>{label}</span>;
}

export function UserLink({ user }: { user: { id: number; nickname: string } }) {
  return <Link to={`/users/${user.id}`}>{user.nickname}</Link>;
}

/** Timestamp in the site timezone. */
export function Time({ value }: { value: string }) {
  const { timeZone } = useRoot();
  return (
    <time dateTime={value} className="whitespace-nowrap tabular-nums">
      {formatDateTime(value, timeZone)}
    </time>
  );
}

export function Pagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const [params] = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const to = (target: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(target));
    return `?${next}`;
  };
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
      {page > 1 ? (
        <Link className="btn" to={to(page - 1)} rel="prev">
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link className="btn" to={to(page + 1)} rel="next">
          Older →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function pageParam(request: Request): number {
  const page = Number(new URL(request.url).searchParams.get('page'));
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/** Positive integer route/query parameter, or a 404. */
export function idParam(value: string | undefined | null): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Response('Not found', { status: 404 });
  return id;
}
