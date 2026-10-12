# Layouts — what `deck.json` can contain

Read this once before writing the storyline. `example/deck.json` uses every layout; render it
to see them (`bash scripts/qa.sh example/deck.json /tmp/example.pptx`).

Contents: the deck file · content shape → layout · the 21 layouts · lint messages · adding a layout

## The deck file

```json
{
  "meta":  { "title": "…", "author": "…", "lang": "id-ID" },
  "brand": {
    "name": "Example Co",
    "colors": { "primary": "0E2A3B", "accent": "157A57", "warn": "E8A33C" },
    "logos": { "main": "assets/logo.png", "partner": "assets/partner.png" },
    "header": "main",
    "footer": "Deck title · Draft"
  },
  "slides": [ { "id": "cover", "layout": "cover", "title": "…", "notes": "…" } ]
}
```

- `brand.colors`: `primary` is the dark tone (dark slides, headers), `accent` marks the thing
  the slide is about, `warn` marks risk and attention. All optional. Hex without `#`.
- `brand.logos`: PNG or JPG files, paths relative to `deck.json`. `brand.header` names the logo
  shown at the top right of every slide; on dark slides it gets a white plate automatically.
  Without `header`, `brand.name` is printed there as text.
- `brand.footer`: one line at the bottom left of every slide.
- `meta.lang` is the deck's language (`id-ID`, `en-US`, …). The few words the renderer supplies
  itself — the "illustration" tag, the default takeaway heading, "Result:" — follow it for
  English and Indonesian; for any other language set them in
  `meta.labels: { "illustration", "takeaway", "result", "image" }`.
- Fonts default to Arial (Liberation Sans on Linux has the same widths). Change with
  `brand.fonts: { "head": "…", "body": "…" }` only when the user asks.

Fields every slide accepts:

| Field | Meaning |
|---|---|
| `id` | short name, used in lint messages |
| `layout` | one of the 21 below |
| `kicker` | small label above the title (the section or topic) |
| `title` | the point of the slide, one sentence |
| `notes` | speaker notes, required, at least a sentence or two |
| `tone` | `light`, `tint` or `dark`, to override the layout's default |
| `source` | one small line at the bottom: where the data comes from, how to read the slide |
| `key` | legend items: `{ "color": "accent" \| "primary" \| "warn" \| "muted" \| "light", "label": "…" }` or `{ "arrow": true, "label": "…" }` |

A `band` (where a layout has one) is a full-width strip: a string, or
`{ "lead": "Result:", "text": "…", "kind": "warn" | "accent" | "deep" | "soft" }`.
Where a field is written `bullets | text`, give an array for bullets or a string for a paragraph.
Icons are react-icons/fa names (`FaTruck`, `FaWarehouse`, `FaBell`, `FaSearch`, …).

## Content shape → layout

| The content is… | Layout |
|---|---|
| the opening | `cover` |
| one number that carries the message | `big-number` |
| three to six numbers of equal weight | `kpi` |
| a few items of equal weight, each a name and a sentence | `icon-grid` |
| what something consists of, and what can be done with it | `feature` |
| two sides: done and pending, now and next, ours and theirs | `split` |
| options compared on the same attributes | `comparison` |
| steps in order | `process` |
| stages or phases | `timeline` |
| one comparison of numbers, a trend, or parts of a whole | `chart` (`bar`, `line`, `doughnut`) |
| a few facts in rows and columns that will each be spoken | `table` |
| a person's own words | `quote` |
| a photo or drawing with its explanation | `image-text` |
| the same stations seen with different rows beneath (problem, then answer) | `stations` |
| A contains B contains C | `nested` |
| a pattern across many cells (which option is weak where) | `matrix` |
| something the user will see or operate: a screen, a ticket, a report | `screen` |
| pairs: learned → changed, before → after, cause → response | `pairs` |
| the closing: decisions asked, next steps | `closing` |
| only when the user asks or the deck is long | `agenda`, `section` |

## The 21 layouts

Limits in brackets are enforced by lint.

**cover** (light) — `kicker`, `title`, `accent` (second part of the title, in the accent
colour), `subtitle`, `for`, `note`, `logos` (keys from `brand.logos`), `panel`:
`{ "items": [{ "icon", "label", "tag" }] [≤6], "arrows": true, "caption": "…" }`. The panel is
the dark column on the right; use it to preview the deck's spine.

**agenda** (light) — `items` [2–7 strings], `aside`: `{ "heading", "items" }`.

**section** (dark) — `number`, `title`, `subtitle`.

**big-number** (tint) — `number`, `label`, `body` (bullets | text), `stats`:
`[{ "value", "label" }]` [≤3].

**kpi** (light) — `tiles`: `[{ "value", "label", "note", "warn": true }]` [2–6], `band`.

**icon-grid** (tint) — `items`: `[{ "icon", "title", "body", "warn": true }]` [2–6], `band`.

**feature** (light) — `panel`: `{ "heading", "bullets" | "text" | "image", "alt" }` on the
left; `itemsHeading`; `items`: `[{ "icon", "lead", "text" }]` [2–6] on the right; `band`.

**split** (tint) — `left` and `right`, each
`{ "heading", "bullets" | "text" | "cards": [{ "title", "text" }] [≤4] }`. The right panel is
dark unless `"strong": false`.

**comparison** (light) — `columns`: `[{ "head", "highlight": true }]` [2–3]; `rows`:
`[{ "label", "cells": [one per column] }]` [2–6]. The same attributes for every option.

**process** (light) — `steps`: `[{ "title", "tag", "text" }]` [2–6], joined by arrows;
`lastStrong: true` fills the last step; optional lower half: `list`:
`{ "heading", "items" [≤5] }` and `aside`: `{ "heading", "tag", "fields": [{ "label", "value", "strong" }] [≤6], "result" }`
(an illustrated ticket or record); `band`.

**timeline** (light) — `items`: `[{ "label", "title", "bullets" | "text", "result" }]` [2–5];
`resultLabel` (default from `meta.labels.result`); `roles`: `[{ "who", "does" }]` [≤3]. No dates are required;
leave them out when the user has not given any.

**chart** (light) — `chart`: `{ "type": "bar" | "line" | "doughnut", "title", "categories": [],
"series": [{ "name", "values": [], "color": "muted" | "primary" | "warn" }], "condition",
"horizontal", "min", "max", "format" }`; `takeaway`: `{ "heading", "bullets" | "text" }`.
`chart.condition` is required: one sentence on the slide saying which data, which setting and
which period the chart shows. Charts are native and stay editable.

**table** (tint) — `head` [≤4 columns], `rows` [≤6], `widths` (relative), `note`, `aside`:
`{ "heading", "bullets" | "text" }`, `band`. The last resort: only for a few facts the
presenter will say cell by cell.

**quote** (dark) — `quote`, `by`, `context`. Real quotations only; use a bracketed
placeholder until there is one.

**image-text** (light) — `image` (PNG or JPG path), `alt`, `caption`, `side`: `"right"` to put
the image on the right, `heading`, `bullets` | `text`. Without a file it draws a labelled
placeholder.

**closing** (dark) — `steps`: `[{ "title", "text" }]` [≤4], `thanks`, `contact`.

**stations** (tint) — the spine. `stations`: `[{ "icon", "label" }]` [3–6], joined by arrows;
`stationsLabel`; `stationStyle: "accent"` for the answer slide; `rows`:
`[{ "label", "style": "plain" | "tint" | "strong" | "warn", "weight", "cells": [one per station] }]`
[1–3], where a cell is a string or `{ "title", "text" }`; optional `facts`:
`[{ "value", "label" }]` [≤5] above; `groups`: `[{ "from": 1, "to": 3, "label", "sub" }]`
bands spanning stations; `band`. Use the same `stations` on the problem slide and the answer
slide.

**nested** (light) — `levels`: `[{ "label", "note" }]` [2–4], outermost first; the innermost
box is filled and shows its `note` inside; `aside`: `{ "heading", "bullets" | "text" }`.

**matrix** (tint) — `columns` [2–7], `rows`: `[{ "label", "strong": true, "marks": [] }]`
[2–7], where a mark is `true` (filled), `false` (empty), `"warn"` or `null` (dash); `marks`:
`{ "filled": "…", "empty": "…", "warn": "…", "none": "…" }` — `filled` and `empty` are
required, because the slide has to say what the marks mean; `aside`.

**screen** (light) — an illustration with example data. `screen`: `{ "title", "tag" (default from
`meta.labels.illustration`), "tiles": [{ "label", "value", "warn" }] [≤5], "barsTitle",
"bars": [{ "label", "value", "text", "warn" }] [≤6], "barsMax", "rowsTitle",
"rows": [{ "text", "status": "ok" | "warn" | "idle" }] [≤6], "note" }`; `side`:
`{ "heading", "steps" [≤5], "numbered": false, "note" }`. Keep the example numbers consistent
with each other and with other slides.

**pairs** (tint) — `leftHead`, `rightHead`, `rows`: `[{ "left", "right" }]` [2–6], joined by
arrows. Say in `source` what the arrow means.

## Lint messages

| Message | Do this |
|---|---|
| text is too long for its box — shorten it by about N characters | Cut an idea, not grammar; move detail to the notes |
| must fit on one line | Shorten the label |
| one word is wider than its box | Use a shorter word |
| holds N at most | Split the slide, or use a layout that fits the content |
| same layout as the slide before it | Change one of the two layouts |
| speaker notes are missing or too short | Write what the presenter says |
| "chart.condition" is missing | Say which data, setting and period the chart shows |
| a table holds 6 rows and 4 columns at most | Show the one comparison as a chart, or the pattern as a matrix |
| two texts overlap | A text above it is too long; shorten that one |
| warn: this slide only organizes the deck | Keep `agenda` and `section` only when asked or the deck is long |
| warn: five plain light slides in a row | Set `"tone": "tint"` or `"dark"` on one content slide |
| warn: image not found | Fix the path, or leave `image` out for a placeholder |
| placeholders to replace | List these in the delivery |

Text sizes step down a little before lint complains, so an error means the text is really too
long. `--force` writes the file anyway; use it only to look at a draft.

## Adding a layout

In `scripts/deck.js`, add `L_['name'] = async (s, sl, n) => { head(s, sl, n); const bot = foot(s, sl); … }`
and a `TONE` entry. Draw between `TOP` and `bot` with the helpers: `T` (text, with fit and
lint), `body` (bullets or paragraph), `label`, `rect`, `rrect`, `circle`, `arrow`, `seg`,
`num`, `icon`, `badge`, `image`, `band`, `tag`, and `pal()` for tone-aware colours. Check
counts with `need(sl, 'field', min, max)`. Then document the layout here and add a slide to
`example/deck.json`. Add a layout when a content shape keeps recurring or when the only
alternative misstates a relationship; never fork the script per deck.
