# Interface

The web interface is [Bootstrap 5](https://getbootstrap.com) (5.3) in its
dark colour mode, set in IBM Plex, with nearly square corners and every
colour pair checked for contrast. This page explains how it is put together
and the rules that keep every page looking like part of the same site. Tests
enforce most of them.

## How it is put together

```
apps/web/app/
├── root.tsx              loads bootstrap.min.css, then styles/app.css
├── styles/
│   ├── app.css           the only stylesheet of our own (~350 lines)
│   ├── consistency.test.ts   structure rules
│   └── contrast.test.ts      WCAG AA for every colour pair
├── ../scripts/audit-contrast.mjs  axe-core audit of the running site
└── ui/
    ├── classes.ts        every class name the app uses, in one place
    ├── index.tsx         layout, card, button, field, badge, stats …
    ├── data-table.tsx    the table and pager (TanStack Table)
    ├── overlays.tsx      menu, select, tooltip, dialog, tabs (Radix UI)
    └── code.tsx          code input and highlighted code
```

Three layers, each with one job:

1. **Bootstrap** decides how things look. Its stylesheet is used as shipped
   and themed only through its own CSS variables (font, corner radius) plus a
   handful of documented contrast fixes.
2. **`ui/classes.ts`** is the single list of Bootstrap classes in use
   (`btn btn-outline-secondary`, `card`, `form-control`, `table table-hover
   table-sm` …). Changing how, say, a secondary button looks is a one-line
   change there.
3. **`ui/` components** turn those classes into building blocks. **Pages
   only use these components** and contain no class names.

`styles/app.css` adds what Bootstrap has no class for: the page grid
helpers, the sortable table header, scoreboard cells, highlighted code,
rendered Markdown and MathML, and the positioning of dialogs and tooltips.
Its classes are prefixed `oj-`, and it is written in Bootstrap's CSS
variables (`--bs-*`), so everything follows the colour mode.

**Bootstrap's JavaScript is not loaded.** Behaviour that Bootstrap would
script — dropdowns, modals, tooltips, tabs — comes from Radix UI, which
handles focus and keyboard use and works with React. The Radix parts simply
wear Bootstrap's classes (`dropdown-menu`, `dropdown-item`, `nav nav-tabs`,
`form-select`), so they are indistinguishable from the real thing.

## Theme

### Dark mode only

`<html data-bs-theme="dark">` is fixed in `root.tsx`: every visitor gets
Bootstrap's dark palette, whatever their system prefers, and there is no
switch. Native controls and scrollbars follow (`color-scheme: dark`).

The surfaces are a dark blue-grey like GitHub's dark theme, darker than
Bootstrap's greys. They keep Bootstrap's three steps, so a card or a
hovered row still stands out from the page:

| Surface | Variable | Bootstrap dark | Here |
| --- | --- | --- | --- |
| Page | `--bs-body-bg` | `#212529` | `#0d1117` |
| Raised: card and table headers, code | `--bs-tertiary-bg` | `#2b3035` | `#161b22` |
| Hover, highlighted menu item | `--bs-secondary-bg` | `#343a40` | `#21262d` |

### Typeface

**IBM Plex Sans** for the interface and **IBM Plex Mono** for code, both
self-hosted from the `@fontsource` packages — no request leaves the site.
They are set through Bootstrap's own variables (`--bs-font-sans-serif`,
`--bs-font-monospace`), so every component picks them up. Weights loaded:
Sans 400, 500, 600, 700 and 400 italic; Mono 400, 600 and 400 italic.
Browsers download only the character ranges a page uses, and the Mono file
only on pages that show code. Chinese text falls back to the system's CJK
font (Plex has no CJK glyphs).

### Corners

Bootstrap's rounded corners (6 px on controls, 8 px on cards, up to 32 px)
are reduced to **2 px** on everything and 3 px at most, by setting its
`--bs-border-radius*` variables. Avatars are square. Nothing is pill-shaped
or circular.

### Contrast

Everything meets **WCAG 2.2 AA**: 4.5 : 1 for text, 3 : 1 for the borders
that identify a control. Bootstrap's dark mode falls short in a few places,
fixed in `app.css` (ratios measured on the page background):

| Element | Bootstrap dark | Here |
| --- | --- | --- |
| Verdict and tone text (`text-success`, `text-danger`) | 3.4 : 1 | `*-text-emphasis` shades, ≥ 7.5 : 1 |
| Secondary (outline) buttons | 2.8–3.3 : 1 | body text colour, 14.5 : 1 |
| Danger (outline) buttons | 3.4 : 1 | danger emphasis, 7.5 : 1 |
| Primary button label | 4.5 : 1 (bare minimum) | button one shade darker, 5.2 : 1 |
| Menu section headers | 3.3 : 1 | secondary text colour |
| Input and checkbox borders | 1.9 : 1 | grey-600, 4.0 : 1 |
| TeX error messages (Temml) | 2.3 : 1 | danger emphasis |
| Code comments | — | 7.5 : 1 on code blocks; every syntax colour ≥ 4.5 : 1 |

Two checks keep it that way:

- **`styles/contrast.test.ts`** (runs with `pnpm test`) reads Bootstrap's
  dark palette straight from `bootstrap.css`, applies `app.css`, and checks
  every pair the interface uses: text on each surface, every tone as text,
  badge, alert and scoreboard cell, buttons in each state, menus, control
  borders and every syntax colour. Upgrading Bootstrap re-checks all of it.
- **`pnpm --filter @skyoj/web audit:contrast`** crawls the running site with
  axe-core — as a guest, and as `AUDIT_USER` / `AUDIT_PASSWORD` if given —
  opening every tab and column menu, and fails on any violation. It catches
  what only rendering shows; it found the menu-header colour that the unit
  test had not covered.

## Building blocks

| Need | Component | Bootstrap underneath |
| --- | --- | --- |
| Page title, facts and actions | `PageHeader` | flex utilities, `h2` |
| A titled box | `Card` (`flush` for edge-to-edge tables) | `card`, `card-header`, `card-body` |
| Vertical spacing | `Stack` | `d-flex flex-column gap-*` |
| A wrapping row | `Cluster` | `d-flex flex-wrap gap-*` |
| Columns / content + sidebar | `Grid`, `Split`, `Measure` | CSS grid helpers in `app.css` |
| Buttons | `Button`, `ButtonLink` | `btn btn-primary`, `btn-outline-secondary`, `btn-outline-danger`, `btn-link` |
| A form row | `Field`, `CheckField`, `Control` | `form-label`, `form-control` / `form-select`, `form-text`, `form-check` |
| Result of an action / standing note | `Notice`, `Callout` | `alert alert-*` on an `<output>` (read out as a status); errors use `role="alert"` |
| Short state | `Badge`, `VerdictBadge`, `PhaseBadge` | `badge` with the `*-subtle` colours |
| Headline numbers | `Stats` | small `card`s |
| Any table | `DataTable`, `Pager` | `table table-hover table-sm`, `table-responsive` |
| Menu, select, tooltip, confirm, tabs | `Menu`, `SelectBox`, `Tip`, `Confirm`, `Tabs` | dropdown / form-select / nav-tabs classes on Radix |
| Source code | `CodeView`, `CodeInput` | `oj-code` (Shiki output) |

`Field` takes a native `<input>`, `<select>` or `<textarea>` and gives it
the Bootstrap control class itself, so forms stay ordinary HTML that works
without JavaScript.

### Buttons

| Variant | When |
| --- | --- |
| `primary` (solid blue) | The one thing the page is for: Submit, Save, Register. At most one per view. |
| `secondary` (outline) | Everything else. |
| `danger` (red outline) | Deletes and removals, always behind a `Confirm` dialog. |
| `link` | An action inside a line of text. |

### Colours carry meaning

Bootstrap's theme colours are used for meaning only, and each means the same
thing everywhere:

| Colour | Means |
| --- | --- |
| `success` (green) | It worked; solved on a scoreboard |
| `danger` (red) | Destructive action; failed on a scoreboard |
| `warning` (yellow) | Partial credit on a scoreboard |
| `secondary` (grey) | Nothing to report yet |
| `primary` (blue) | Links, the main action, "your row" on a scoreboard |

### Verdict colours

Verdicts have a palette of their own, one colour per kind of outcome
(`--oj-verdict-*` in `app.css`, mapped in `verdictKind()` in `ui/index.tsx`):

| Colour | Verdicts | Value |
| --- | --- | --- |
| Emerald | AC | `#31d78c` |
| Rose red | WA, PE | `#fe93a1` |
| Violet | TLE, MLE, OLE | `#c9a1ff` |
| Blue | RE | `#7cbdff` |
| Gold | CE | `#e5ae0d` |
| Pink | RF | `#ff88d6` |
| White | Waiting, Judging, JE, SE | `#b7b7b7` |

All seven have the same OKLCH lightness (0.78), so none looks brighter or
louder than another; only hue and saturation differ. That is why "white" is
a light grey: pure white would be the brightest thing in the list. To change
a colour, keep its lightness (at this lightness sRGB cannot make red or blue
very saturated, which is why rose red and blue are softer than gold; pink
leans towards magenta to stay apart from rose red) — `styles/verdict-colours.test.ts` fails if the
seven drift more than 0.01 apart, and `contrast.test.ts` checks each on every
surface (all above 7 : 1).

Tone text always uses Bootstrap's `*-text-emphasis` shade, which is the
readable one on the dark background.

Colour is never the only signal: a verdict always shows its code or name and
a scoreboard cell always shows its numbers.

### Tables

Every table is the same `DataTable` component. You describe columns; it
provides the compact hover table, small uppercase headers, right-aligned
tabular numbers, sortable columns (with `aria-sort`), an optional **Columns**
menu, horizontal scrolling inside the card, an empty state, dimmed rows
while a new page loads, and a `Pager` whose page lives in the URL.
Scoreboards are ordinary `DataTable`s whose cells take a `*-subtle` fill.

## Rules

1. **Use Bootstrap as it is.** Theme it through its `--bs-*` variables;
   additions go in `app.css` under an `oj-` name. No light mode, no colour
   switching.
2. **Every colour pair is AA.** Adding a colour means adding its pairs to
   `contrast.test.ts`.
3. **Pages contain no class names and no inline styles.** Compose `ui/`
   components; if they cannot express something, extend the kit and
   `ui/classes.ts`.
4. **One primary button per view.**
5. **A colour means one thing** (table above); never decorate with a theme
   colour.
6. **Tables are `DataTable`s; overlays are the wrappers.** No raw `<table>`,
   Radix import, Bootstrap JavaScript or `window.confirm` in a page.
7. **Forms use native controls** inside `Field`; Radix is for toolbars and
   one-click actions that need JavaScript anyway.

`pnpm test` fails on violations of rules 2, 3 and 6, and on: a light mode or
colour switching appearing, a font loaded from a CDN, a corner radius above
3 px, a second stylesheet or CSS library, Bootstrap's JavaScript being
imported, or an un-prefixed class in `app.css`. Rules 4, 5 and 7 need a
reviewer.

`pnpm lint` adds Biome's accessibility rules: labelled controls, real links
instead of `role="button"` on anchors, no autofocus, semantic elements over
ARIA roles. A page that splits into several forms (the problem editor) gives
each card its own component and its own notice.
