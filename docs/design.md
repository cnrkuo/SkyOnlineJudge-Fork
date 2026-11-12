# Design language

Sky Online Judge continues the design language of [Pico.css](https://picocss.com):
plain, calm and pragmatic. This page explains what that means here, how the
pieces fit together, and the rules that keep every page looking like part of
the same site. If you are about to add or change a page, read the
[seven rules](#the-seven-rules) first — a test enforces most of them.

The styles are written with [Vanilla Extract](https://vanilla-extract.style)
(TypeScript files that compile to static CSS at build time; nothing runs in
the browser). Pico itself is **not** a dependency: it is no longer
maintained, so its ideas and its dark palette were re-implemented on our own
tokens.

## What we kept from Pico

| Pico idea | How it shows up here |
| --- | --- |
| **Semantic HTML first.** A page of plain elements should already look finished. | `styles/global.css.ts` styles the elements themselves: a bare `<button>`, `<input>`, `<table>`, `<article>` or `<blockquote>` needs no class. Markdown statements, which are nothing but plain elements, get the site's look for free. |
| **Classes only for variants.** | A class never makes something "be" a button — the element does. Classes say *which kind*: secondary, danger, small. |
| **One accent colour.** | Azure (`primary`) marks links, focus and the single most important action on a page. Everything else is grey. |
| **Surfaces by elevation, not by borders.** | Page → card → card header are three steps of the same blue-black, plus a soft shadow. Borders are hairlines. |
| **Generous, regular spacing.** | One spacing scale built on Pico's 1 rem unit. Related things sit `sm` apart, sections `lg` apart. |
| **Native controls.** | Form fields are real `<input>`, `<select>` and `<textarea>` elements, styled but not replaced. |
| **`aria-*` as the styling hook.** | `aria-busy` shows the spinner, `aria-invalid` the error border, `aria-current="page"` the active navigation item, `aria-sort` the sorted column. Accessible state and visual state cannot drift apart. |

## Where we deliberately differ

An online judge is mostly tables, and Pico is tuned for articles.

- **Density.** Pico scales the root font up to 131% on large screens; we stop
  at 106%. Table rows use half of Pico's vertical padding. Form fields are a
  little shorter. You should see thirty submissions without scrolling.
- **Table headers** are small, uppercase and muted, so the data, not the
  header, carries the weight.
- **Tones.** Pico has a primary colour and little else. A judge needs to say
  *accepted*, *wrong*, *too slow* and *broken* at a glance, so there are four
  semantic tones (below).
- **Contrast.** Two Pico colours were adjusted to reach WCAG AA (4.5 : 1) at
  small sizes: muted text is `#8891a4` instead of `#7b8495`, and the hovered
  primary button is `#0179b8` instead of `#017fc0`.
- **Dark only.** There is one theme and no switcher. `color-scheme: dark` is
  set, so scrollbars and native controls follow.

## Tokens

All raw values live in one file, `apps/web/app/styles/theme.css.ts`. Nothing
else may contain a colour or a font name.

### Colour

| Token | Value | Used for |
| --- | --- | --- |
| `bg` | `#13171f` | The page |
| `surface` | `#181c25` | Cards, menus, dialogs |
| `raised` | `#1a1f28` | Card headers and footers, table headers, code blocks |
| `field` | `#1c212c` | Inputs, selects, textareas |
| `border` / `borderMuted` | `#2a3140` / `#202632` | Outlines of controls / hairlines between rows |
| `text` | `#c2c7d0` | Body text (10 : 1 on the page) |
| `heading` | `#f0f1f3` | Headings, strong text, values in inputs |
| `muted` | `#8891a4` | Secondary information, table headers (≥ 5 : 1) |
| `primary` | `#01aaff` | Links, focus ring, active tab |
| `primaryBg` | `#0172ad` | The primary button |

Four tones carry meaning. Each is a text colour plus a faint fill of the same
hue, and each means the same thing wherever it appears:

| Tone | Colour | Means | Verdicts |
| --- | --- | --- | --- |
| `success` | teal `#62af9a` | It worked | Accepted |
| `danger` | rose `#ce7e7b` | The answer is wrong; destructive action | WA, PE, RE, RF |
| `warning` | amber `#d7a94b` | A limit was exceeded; partial credit | TLE, MLE, OLE |
| `info` | violet `#b290d9` | Not the contestant's algorithm at fault | CE, JE, SE |
| *(neutral)* | muted grey | Nothing to report yet | Waiting, Judging |

Colour is never the only signal: a verdict always shows its code or name, and
a scoreboard cell always shows its numbers.

**Syntax highlighting uses the same palette.** Shiki runs on the server with
a theme made of CSS variables; `ui/code.css.ts` binds them to tokens —
keywords are `info` violet, strings `success` teal, numbers `warning` amber,
function names `primary` azure, comments `muted`.

### Space, shape, type

- **Spacing:** `xs` 0.25 · `sm` 0.5 · `md` 1 · `lg` 1.5 · `xl` 2 · `xxl` 3 rem.
- **Radius:** 0.25 rem on everything that has corners. No pills, no circles
  except avatars.
- **Type:** the system UI font (no web font is downloaded), with CJK
  fallbacks; a system monospace for code. Sizes: 0.75 / 0.875 / 1 rem for
  text, 1.125–2 rem for headings. Weight 600 for headings and emphasis.
- **Motion:** one 0.2 s ease for colour changes. Nothing moves.

## Building blocks

Pages are assembled from `apps/web/app/ui/`. A page file contains loaders,
queries and JSX built from these — never styles.

### Layout — four primitives

| Component | Use it for |
| --- | --- |
| `Stack` | Things on top of each other with one consistent gap. The default way to space anything vertically. |
| `Cluster` | Things in a row that may wrap: buttons, filters, facts under a title. |
| `Grid` | Equal columns that collapse to one on phones (`2`, `3`, or `tiles`). |
| `Split` | Content plus a sidebar; the sidebar moves below on small screens. |

`Measure` narrows a page to form width (`form`) or reading width (`page`).
There are no margin utilities: spacing comes from the parent's gap, so two
pages cannot space the same things differently.

### Surfaces and text

- **`PageHeader`** — every page starts with one: `<h1>`, an optional line of
  facts, and the page's actions on the right.
- **`Card`** — a titled surface (`<article>`). `flush` removes the padding
  so a table or list can run edge to edge.
- **`Stats`** — a row of headline numbers.
- **`Notice`** — the result of something the user just did (saved / failed).
  **`Callout`** — a standing fact about the page (frozen scoreboard,
  registration pending). **`Empty`** — what a list says when it has nothing.
- **`Badge`**, **`VerdictBadge`**, **`PhaseBadge`** — short states, coloured
  by tone.

### Actions

| Variant | When |
| --- | --- |
| `primary` (filled azure) | The one thing this page is for: Submit, Save, Register. **At most one per view.** |
| `secondary` (outlined) | Everything else. The default for links that look like buttons. |
| `danger` (rose outline) | Deletes and removals — always behind a `Confirm` dialog. |
| `link` | An action inside a row of text. |

`busy` shows Pico's spinner and blocks double submission.

### Forms

One shape only: **`Field`** — label above, control, optional hint below.
Controls are native elements. Related short fields go side by side in a
`Grid`; the submit button sits at the bottom left.

### Tables — `DataTable`

Every table in the application is the same component
(`ui/data-table.tsx`), built on TanStack Table. You describe columns; it
guarantees:

- muted uppercase headers on the `raised` band, hairline rows, hover tint;
- numbers right-aligned in tabular figures (`align: 'right'`);
- sortable columns show ↕ and expose `aria-sort`; counts and scores sort
  descending first;
- an optional **Columns** menu to show or hide secondary columns;
- horizontal scrolling inside the card, never of the page;
- an `Empty` state, and dimmed rows while a newer page is loading;
- `Pager` in the footer for server-paged lists — the page lives in the URL.

Scoreboards are ordinary `DataTable`s whose cells take a tone fill.

### Overlays — Radix UI

Menus, selects, tooltips, confirmation dialogs and tabs come from Radix UI
(for keyboard and screen-reader behaviour) through the wrappers in
`ui/overlays.tsx`, which give them the card look. A dropdown is visibly a
small card; its items look like table rows.

**Native or Radix?** If the control is inside a `<form>` that is submitted to
the server, it is native — the form then works before JavaScript loads and
without it. Radix is for things that only make sense with JavaScript: a
table's column menu, an instant change in an admin table, a tooltip.

## The seven rules

1. **Values come from tokens.** No colour or font outside `theme.css.ts`.
2. **Elements first.** Reach for the right HTML element before a component,
   and for a component before a class.
3. **Pages contain no styles.** No `style=`, no hand-written class names, no
   stylesheet next to a route. If the kit cannot express something, extend
   the kit.
4. **Space with layout primitives**, not margins.
5. **One primary action per view.**
6. **A tone means one thing.** Teal is success everywhere; never decorate
   with a tone.
7. **Tables are `DataTable`s; overlays are the wrappers.** Never a raw
   `<table>`, a raw Radix import or `window.confirm` in a page.

`apps/web/app/styles/consistency.test.ts` runs with `pnpm test` and fails on
violations of rules 1, 3 and 7 (and on a CSS framework sneaking into
`package.json`). Rules 2, 4, 5 and 6 need a reviewer's eye.

## Adding to the system

- **A new page:** `PageHeader`, then a `Stack` of `Card`s. Lists are
  `DataTable`s. You should not need to open a `.css.ts` file.
- **A new variant** (say, a `warning` button): add it to the recipe in
  `ui/kit.css.ts`, document when to use it in the table above.
- **A new colour:** almost certainly no. If a new *meaning* appears, add a
  tone — text colour and fill together — to the theme and to the tone table.
- **A new component:** put it in `ui/`, style it from tokens, and keep its
  API small enough that it can only be used one way.

## File map

```
apps/web/app/
├── styles/
│   ├── theme.css.ts          tokens (the only raw values)
│   ├── global.css.ts         element defaults — the Pico layer
│   ├── prose.css.ts          rendered Markdown and MathML
│   ├── shell.css.ts          navigation bar, page frame
│   ├── fonts.css             the fallback math font face
│   └── consistency.test.ts   the rules, enforced
└── ui/
    ├── index.tsx + kit.css.ts        layout, card, button, field, badge …
    ├── data-table.tsx + table.css.ts the table and pager
    ├── overlays.tsx + overlay.css.ts Radix wrappers
    └── code.tsx + code.css.ts        code input and highlighted code
```
