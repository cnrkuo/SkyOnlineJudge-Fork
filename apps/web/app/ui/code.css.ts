import { globalStyle, style } from '@vanilla-extract/css';
import { vars } from '~/styles/theme.css';

const { color, space, syntax } = vars;

/**
 * Container for Shiki's server-rendered output. Shiki emits
 * `<pre class="shiki"><code><span class="line">…` whose colours are CSS
 * variables; they are bound to the theme's syntax tokens here, so code is
 * coloured from the same palette as the rest of the interface.
 */
export const code = style({
  vars: {
    '--shiki-foreground': syntax.foreground,
    '--shiki-background': 'transparent',
    '--shiki-token-comment': syntax.comment,
    '--shiki-token-keyword': syntax.keyword,
    '--shiki-token-string': syntax.string,
    '--shiki-token-string-expression': syntax.string,
    '--shiki-token-constant': syntax.constant,
    '--shiki-token-function': syntax.function,
    '--shiki-token-parameter': syntax.parameter,
    '--shiki-token-punctuation': syntax.punctuation,
    '--shiki-token-link': syntax.link,
  },
  borderRadius: vars.radius,
  backgroundColor: color.raised,
  border: `${vars.borderWidth} solid ${color.borderMuted}`,
  overflowX: 'auto',
});

globalStyle(`${code} pre`, {
  margin: 0,
  padding: `0.75rem 0`,
  minWidth: 'max-content',
  backgroundColor: 'transparent',
  fontSize: vars.fontSize.sm,
});
globalStyle(`${code} code`, { counterReset: 'line', display: 'block', fontSize: 'inherit' });
globalStyle(`${code} .line`, { display: 'inline-block', minWidth: '100%', paddingRight: space.md });

/** Line numbers, drawn by CSS so that copying the code never includes them. */
export const numbered = style({});
globalStyle(`${numbered} .line::before`, {
  counterIncrement: 'line',
  content: 'counter(line)',
  display: 'inline-block',
  width: '3rem',
  marginRight: space.md,
  paddingRight: space.sm,
  borderRight: `${vars.borderWidth} solid ${color.borderMuted}`,
  color: color.muted,
  textAlign: 'right',
  userSelect: 'none',
});
globalStyle(`${code}:not(${numbered}) .line`, { paddingLeft: space.md });

export const fileLink = style({
  display: 'inline-block',
  marginTop: space.xs,
  color: color.primary,
  fontSize: vars.fontSize.sm,
  cursor: 'pointer',
  selectors: { '&:hover': { color: color.primaryHover, textDecoration: 'underline' } },
});
