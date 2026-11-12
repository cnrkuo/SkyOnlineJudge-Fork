import { createGlobalTheme } from '@vanilla-extract/css';

/**
 * Design tokens — the only place where raw colours, sizes and fonts are
 * written down. Every other stylesheet refers to `vars`; a test
 * (`styles/consistency.test.ts`) fails the build if one does not.
 *
 * The palette is Pico.css's dark "azure" theme: a blue-black page, slightly
 * lighter surfaces, soft grey text and one saturated accent. The site is
 * dark-only, so there is a single theme and no switching logic.
 */
export const vars = createGlobalTheme(':root', {
  color: {
    /** Page background. */
    bg: '#13171f',
    /** Cards, menus, dialogs. */
    surface: '#181c25',
    /** Card headers/footers, table headers, code blocks: one step up. */
    raised: '#1a1f28',
    /** Inputs, selects, textareas. */
    field: '#1c212c',
    border: '#2a3140',
    /** Hairlines inside a surface (table rows, separators). */
    borderMuted: '#202632',
    /** Hovered rows and menu items. */
    hover: 'rgba(111, 120, 135, 0.1)',

    text: '#c2c7d0',
    heading: '#f0f1f3',
    muted: '#7b8495',

    /** Links, focus, the one call to action on a page. */
    primary: '#01aaff',
    primaryHover: '#79c0ff',
    primaryBg: '#0172ad',
    primaryBgHover: '#017fc0',
    onPrimary: '#ffffff',
    focusRing: 'rgba(1, 170, 255, 0.375)',

    /** Ordinary actions. */
    secondary: '#969eaf',
    secondaryBg: '#525f7a',
    secondaryBgHover: '#5d6b89',

    /* Semantic tones. Each has a text colour and a faint background. */
    success: '#62af9a',
    successBg: 'rgba(42, 123, 111, 0.22)',
    danger: '#ce7e7b',
    dangerBg: 'rgba(150, 74, 80, 0.25)',
    dangerSolid: '#964a50',
    warning: '#d7a94b',
    warningBg: 'rgba(170, 125, 30, 0.2)',
    info: '#b290d9',
    infoBg: 'rgba(120, 86, 170, 0.2)',

    overlay: 'rgba(8, 9, 10, 0.75)',
  },
  space: {
    /** Pico's `--pico-spacing` is `md`; the rest are halves and multiples. */
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    xxl: '3rem',
  },
  radius: '0.25rem',
  borderWidth: '0.0625rem',
  font: {
    sans: 'system-ui, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, Helvetica, Arial, "Helvetica Neue", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    math: '"Cambria Math", "STIX Two Math", "Latin Modern Math", "SkyOJ Math", math',
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    md: '1rem',
    h1: '2rem',
    h2: '1.5rem',
    h3: '1.25rem',
    h4: '1.125rem',
  },
  lineHeight: '1.5',
  weight: { normal: '400', medium: '500', bold: '600' },
  shadow: {
    card: '0.0145rem 0.029rem 0.174rem rgba(7, 9, 12, 0.017), 0.0335rem 0.067rem 0.402rem rgba(7, 9, 12, 0.024), 0.0625rem 0.125rem 0.75rem rgba(7, 9, 12, 0.03), 0.1125rem 0.225rem 1.35rem rgba(7, 9, 12, 0.036), 0.2085rem 0.417rem 2.502rem rgba(7, 9, 12, 0.043), 0.5rem 1rem 6rem rgba(7, 9, 12, 0.06), 0 0 0 0.0625rem rgba(7, 9, 12, 0.015)',
    popover: '0 0.5rem 1.5rem rgba(0, 0, 0, 0.45)',
  },
  transition: '0.2s ease-in-out',
  /** Widest the content column gets. */
  containerWidth: '75rem',
  /** Syntax highlighting; Shiki's output references these (see highlight.server.ts). */
  syntax: {
    foreground: '#c2c7d0',
    comment: '#7b8495',
    keyword: '#b290d9',
    string: '#62af9a',
    constant: '#d7a94b',
    function: '#01aaff',
    parameter: '#dfe3eb',
    punctuation: '#969eaf',
    link: '#79c0ff',
  },
});

/** Breakpoints, as media-query conditions. */
export const media = {
  /** Tablets and up. */
  md: 'screen and (min-width: 48rem)',
  /** Desktops. */
  lg: 'screen and (min-width: 64rem)',
};
