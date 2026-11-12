# Interface

The web interface is plain [Bootstrap 5](https://getbootstrap.com) (5.3):
its components, its spacing, its colours, in light and dark. This page
explains how Bootstrap is used here and the few rules that keep every page
looking like part of the same site. A test enforces most of them.

## How it is put together

```
apps/web/app/
├── root.tsx              loads bootstrap.min.css, then styles/app.css
├── styles/
│   ├── app.css           the only stylesheet of our own (~300 lines)
│   └── consistency.test.ts
└── ui/
    ├── classes.ts        every class name the app uses, in one place
    ├── index.tsx         layout, card, button, field, badge, stats …
    ├── data-table.tsx    the table and pager (TanStack Table)
    ├── overlays.tsx      menu, select, tooltip, dialog, tabs (Radix UI)
    └── code.tsx          code input and highlighted code
```

Three layers, each with one job:

1. **Bootstrap** decides how things look. Its stylesheet is used as shipped;
   nothing is overridden or re-themed.
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

## Colour modes

Light and dark both work and follow the operating system: a small inline
script in `root.tsx` sets `data-bs-theme` from `prefers-color-scheme` before
the first paint and updates it if the preference changes. To force one mode,
set the attribute to a fixed value there.

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
| Result of an action / standing note | `Notice`, `Callout` | `alert alert-*` |
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

| Colour | Means | Verdicts |
| --- | --- | --- |
| `success` (green) | It worked | Accepted |
| `danger` (red) | Wrong answer; destructive action | WA, PE, RE, RF |
| `warning` (yellow) | A limit was exceeded; partial credit | TLE, MLE, OLE |
| `info` (cyan) | Not the algorithm's fault | CE, JE, SE |
| `secondary` (grey) | Nothing to report yet | Waiting, Judging |
| `primary` (blue) | Links, the main action, "your row" on a scoreboard | — |

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

1. **Use Bootstrap as it is.** No overriding of Bootstrap classes; additions
   go in `app.css` under an `oj-` name and use `--bs-*` variables.
2. **Pages contain no class names and no inline styles.** Compose `ui/`
   components; if they cannot express something, extend the kit and
   `ui/classes.ts`.
3. **One primary button per view.**
4. **A colour means one thing** (table above); never decorate with a theme
   colour.
5. **Tables are `DataTable`s; overlays are the wrappers.** No raw `<table>`,
   Radix import, Bootstrap JavaScript or `window.confirm` in a page.
6. **Forms use native controls** inside `Field`; Radix is for toolbars and
   one-click actions that need JavaScript anyway.

`apps/web/app/styles/consistency.test.ts` runs with `pnpm test` and fails on
violations of rules 2 and 5, on a second stylesheet or CSS library appearing,
on Bootstrap's JavaScript being imported, and on an un-prefixed class in
`app.css`. Rules 3, 4 and 6 need a reviewer.
