import { keyframes, style } from '@vanilla-extract/css';
import { vars } from '~/styles/theme.css';

const { color, space } = vars;

/**
 * Styles for the Radix UI primitives (menus, selects, tooltips, dialogs,
 * tabs). Radix supplies behaviour and accessibility; the look comes from the
 * same tokens as everything else, so a menu is visibly a card and a menu
 * item is visibly a table row.
 */

const pop = keyframes({ from: { opacity: 0, transform: 'translateY(-0.25rem)' }, to: { opacity: 1, transform: 'none' } });

const floating = {
  zIndex: 50,
  border: `${vars.borderWidth} solid ${color.border}`,
  borderRadius: vars.radius,
  backgroundColor: color.surface,
  boxShadow: vars.shadow.popover,
  animation: `${pop} 0.12s ease-out`,
} as const;

export const menu = style({ ...floating, minWidth: '11rem', padding: space.xs });

export const menuItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: space.sm,
  padding: `${space.xs} ${space.sm}`,
  borderRadius: vars.radius,
  color: color.text,
  fontSize: vars.fontSize.sm,
  textDecoration: 'none',
  cursor: 'pointer',
  userSelect: 'none',
  outline: 'none',
  selectors: {
    '&[data-highlighted]': { backgroundColor: color.hover, color: color.heading },
    '&[data-disabled]': { opacity: 0.5, cursor: 'not-allowed' },
  },
});
export const menuItemDanger = style({ color: color.danger });
export const menuIndicator = style({ display: 'inline-flex', width: '1rem', justifyContent: 'center', color: color.primary });
export const menuLabel = style({
  padding: `${space.xs} ${space.sm}`,
  color: color.muted,
  fontSize: vars.fontSize.xs,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
});
export const menuSeparator = style({ height: vars.borderWidth, margin: `${space.xs} 0`, backgroundColor: color.border });

/** Select trigger: looks exactly like a native <select>. */
export const selectTrigger = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space.sm,
  padding: `${space.sm} 0.75rem`,
  border: `${vars.borderWidth} solid ${color.border}`,
  borderRadius: vars.radius,
  backgroundColor: color.field,
  color: color.heading,
  fontWeight: vars.weight.normal,
  selectors: {
    '&:hover': { backgroundColor: color.field, borderColor: color.secondary, color: color.heading },
    '&[data-placeholder]': { color: color.muted },
  },
});
export const selectSmall = style({ padding: `${space.xs} ${space.sm}`, fontSize: vars.fontSize.sm });
export const selectContent = style({ ...floating, padding: space.xs, maxHeight: '20rem' });

export const tooltip = style({
  ...floating,
  maxWidth: '18rem',
  padding: `${space.xs} ${space.sm}`,
  backgroundColor: color.raised,
  color: color.heading,
  fontSize: vars.fontSize.xs,
});

export const dialogOverlay = style({ position: 'fixed', inset: 0, zIndex: 40, backgroundColor: color.overlay });
export const dialog = style({
  ...floating,
  position: 'fixed',
  top: '50%',
  left: '50%',
  width: `min(28rem, calc(100vw - ${space.xl}))`,
  padding: space.lg,
  transform: 'translate(-50%, -50%)',
  animation: 'none',
});
export const dialogTitle = style({ fontSize: vars.fontSize.h3, marginBottom: space.sm });
export const dialogActions = style({ display: 'flex', justifyContent: 'flex-end', gap: space.sm, marginTop: space.lg });

export const tabList = style({
  display: 'flex',
  gap: space.md,
  paddingInline: space.md,
  borderBottom: `${vars.borderWidth} solid ${color.border}`,
  backgroundColor: color.raised,
});
export const tab = style({
  padding: `0.75rem 0`,
  border: 0,
  borderBottom: '0.125rem solid transparent',
  borderRadius: 0,
  backgroundColor: 'transparent',
  color: color.muted,
  fontSize: vars.fontSize.sm,
  selectors: {
    '&:hover': { backgroundColor: 'transparent', color: color.heading },
    '&[data-state="active"]': { color: color.heading, borderBottomColor: color.primary },
  },
});
