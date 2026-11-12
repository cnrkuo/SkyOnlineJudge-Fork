/**
 * The UI kit. Pages are composed from these components and write no styles
 * of their own; see docs/design.md for the rules behind them.
 */
import { ContestPhase, Verdict, VERDICT_LABEL, VERDICT_SHORT } from '@skyoj/contract';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { Link, useRouteLoaderData } from 'react-router';
import { formatDateTime } from '~/lib/time';
import type { loader as rootLoader } from '~/root';
import * as css from './kit.css';
import { Tip } from './overlays';

export { css };
export type { Tone } from './kit.css';

type Gap = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
interface BoxProps {
  children: ReactNode;
  className?: string;
}
const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

// ----------------------------------------------------------------- layout

export function Stack({ gap, children, className }: BoxProps & { gap?: Gap }) {
  return <div className={cx(css.stack({ gap }), className)}>{children}</div>;
}

export function Cluster({
  gap,
  align,
  justify,
  children,
  className,
}: BoxProps & { gap?: Gap; align?: 'start' | 'center' | 'end'; justify?: 'start' | 'between' | 'end' }) {
  return <div className={cx(css.cluster({ gap, align, justify }), className)}>{children}</div>;
}

export function Grid({ columns, children }: BoxProps & { columns?: 2 | 3 | 'tiles' }) {
  return <div className={css.grid({ columns })}>{children}</div>;
}

/** Main content with a sidebar. Pass exactly two children. */
export function Split({ aside, children }: BoxProps & { aside?: 'narrow' | 'wide' | 'half' }) {
  return <div className={css.split({ aside })}>{children}</div>;
}

/** Narrow centred column: `form` for sign-in sized forms, `page` for editors. */
export function Measure({ size, children }: BoxProps & { size: 'form' | 'page' }) {
  return <div className={css.measure[size]}>{children}</div>;
}

// ------------------------------------------------------------- page, card

export function PageHeader({ title, meta, actions }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={css.pageHeader}>
      <div className={css.grow}>
        <h1>{title}</h1>
        {meta && <div className={css.pageMeta}>{meta}</div>}
      </div>
      {actions && <Cluster>{actions}</Cluster>}
    </header>
  );
}

/**
 * A titled surface. `flush` removes the body padding so a table or list can
 * run edge to edge; use `<CardBody>` inside a flush card for padded parts.
 */
export function Card({
  title,
  actions,
  footer,
  flush = false,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <article className={flush ? css.cardFlush : undefined}>
      {(title || actions) && (
        <header className={flush ? css.cardFlushHeader : undefined}>
          <Cluster justify="between">
            <h2 className={css.cardTitle}>{title}</h2>
            {actions}
          </Cluster>
        </header>
      )}
      {children}
      {footer && <footer className={flush ? css.cardFlushHeader : undefined}>{footer}</footer>}
    </article>
  );
}

export function CardBody({ children, divided = false }: { children: ReactNode; divided?: boolean }) {
  return <div className={divided ? css.cardSection : css.cardBody}>{children}</div>;
}

// ---------------------------------------------------------------- buttons

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'link';
interface ButtonStyle {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  block?: boolean;
}

/**
 * One primary button per view at most; everything else is `secondary`.
 * `busy` shows the spinner and blocks repeated clicks.
 */
export function Button({
  variant,
  size,
  block,
  busy,
  className,
  ...props
}: ButtonStyle & { busy?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cx(css.button({ variant, size, block }), className)}
      aria-busy={busy || undefined}
      disabled={props.disabled || busy}
    />
  );
}

/** A navigation link that looks like a button. */
export function ButtonLink({ variant = 'secondary', size, block, ...props }: ButtonStyle & ComponentProps<typeof Link>) {
  return <Link {...props} role="button" className={css.button({ variant, size, block })} />;
}

// ------------------------------------------------------------------ forms

/** Label above, control, optional hint below — the only form-row shape. */
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className={css.field}>
      <span className={css.fieldLabel}>{label}</span>
      {children}
      {hint && <small className={css.fieldHint}>{hint}</small>}
    </label>
  );
}

export function CheckField({ label, ...props }: { label: ReactNode } & ComponentProps<'input'>) {
  return (
    <label className={css.checkLabel}>
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}

/** Feedback from an action: an error, or a confirmation. */
export function Notice({ result }: { result?: { ok: boolean; error?: string; message?: string } | null }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <p role="alert" className={cx(css.notice, css.toneFill.danger)}>
        {result.error}
      </p>
    );
  }
  if (!result.message) return null;
  return (
    <p role="status" className={cx(css.notice, css.toneFill.success)}>
      {result.message}
    </p>
  );
}

/** Standing information about the page's state (not the result of an action). */
export function Callout({ tone = 'primary', children }: { tone?: css.Tone; children: ReactNode }) {
  return (
    <p role="status" className={cx(css.notice, css.toneFill[tone])}>
      {children}
    </p>
  );
}

// ------------------------------------------------------------ data display

export function Badge({ tone = 'neutral', children }: { tone?: css.Tone; children: ReactNode }) {
  return <span className={cx(css.badge, css.toneFill[tone])}>{children}</span>;
}

/** Every verdict maps to one tone, everywhere it appears. */
export function verdictTone(verdict: Verdict): css.Tone {
  if (verdict === Verdict.AC) return 'success';
  if (verdict === Verdict.WAIT || verdict === Verdict.JUDGING) return 'neutral';
  if (verdict === Verdict.CE || verdict === Verdict.JE || verdict === Verdict.SE) return 'info';
  if (verdict === Verdict.TLE || verdict === Verdict.MLE || verdict === Verdict.OLE) return 'warning';
  return 'danger';
}

export function VerdictBadge({ verdict, long = false }: { verdict: Verdict; long?: boolean }) {
  const label = <span className={cx(css.toneText[verdictTone(verdict)], css.nowrap)}>{long ? VERDICT_LABEL[verdict] : VERDICT_SHORT[verdict]}</span>;
  return long ? label : <Tip label={VERDICT_LABEL[verdict]}>{label}</Tip>;
}

export function PhaseBadge({ phase }: { phase: ContestPhase }) {
  if (phase === ContestPhase.RUNNING) return <Badge tone="success">Running</Badge>;
  if (phase === ContestPhase.PREPARING) return <Badge tone="primary">Upcoming</Badge>;
  return <Badge>Ended</Badge>;
}

/** A row of headline numbers. */
export function Stats({ items }: { items: [label: string, value: ReactNode][] }) {
  return (
    <Grid columns="tiles">
      {items.map(([label, value]) => (
        <article key={label} className={css.stat}>
          <div className={css.statLabel}>{label}</div>
          <p className={css.statValue}>{value}</p>
        </article>
      ))}
    </Grid>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className={css.empty}>{children}</p>;
}

export function Muted({ children, small = false }: { children: ReactNode; small?: boolean }) {
  return <span className={cx(css.muted, small && css.small)}>{children}</span>;
}

// ------------------------------------------------------------ app helpers

export function useRoot() {
  return useRouteLoaderData<typeof rootLoader>('root')!;
}

export function UserLink({ user }: { user: { id: number; nickname: string } }) {
  return <Link to={`/users/${user.id}`}>{user.nickname}</Link>;
}

/** Timestamp in the site timezone. */
export function Time({ value }: { value: string }) {
  const { timeZone } = useRoot();
  return (
    <time dateTime={value} className={cx(css.nowrap, css.numeric)}>
      {formatDateTime(value, timeZone)}
    </time>
  );
}
