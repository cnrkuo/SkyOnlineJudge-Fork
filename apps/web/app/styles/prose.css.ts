import { globalStyle, style } from '@vanilla-extract/css';
import { code } from '~/ui/code.css';
import { vars } from './theme.css';

const { color, space } = vars;

/**
 * Server-rendered Markdown (statements, descriptions, announcements).
 * Elements already look right thanks to the global defaults; this only adds
 * reading rhythm, bordered tables and the MathML rules.
 */
export const prose = style({ lineHeight: 1.7, overflowWrap: 'break-word' });

globalStyle(`${prose} > * + *`, { marginTop: space.md });
globalStyle(`${prose} h1, ${prose} h2, ${prose} h3`, { marginTop: space.lg });
globalStyle(`${prose} > :first-child`, { marginTop: 0 });
// Statements sit inside a page that already has an <h1>; keep theirs modest.
globalStyle(`${prose} h1`, { fontSize: vars.fontSize.h3 });
globalStyle(`${prose} h2`, { fontSize: vars.fontSize.h4 });
globalStyle(`${prose} h3`, { fontSize: vars.fontSize.md });
globalStyle(`${prose} li + li`, { marginTop: space.xs });

globalStyle(`${prose} table`, { width: 'auto', fontSize: vars.fontSize.sm });
globalStyle(`${prose} th, ${prose} td, ${prose} tbody tr:last-child > *`, { border: `${vars.borderWidth} solid ${color.border}` });
globalStyle(`${prose} th`, { backgroundColor: color.raised });

// Math is MathML laid out by the browser. It needs an OpenType math font:
// Windows and macOS ship one; elsewhere the bundled fallback (fonts.css) is
// fetched — only then, and only on pages that contain math.
globalStyle(`${prose} math`, { fontFamily: vars.font.math, fontSize: '1.1em' });
globalStyle(`${prose} .math-display`, { overflowX: 'auto', overflowY: 'hidden', padding: `${space.xs} 0` });
globalStyle(`${prose} .math-display > math`, { display: 'block math' });
// Malformed TeX: Temml's message, kept on one compact line.
globalStyle(`${prose} .temml-error`, {
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  whiteSpace: 'normal !important',
});

// Fenced code blocks are highlighted by Shiki on the server.
globalStyle(`${prose} ${code}`, { marginTop: space.md });
