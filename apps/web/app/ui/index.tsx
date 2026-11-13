/**
 * The UI kit. Pages are composed from these components and write no class
 * names of their own; the Bootstrap classes behind them live in classes.ts.
 * See docs/design.md.
 */
import { ContestPhase, VERDICT_LABEL, VERDICT_SHORT, Verdict } from '@skyoj/contract';
import {
  type ButtonHTMLAttributes,
  type ComponentProps,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link, useRouteLoaderData } from 'react-router';
import { formatDateTime } from '~/lib/time';
import type { loader as rootLoader } from '~/root';
import { type ButtonVariant, css, type Tone } from './classes';
import { Tip } from './overlays';

export { css };
export type { Tone };

type Gap = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
interface BoxProps {
  children: ReactNode;
  className?: string;
}
const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

// ----------------------------------------------------------------- layout

/** Children stacked vertically with one consistent gap. */
export function Stack({ gap, children, className }: BoxProps & { gap?: Gap }) {
  return <div className={cx(css.stack({ gap }), className)}>{children}</div>;
}

/** A row of things that wraps: buttons, filters, facts. */
export function Cluster({
  gap,
  align,
  justify,
  children,
  className,
}: BoxProps & { gap?: Gap; align?: 'start' | 'center' | 'end'; justify?: 'start' | 'between' | 'end' }) {
  return <div className={cx(css.cluster({ gap, align, justify }), className)}>{children}</div>;
}

/** Equal columns that collapse to one on small screens. */
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
        <h1 className={css.pageTitle}>{title}</h1>
        {meta && <div className={css.pageMeta}>{meta}</div>}
      </div>
      {actions && <Cluster>{actions}</Cluster>}
    </header>
  );
}

/**
 * A Bootstrap card. `flush` drops the body padding so a table or list can
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
    <section className={flush ? css.cardFlush : css.card}>
      {(title || actions) && (
        <div className={css.cardHeader}>
          <Cluster justify="between">
            <h2 className={css.cardTitle}>{title}</h2>
            {actions}
          </Cluster>
        </div>
      )}
      {flush ? children : <div className={css.cardBody}>{children}</div>}
      {footer && <div className={css.cardFooter}>{footer}</div>}
    </section>
  );
}

export function CardBody({ children, divided = false }: { children: ReactNode; divided?: boolean }) {
  return <div className={divided ? css.cardSection : css.cardBody}>{children}</div>;
}

// ---------------------------------------------------------------- buttons

interface ButtonStyle {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  block?: boolean;
}

/**
 * One primary button per view at most; everything else is `secondary`.
 * `busy` shows a spinner and blocks repeated clicks.
 */
export function Button({
  variant,
  size,
  block,
  busy,
  className,
  children,
  ...props
}: ButtonStyle & { busy?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cx(css.button({ variant, size, block }), className)}
      aria-busy={busy || undefined}
      disabled={props.disabled || busy}>
      {busy && <span className={css.spinner} aria-hidden />} {children}
    </button>
  );
}

/** A navigation link that looks like a button. */
export function ButtonLink({
  variant = 'secondary',
  size,
  block,
  ...props
}: ButtonStyle & ComponentProps<typeof Link>) {
  return <Link {...props} role="button" className={css.button({ variant, size, block })} />;
}

// ------------------------------------------------------------------ forms

/** Adds Bootstrap's control class to a native form element. */
function control(element: ReactNode): ReactNode {
  if (!isValidElement(element) || typeof element.type !== 'string') return element;
  const { type, props } = element as ReactElement<{ className?: string; type?: string }>;
  if (type !== 'input' && type !== 'select' && type !== 'textarea') return element;
  if (props.type === 'checkbox' || props.type === 'radio' || props.type === 'hidden') return element;
  const base = type === 'select' ? css.select : css.input;
  return cloneElement(element as ReactElement<{ className?: string }>, { className: cx(base, props.className) });
}

/**
 * Label above, control, optional hint below — the only form-row shape.
 * Put a native `<input>`, `<select>` or `<textarea>` inside; it is styled
 * as a Bootstrap form control automatically.
 */
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is `children`, wrapped by control().
    <label className={css.field}>
      <span className={css.fieldLabel}>{label}</span>
      {control(children)}
      {hint && <span className={`d-block ${css.fieldHint}`}>{hint}</span>}
    </label>
  );
}

/** A native form control outside a `<Field>` (search boxes, inline selects). */
export function Control({ children }: { children: ReactElement }) {
  return <>{control(children)}</>;
}

export function CheckField({ label, ...props }: { label: ReactNode } & ComponentProps<'input'>) {
  return (
    <label className={css.check}>
      <input type="checkbox" className={css.checkInput} {...props} />
      <span className={css.checkLabel}>{label}</span>
    </label>
  );
}

/** Feedback from an action: an error, or a confirmation. */
export function Notice({ result }: { result?: { ok: boolean; error?: string; message?: string } | null }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <div role="alert" className={css.alert.danger}>
        {result.error}
      </div>
    );
  }
  if (!result.message) return null;
  return <output className={`d-block ${css.alert.success}`}>{result.message}</output>;
}

/** Standing information about the page's state (not the result of an action). */
export function Callout({ tone = 'primary', children }: { tone?: Tone; children: ReactNode }) {
  return <output className={`d-block ${css.alert[tone]}`}>{children}</output>;
}

// ------------------------------------------------------------ data display

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={css.badge[tone]}>{children}</span>;
}

/** Every verdict maps to one tone, everywhere it appears. */
export function verdictTone(verdict: Verdict): Tone {
  if (verdict === Verdict.AC) return 'success';
  if (verdict === Verdict.WAIT || verdict === Verdict.JUDGING) return 'neutral';
  if (verdict === Verdict.CE || verdict === Verdict.JE || verdict === Verdict.SE) return 'info';
  if (verdict === Verdict.TLE || verdict === Verdict.MLE || verdict === Verdict.OLE) return 'warning';
  return 'danger';
}

export function VerdictBadge({ verdict, long = false }: { verdict: Verdict; long?: boolean }) {
  const label = (
    <span className={cx(css.toneText[verdictTone(verdict)], css.nowrap)}>
      {long ? VERDICT_LABEL[verdict] : VERDICT_SHORT[verdict]}
    </span>
  );
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
        <div key={label} className={css.stat}>
          <div className={css.statLabel}>{label}</div>
          <p className={css.statValue}>{value}</p>
        </div>
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
  const data = useRouteLoaderData<typeof rootLoader>('root');
  if (!data) throw new Error('useRoot() is only available below the root route');
  return data;
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
