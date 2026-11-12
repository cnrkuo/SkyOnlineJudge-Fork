import { style, styleVariants } from '@vanilla-extract/css';
import { recipe } from '@vanilla-extract/recipes';
import { media, vars } from '~/styles/theme.css';

const { color, space } = vars;

// ----------------------------------------------------------------- layout
// Four primitives cover every page; routes never write their own flex/grid.

/** Centred content column. */
export const container = style({
  width: '100%',
  maxWidth: vars.containerWidth,
  marginInline: 'auto',
  paddingInline: space.md,
});

const gaps = { xs: space.xs, sm: space.sm, md: space.md, lg: space.lg, xl: space.xl } as const;

/** Vertical rhythm: children stacked with one consistent gap. */
export const stack = recipe({
  base: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  variants: { gap: styleVariants(gaps, (gap) => ({ gap })) },
  defaultVariants: { gap: 'md' },
});

/** A row of things that wraps: buttons, filters, meta facts. */
export const cluster = recipe({
  base: { display: 'flex', flexWrap: 'wrap', minWidth: 0 },
  variants: {
    gap: styleVariants(gaps, (gap) => ({ gap })),
    align: { start: { alignItems: 'flex-start' }, center: { alignItems: 'center' }, end: { alignItems: 'flex-end' } },
    justify: { start: {}, between: { justifyContent: 'space-between' }, end: { justifyContent: 'flex-end' } },
  },
  defaultVariants: { gap: 'sm', align: 'center', justify: 'start' },
});

/** Equal columns that collapse to one on small screens. */
export const grid = recipe({
  base: { display: 'grid', gap: space.md, gridTemplateColumns: 'minmax(0, 1fr)' },
  variants: {
    columns: {
      2: { '@media': { [media.md]: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } } },
      3: { '@media': { [media.md]: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } } },
      /** As many tiles as fit. */
      tiles: { gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))' },
    },
  },
  defaultVariants: { columns: 2 },
});

/** Main column plus a narrower sidebar; stacks below the desktop breakpoint. */
export const split = recipe({
  base: { display: 'grid', gap: space.lg, alignItems: 'start', gridTemplateColumns: 'minmax(0, 1fr)' },
  variants: {
    aside: {
      narrow: { '@media': { [media.lg]: { gridTemplateColumns: 'minmax(0, 1fr) 18rem' } } },
      wide: { '@media': { [media.lg]: { gridTemplateColumns: 'minmax(0, 1fr) 22rem' } } },
      half: { '@media': { [media.lg]: { gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)' } } },
    },
  },
  defaultVariants: { aside: 'narrow' },
});

/** Narrow column for forms and focused pages. */
export const measure = styleVariants({
  form: { maxWidth: '24rem', marginInline: 'auto', width: '100%' },
  page: { maxWidth: '48rem', marginInline: 'auto', width: '100%' },
});

// ----------------------------------------------------------------- button
// The global stylesheet makes a bare <button> the primary action. These are
// the other roles a button can play.

export const button = recipe({
  variants: {
    variant: {
      primary: {},
      /** Ordinary, non-committal actions. Most buttons are this. */
      secondary: {
        backgroundColor: 'transparent',
        borderColor: color.border,
        color: color.text,
        selectors: {
          '&:hover': { backgroundColor: color.hover, borderColor: color.secondary, color: color.heading },
        },
      },
      /** Destructive actions; always paired with a confirmation. */
      danger: {
        backgroundColor: 'transparent',
        borderColor: color.dangerSolid,
        color: color.danger,
        selectors: { '&:hover': { backgroundColor: color.dangerBg, borderColor: color.danger, color: color.danger } },
      },
      /** Looks like a link, behaves like a button (inline row actions). */
      link: {
        padding: 0,
        border: 0,
        backgroundColor: 'transparent',
        color: color.primary,
        fontWeight: vars.weight.normal,
        selectors: { '&:hover': { backgroundColor: 'transparent', color: color.primaryHover, textDecoration: 'underline' } },
      },
    },
    size: {
      md: {},
      sm: { padding: `${space.xs} ${space.sm}`, fontSize: vars.fontSize.sm },
    },
    block: { true: { width: '100%' } },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

// ------------------------------------------------------------------- card

export const cardTitle = style({ fontSize: vars.fontSize.md, margin: 0 });
/** A card whose body is a table or list running edge to edge. */
export const cardFlush = style({ padding: 0, overflow: 'hidden' });
export const cardFlushHeader = style({ margin: '0 !important', borderRadius: 0 });
export const cardBody = style({ padding: space.md });
export const cardSection = style({ padding: space.md, borderTop: `${vars.borderWidth} solid ${color.borderMuted}` });

// ------------------------------------------------------------ page header

export const pageHeader = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: space.md,
  marginBottom: space.lg,
});
export const pageMeta = style({ marginTop: space.xs, color: color.muted, fontSize: vars.fontSize.sm });

// ------------------------------------------------------------------ field

export const field = style({ display: 'block' });
export const fieldLabel = style({
  display: 'block',
  marginBottom: space.xs,
  fontSize: vars.fontSize.sm,
  fontWeight: vars.weight.medium,
  color: color.heading,
});
export const fieldHint = style({ display: 'block', marginTop: space.xs });
export const checkLabel = style({ display: 'flex', alignItems: 'center', gap: space.sm });
/** Inputs that should not stretch (filters, short numbers). */
export const inputWidth = styleVariants({
  xs: { width: '6rem !important' },
  sm: { width: '10rem !important' },
  md: { width: '16rem !important' },
  auto: { width: 'auto !important' },
});
export const monoInput = style({ fontFamily: `${vars.font.mono} !important`, fontSize: `${vars.fontSize.sm} !important` });

// ----------------------------------------------------------- tones, badge

const tones = {
  neutral: { color: color.muted, backgroundColor: color.hover },
  primary: { color: color.primary, backgroundColor: color.focusRing },
  success: { color: color.success, backgroundColor: color.successBg },
  danger: { color: color.danger, backgroundColor: color.dangerBg },
  warning: { color: color.warning, backgroundColor: color.warningBg },
  info: { color: color.info, backgroundColor: color.infoBg },
} as const;
export type Tone = keyof typeof tones;

/** Coloured text only — for values inside tables. */
export const toneText = styleVariants(tones, ({ color: textColor }) => ({ color: textColor, fontWeight: vars.weight.bold }));
/** Tinted cell or block background with matching text. */
export const toneFill = styleVariants(tones, (tone) => tone);

export const badge = style({
  display: 'inline-block',
  padding: `0 ${space.sm}`,
  borderRadius: vars.radius,
  fontSize: vars.fontSize.xs,
  fontWeight: vars.weight.medium,
  lineHeight: 1.6,
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
});

export const notice = style({
  padding: `${space.sm} 0.75rem`,
  borderRadius: vars.radius,
  borderLeft: '0.25rem solid currentColor',
  fontSize: vars.fontSize.sm,
});

// ------------------------------------------------------------------- stat

export const stat = style({ padding: `0.75rem ${space.md}` });
export const statLabel = style({ color: color.muted, fontSize: vars.fontSize.xs });
export const statValue = style({ margin: 0, color: color.heading, fontSize: vars.fontSize.h3, fontWeight: vars.weight.bold });

// ------------------------------------------------------------------- misc

export const empty = style({ padding: `${space.xl} ${space.md}`, textAlign: 'center', color: color.muted });
export const muted = style({ color: color.muted });
export const small = style({ fontSize: vars.fontSize.sm });
export const nowrap = style({ whiteSpace: 'nowrap' });
export const numeric = style({ fontVariantNumeric: 'tabular-nums' });
export const truncate = style({ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
export const grow = style({ flex: '1 1 0', minWidth: 0 });
export const preWrap = style({ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
export const srOnly = style({
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
});

export const avatar = style({
  flex: 'none',
  width: '4rem',
  height: '4rem',
  borderRadius: '50%',
  objectFit: 'cover',
  backgroundColor: color.raised,
  border: `${vars.borderWidth} solid ${color.border}`,
});

/** Plain list with hairline separators (used inside flush cards). */
export const list = style({ listStyle: 'none', margin: 0, padding: 0 });
export const listItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: `${space.sm} ${space.md}`,
  borderBottom: `${vars.borderWidth} solid ${color.borderMuted}`,
  selectors: { '&:last-child': { borderBottom: 0 } },
});
