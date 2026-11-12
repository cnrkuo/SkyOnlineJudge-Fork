import { globalKeyframes, globalStyle } from '@vanilla-extract/css';
import { media, vars } from './theme.css';

/**
 * Element defaults, in the spirit of Pico.css: semantic HTML looks right
 * without a single class. A bare `<button>`, `<input>`, `<table>` or
 * `<article>` is already the finished component; classes (from the UI kit)
 * only express variants.
 *
 * Because Markdown renders to plain elements, statements automatically share
 * the look of the rest of the site.
 */

const { color, space, font, fontSize } = vars;
const border = `${vars.borderWidth} solid ${color.border}`;
const focusRing = `0 0 0 0.1875rem ${color.focusRing}`;

// --------------------------------------------------------------- document

globalStyle('*, *::before, *::after', { boxSizing: 'border-box' });

globalStyle(':root', {
  colorScheme: 'dark',
  // Pico scales the root font with the viewport. One step is kept: tables
  // are the heart of an online judge and need the density on large screens.
  fontSize: '100%',
  '@media': { [media.md]: { fontSize: '106.25%' } },
  textRendering: 'optimizeLegibility',
  WebkitTextSizeAdjust: '100%',
  tabSize: 4,
});

globalStyle('body', {
  margin: 0,
  backgroundColor: color.bg,
  color: color.text,
  fontFamily: font.sans,
  fontSize: fontSize.md,
  fontWeight: vars.weight.normal,
  lineHeight: vars.lineHeight,
  WebkitFontSmoothing: 'antialiased',
});

globalStyle('::selection', { backgroundColor: color.focusRing });

// ------------------------------------------------------------- typography

globalStyle('h1, h2, h3, h4, h5, h6', {
  margin: 0,
  color: color.heading,
  fontWeight: vars.weight.bold,
  lineHeight: 1.25,
  textWrap: 'balance',
});
globalStyle('h1', { fontSize: fontSize.h1 });
globalStyle('h2', { fontSize: fontSize.h2 });
globalStyle('h3', { fontSize: fontSize.h3 });
globalStyle('h4, h5, h6', { fontSize: fontSize.h4 });

globalStyle('p, ul, ol, dl, blockquote, pre, table, figure', { margin: 0 });
globalStyle('ul, ol', { paddingLeft: space.lg });

globalStyle('a', {
  color: color.primary,
  textDecoration: 'underline',
  textDecorationColor: 'transparent',
  textUnderlineOffset: '0.2em',
  transition: `color ${vars.transition}, text-decoration-color ${vars.transition}`,
});
globalStyle('a:hover', { color: color.primaryHover, textDecorationColor: 'currentColor' });

globalStyle('small', { fontSize: fontSize.sm, color: color.muted });
globalStyle('strong, b', { fontWeight: vars.weight.bold, color: color.heading });
globalStyle('hr', { border: 0, borderTop: border, margin: `${space.lg} 0` });

globalStyle('blockquote', {
  paddingLeft: space.md,
  borderLeft: `0.25rem solid ${color.border}`,
  color: color.muted,
});

globalStyle('code, kbd, samp, pre', { fontFamily: font.mono, fontSize: '0.875em' });
globalStyle(':not(pre) > code, kbd', {
  padding: '0.15em 0.4em',
  borderRadius: vars.radius,
  backgroundColor: color.raised,
  color: color.text,
});
globalStyle('pre', {
  padding: space.md,
  overflowX: 'auto',
  borderRadius: vars.radius,
  backgroundColor: color.raised,
  lineHeight: 1.45,
});

globalStyle(':focus-visible', { outline: 'none', boxShadow: focusRing, borderRadius: vars.radius });

// ---------------------------------------------------------------- buttons
// A bare button is the primary action. Variants live in ui/button.css.ts.

globalStyle('button, [role="button"], input[type="submit"]', {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: space.sm,
  margin: 0,
  padding: `${space.sm} ${space.md}`,
  border: `${vars.borderWidth} solid ${color.primaryBg}`,
  borderRadius: vars.radius,
  backgroundColor: color.primaryBg,
  color: color.onPrimary,
  font: 'inherit',
  fontWeight: vars.weight.medium,
  lineHeight: vars.lineHeight,
  textAlign: 'center',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  userSelect: 'none',
  transition: `background-color ${vars.transition}, border-color ${vars.transition}, color ${vars.transition}, box-shadow ${vars.transition}`,
});
globalStyle('button:hover, [role="button"]:hover, input[type="submit"]:hover', {
  backgroundColor: color.primaryBgHover,
  borderColor: color.primaryBgHover,
  color: color.onPrimary,
  textDecoration: 'none',
});
globalStyle('button:disabled, [role="button"][aria-disabled="true"]', { opacity: 0.5, cursor: 'not-allowed' });

// Pico's loading indicator: any element with aria-busy shows a spinner.
globalKeyframes('spin', { to: { transform: 'rotate(360deg)' } });
globalStyle('[aria-busy="true"]::before', {
  content: '""',
  display: 'inline-block',
  width: '1em',
  height: '1em',
  border: '0.15em solid currentColor',
  borderRightColor: 'transparent',
  borderRadius: '50%',
  animation: 'spin 0.75s linear infinite',
  verticalAlign: '-0.125em',
});

// ------------------------------------------------------------------ forms

globalStyle('label', { display: 'block', color: color.text });
globalStyle('fieldset', { margin: 0, padding: 0, border: 0 });

globalStyle('input:not([type="checkbox"], [type="radio"], [type="submit"], [type="file"]), select, textarea', {
  display: 'block',
  width: '100%',
  margin: 0,
  padding: `${space.sm} 0.75rem`,
  border,
  borderRadius: vars.radius,
  backgroundColor: color.field,
  color: color.heading,
  font: 'inherit',
  lineHeight: vars.lineHeight,
  transition: `border-color ${vars.transition}, box-shadow ${vars.transition}`,
});
globalStyle('textarea', { resize: 'vertical' });
globalStyle('input::placeholder, textarea::placeholder', { color: color.muted, opacity: 1 });
globalStyle('input:focus-visible, select:focus-visible, textarea:focus-visible', {
  borderColor: color.primary,
  boxShadow: focusRing,
});
globalStyle('input:disabled, select:disabled, textarea:disabled', { opacity: 0.6, cursor: 'not-allowed' });
globalStyle('input[aria-invalid="true"], textarea[aria-invalid="true"]', { borderColor: color.dangerSolid });

globalStyle('input[type="file"]', {
  display: 'block',
  width: '100%',
  padding: space.xs,
  border,
  borderRadius: vars.radius,
  backgroundColor: color.field,
  color: color.muted,
  font: 'inherit',
  fontSize: fontSize.sm,
});
globalStyle('input[type="file"]::file-selector-button', {
  marginRight: space.sm,
  padding: `${space.xs} 0.75rem`,
  border: 0,
  borderRadius: vars.radius,
  backgroundColor: color.secondaryBg,
  color: color.onPrimary,
  font: 'inherit',
  cursor: 'pointer',
});
globalStyle('input[type="checkbox"], input[type="radio"]', {
  width: '1.125em',
  height: '1.125em',
  margin: 0,
  accentColor: color.primary,
  verticalAlign: '-0.15em',
});

// ----------------------------------------------------------------- tables

globalStyle('table', { width: '100%', borderCollapse: 'collapse', borderSpacing: 0 });
globalStyle('th, td', {
  padding: `${space.sm} 0.75rem`,
  borderBottom: `${vars.borderWidth} solid ${color.borderMuted}`,
  textAlign: 'left',
  verticalAlign: 'middle',
});
globalStyle('th', { color: color.heading, fontWeight: vars.weight.bold, whiteSpace: 'nowrap' });
globalStyle('thead th', { borderBottomColor: color.border });
globalStyle('tbody tr:last-child > *', { borderBottom: 0 });

// ------------------------------------------------------------------ cards
// <article> is the card. Its <header> and <footer> are tinted bands.

globalStyle('article', {
  margin: 0,
  padding: space.md,
  borderRadius: vars.radius,
  backgroundColor: color.surface,
  boxShadow: vars.shadow.card,
});
globalStyle('article > header, article > footer', {
  margin: `0 calc(${space.md} * -1)`,
  padding: `0.75rem ${space.md}`,
  backgroundColor: color.raised,
});
globalStyle('article > header', {
  marginTop: `calc(${space.md} * -1)`,
  marginBottom: space.md,
  borderBottom: border,
  borderRadius: `${vars.radius} ${vars.radius} 0 0`,
});
globalStyle('article > footer', {
  marginTop: space.md,
  marginBottom: `calc(${space.md} * -1)`,
  borderTop: border,
  borderRadius: `0 0 ${vars.radius} ${vars.radius}`,
});

// ------------------------------------------------------------------- misc

globalStyle('img, svg, video', { maxWidth: '100%', height: 'auto' });
globalStyle('[hidden]', { display: 'none !important' });
