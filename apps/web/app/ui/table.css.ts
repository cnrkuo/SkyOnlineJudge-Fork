import { style, styleVariants } from '@vanilla-extract/css';
import { vars } from '~/styles/theme.css';

const { color, space } = vars;

/** Wide tables scroll inside their card; the page never scrolls sideways. */
export const scroller = style({ overflowX: 'auto' });

export const table = style({ fontSize: vars.fontSize.sm });

export const headCell = style({
  backgroundColor: color.raised,
  color: color.muted,
  fontSize: vars.fontSize.xs,
  fontWeight: vars.weight.bold,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
});

/** Header that sorts: the whole label is the button. */
export const sortButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: space.xs,
  padding: 0,
  border: 0,
  backgroundColor: 'transparent',
  color: 'inherit',
  font: 'inherit',
  letterSpacing: 'inherit',
  textTransform: 'inherit',
  selectors: { '&:hover': { backgroundColor: 'transparent', color: color.heading } },
});
export const sortIcon = styleVariants({
  idle: { opacity: 0.35 },
  active: { color: color.primary },
});

export const row = style({
  transition: `background-color ${vars.transition}`,
  selectors: { 'tbody &:hover': { backgroundColor: color.hover } },
});
/** The viewer's own row on a scoreboard. */
export const rowHighlight = style({ boxShadow: `inset 0.1875rem 0 0 ${color.primary}` });

export const align = styleVariants({
  left: { textAlign: 'left' },
  right: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  center: { textAlign: 'center' },
});

/** Scoreboard cells: fixed width, two short lines. */
export const scoreCell = style({ minWidth: '3.5rem', textAlign: 'center', lineHeight: 1.25 });
export const scoreCellSub = style({ display: 'block', fontSize: vars.fontSize.xs, fontWeight: vars.weight.normal, opacity: 0.85 });

export const toolbar = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: '0.75rem',
  padding: `0.75rem ${space.md}`,
  borderBottom: `${vars.borderWidth} solid ${color.border}`,
});

export const footer = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.75rem',
  padding: `${space.sm} ${space.md}`,
  borderTop: `${vars.borderWidth} solid ${color.border}`,
  color: color.muted,
  fontSize: vars.fontSize.sm,
});

/** Dims the body while newer data is on its way (previous page stays visible). */
export const stale = style({ opacity: 0.55, transition: `opacity ${vars.transition}` });
