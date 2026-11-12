/**
 * Every class name the interface uses, in one place. Styling is Bootstrap 5;
 * the `oj-*` names are the few additions in `styles/app.css` for things
 * Bootstrap has no utility for.
 *
 * Components in `ui/` read from here, and pages only use those components,
 * so a visual decision (say, how a secondary button looks) is made once.
 */

export type Tone = 'neutral' | 'primary' | 'success' | 'danger' | 'warning' | 'info';
/** Bootstrap's name for each tone. */
const bs: Record<Tone, string> = {
  neutral: 'secondary',
  primary: 'primary',
  success: 'success',
  danger: 'danger',
  warning: 'warning',
  info: 'info',
};
const tones = Object.keys(bs) as Tone[];
const byTone = (build: (name: string, tone: Tone) => string) =>
  Object.fromEntries(tones.map((tone) => [tone, build(bs[tone], tone)])) as Record<Tone, string>;

type Gap = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
const gapClass: Record<Gap, string> = { xs: 'gap-1', sm: 'gap-2', md: 'gap-3', lg: 'gap-4', xl: 'gap-5' };

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'link';
const buttonVariant: Record<ButtonVariant, string> = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-outline-secondary',
  danger: 'btn btn-outline-danger',
  link: 'btn btn-link p-0 align-baseline',
};

export const css = {
  container: 'container-xl',

  // ---- layout
  stack: ({ gap = 'md' }: { gap?: Gap } = {}) => `d-flex flex-column oj-min0 ${gapClass[gap]}`,
  cluster: ({
    gap = 'sm',
    align = 'center',
    justify = 'start',
  }: { gap?: Gap; align?: 'start' | 'center' | 'end'; justify?: 'start' | 'between' | 'end' } = {}) =>
    `d-flex flex-wrap oj-min0 ${gapClass[gap]} align-items-${align} justify-content-${justify}`,
  grid: ({ columns = 2 }: { columns?: 2 | 3 | 'tiles' } = {}) => `oj-grid oj-grid-${columns}`,
  split: ({ aside = 'narrow' }: { aside?: 'narrow' | 'wide' | 'half' } = {}) => `oj-split oj-split-${aside}`,
  measure: { form: 'oj-measure-form', page: 'oj-measure-page' },

  // ---- buttons
  button: ({ variant = 'primary', size = 'md', block = false }: { variant?: ButtonVariant; size?: 'md' | 'sm'; block?: boolean } = {}) =>
    `${buttonVariant[variant]}${size === 'sm' && variant !== 'link' ? ' btn-sm' : ''}${block ? ' w-100' : ''}`,
  spinner: 'spinner-border spinner-border-sm',

  // ---- card
  card: 'card',
  /** Clips an edge-to-edge table to the card's rounded corners. */
  cardFlush: 'card overflow-hidden',
  cardHeader: 'card-header',
  cardTitle: 'h6 mb-0',
  cardBody: 'card-body',
  cardSection: 'card-body border-top',
  cardFooter: 'card-footer',

  // ---- page header
  pageHeader: 'd-flex flex-wrap justify-content-between align-items-end gap-3 mb-4',
  pageTitle: 'h2 mb-0',
  pageMeta: 'text-body-secondary small mt-1',

  // ---- forms
  field: 'd-block mb-0',
  fieldLabel: 'form-label',
  fieldHint: 'form-text',
  input: 'form-control',
  select: 'form-select',
  check: 'form-check mb-0',
  checkInput: 'form-check-input',
  checkLabel: 'form-check-label',
  /** Controls that should not stretch (filters, short numbers). */
  inputWidth: { xs: 'oj-w-xs', sm: 'oj-w-sm', md: 'oj-w-md', auto: 'w-auto' },
  monoInput: 'font-monospace oj-code-size',

  // ---- tones
  /** Coloured text only — for values inside tables. */
  toneText: byTone((name, tone) => (tone === 'neutral' ? 'fw-semibold text-body-secondary' : `fw-semibold text-${name}`)),
  /** Tinted block or table cell with matching text. */
  toneFill: byTone((name) => `bg-${name}-subtle text-${name}-emphasis`),
  alert: byTone((name) => `alert alert-${name} py-2 mb-0`),
  badge: byTone((name) => `badge rounded-1 fw-medium bg-${name}-subtle text-${name}-emphasis border border-${name}-subtle`),
  notice: 'rounded p-3',

  // ---- data display
  stat: 'card card-body py-2',
  statLabel: 'small text-body-secondary',
  statValue: 'fs-5 fw-semibold mb-0',
  empty: 'text-center text-body-secondary py-5 mb-0',
  list: 'list-group list-group-flush',
  listItem: 'list-group-item d-flex align-items-center gap-3',
  avatar: 'rounded-circle border oj-avatar',

  // ---- text helpers
  muted: 'text-body-secondary',
  small: 'small',
  nowrap: 'text-nowrap',
  numeric: 'oj-num',
  truncate: 'text-truncate',
  grow: 'oj-grow',
  preWrap: 'oj-pre-wrap mb-0',
  srOnly: 'visually-hidden',
};

export const table = {
  scroller: 'table-responsive',
  table: 'table table-hover table-sm align-middle mb-0 oj-table',
  headCell: 'oj-th',
  sortButton: 'oj-sort',
  sortIcon: { idle: 'opacity-25', active: 'text-primary' },
  row: '',
  /** The viewer's own row on a scoreboard. */
  rowHighlight: 'oj-row-own',
  align: { left: 'text-start', right: 'text-end oj-num', center: 'text-center' },
  /** Scoreboard cells: fixed width, two short lines. */
  scoreCell: 'oj-score-cell',
  scoreCellSub: 'oj-score-sub',
  toolbar: 'd-flex flex-wrap justify-content-between align-items-end gap-3 p-3 border-bottom',
  footer: 'd-flex flex-wrap justify-content-between align-items-center gap-3 px-3 py-2 border-top small text-body-secondary',
  /** Dims the body while newer data is on its way. */
  stale: 'opacity-50',
};

/** Radix UI primitives dressed as Bootstrap components. */
export const overlay = {
  // `position-static` keeps the menu in flow inside Radix's positioned wrapper.
  menu: 'dropdown-menu show position-static shadow oj-pop',
  menuItem: 'dropdown-item d-flex align-items-center gap-2',
  menuItemDanger: 'text-danger',
  menuIndicator: 'oj-menu-indicator',
  menuLabel: 'dropdown-header',
  selectTrigger: 'form-select w-auto text-start',
  selectSmall: 'form-select-sm',
  selectContent: 'dropdown-menu show position-static shadow oj-pop',
  tooltip: 'oj-tooltip',
  dialogOverlay: 'oj-dialog-backdrop',
  dialog: 'oj-dialog card shadow-lg',
  dialogBody: 'card-body',
  dialogTitle: 'h5',
  dialogActions: 'd-flex justify-content-end gap-2 mt-4',
  tabList: 'nav nav-tabs card-header-tabs oj-tabs',
  tabListWrap: 'card-header',
  tab: 'nav-link',
};

export const code = {
  /** Container of Shiki's output; also referenced by the Markdown pipeline. */
  code: 'oj-code',
  numbered: 'oj-code-numbered',
  fileLink: 'btn btn-link btn-sm p-0 mt-1',
};

export const shell = {
  page: 'd-flex flex-column min-vh-100',
  header: 'navbar navbar-expand bg-body-tertiary border-bottom py-1',
  nav: 'd-flex flex-wrap align-items-center column-gap-3',
  brand: 'navbar-brand fw-semibold me-2',
  brandMark: 'text-primary',
  navLinks: 'navbar-nav flex-wrap flex-grow-1',
  navLink: 'nav-link',
  navLinkActive: 'nav-link active fw-semibold',
  navEnd: 'navbar-nav flex-wrap align-items-center gap-1',
  main: 'flex-grow-1 py-4',
  footer: 'border-top py-3 text-center small text-body-secondary',
  errorPage: 'container text-center py-5 oj-measure-form',
};

export const prose = 'oj-prose';
