import { style } from '@vanilla-extract/css';
import { vars } from './theme.css';

const { color, space } = vars;

/** Application frame: top navigation, content column, footer. */

export const page = style({ display: 'flex', flexDirection: 'column', minHeight: '100dvh' });

export const header = style({
  borderBottom: `${vars.borderWidth} solid ${color.border}`,
  backgroundColor: color.surface,
});
export const nav = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  columnGap: space.lg,
  rowGap: space.xs,
  paddingBlock: space.sm,
});
export const brand = style({
  color: color.heading,
  fontWeight: vars.weight.bold,
  textDecoration: 'none',
  selectors: { '&:hover': { color: color.heading, textDecoration: 'none' } },
});
export const brandMark = style({ color: color.primary });
export const navLinks = style({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.md, flex: '1 1 auto' });
export const navLink = style({
  paddingBlock: space.xs,
  borderBottom: '0.125rem solid transparent',
  color: color.muted,
  fontSize: vars.fontSize.sm,
  fontWeight: vars.weight.medium,
  textDecoration: 'none',
  selectors: {
    '&:hover': { color: color.heading, textDecoration: 'none' },
    '&[aria-current="page"]': { color: color.heading, borderBottomColor: color.primary },
  },
});
export const navEnd = style({ display: 'flex', alignItems: 'center', gap: space.sm });

export const main = style({ flex: '1 1 auto', paddingBlock: space.lg });

export const footer = style({
  paddingBlock: space.md,
  borderTop: `${vars.borderWidth} solid ${color.border}`,
  color: color.muted,
  fontSize: vars.fontSize.xs,
  textAlign: 'center',
});

export const errorPage = style({ maxWidth: '32rem', margin: '0 auto', padding: `${space.xxl} ${space.md}`, textAlign: 'center' });
