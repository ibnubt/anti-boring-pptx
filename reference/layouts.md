# Layouts — what `deck.json` can contain

Read this once before writing the storyline. `example/deck.json` (a pilot, told as a proposal)
uses 25 layouts and `example/report.json` (a monthly report) uses the reporting layouts; render
them to see them (`bash scripts/qa.sh example/report.json /tmp/report.pptx`).

Contents: the deck file · content shape → layout · the five kinds · the 41 layouts · lint messages · adding a layout

## The deck file

```json
{
  "meta":  { "title": "…", "author": "…", "lang": "id-ID",
             "coverage": "assets/report/outline.json", "omit": { "4.2": "why it is left out" },
             "transition": "fade" },
  "brand": {
    "name": "Example Co",
    "colors": { "primary": "125D72", "accent": "C2410C", "warn": "D99A2B" },
    "logos": { "main": { "light": "assets/logo.png", "dark": "assets/logo-white.png" }, "partner": "assets/partner.png" },
    "header": "main"
  },
  "slides": [ { "id": "cover", "layout": "cover", "title": "…", "notes": "…" } ]
}
```

- `brand.style`: `"editorial"` (headlines in Georgia; the default) or `"bold"` (headlines in heavy
  Aptos in the deep colour, like a corporate infographic deck).
- `brand.theme`: the colour theme, one of `paper` (default), `ocean`, `forest`, `graphite`, `navy`
  (`reference/design.md`).
- `brand.colors`: overrides the theme's colours: `primary` is the dark tone (dark slides, strong
  blocks), `accent` marks the thing the slide is about, `warn` marks risk and attention, `paper`
  and `ink` set the light background and the text colour. All optional. Hex without `#`.
- `brand.logos`: transparent PNG files, paths relative to `deck.json`, each either a path or
  `{ "light": "logo.png", "dark": "logo-white.png" }`. `brand.header` names the logo shown at the
  top left of every slide, above a hairline, or lists several (`["company", "holding"]`) shown side
  by side with a hairline between. Logos are never recoloured: on a dark slide the masthead becomes a
  light band and the logos keep their colours (a `dark` version is only used where a layout puts a
  logo on a dark area, and only when the brand supplies it). No white plates. Without `header`, `brand.name` is printed there in
  spaced capitals. There are no page numbers.
- `brand.footer` (optional): one small line at the very bottom left, for a disclaimer such as
  "all figures are illustrative". Leave it out otherwise; the bottom belongs to the content.
- `meta.lang` is the deck's language (`id-ID`, `en-US`, …). The few words the renderer supplies
  itself — the "illustration" tag, the default takeaway heading, "Result:", status names and
  column heads, "continued" — follow it for English and Indonesian; for any other language set
  them in `meta.labels: { "illustration", "screenshot", "takeaway", "result", "image", "status":
  { "done", "ok", "risk", "late", "idle" }, "statusHead": { "name", "status", "progress", "text",
  "owner" }, "continued", "continuedNotes" }`.
- `meta.coverage` is the list of the sources' parts the deck must carry: the `outline.json` that
  `scripts/extract_content.py` writes, an inline list `[{ "id": "F1", "title": "…" }]` (the fact
  list, for documents without headings), or `{ "key": either, … }` for several documents, whose
  ids then become `key:id`. Each slide names the parts it carries in `covers`; a part left out on
  purpose goes into `meta.omit: { "id": "reason" }`. Lint refuses a deck that leaves a part with
  substance (40 words or more, or a table, chart or picture) neither covered nor omitted; a part
  is covered when it or one of its parents is named.
- `meta.mode`: `"presented"` (the default: someone speaks over the deck) or `"read"` (sent around
  and read alone). It sets the word budget lint checks per slide: about 60 or about 120 words,
  title included; `table`, `code`, `status`, `matrix` and `screen` are exempt.
- `meta.transition`: `"fade"`, `"push"` or `"wipe"` sets a quiet transition on every slide; a
  slide's own `transition` overrides it (`"none"` for none). Off by default.
- Pictures: where a layout takes a picture, `"fit": "cover"` crops it to fill its frame and
  `"focus": [x, y]` (fractions of the picture) keeps that point in view; the default keeps the
  whole picture. `photo` always crops. Lint warns when a picture fills less than half its frame.
- The renderer looks at each picture's border. A cut-out (transparent border) gets no frame or
  matte. A picture on a plain background gets a frame in that same colour, so its edge does not
  show as a second box (`image-text`, `feature`, `annotated`, `gallery`, `diagram`). A photo is
  left as it is.
- Type: headlines and quotations in Georgia, which every PowerPoint has; big numbers in Aptos
  Light; body, labels and anything bold in Aptos when its files are on the machine (it ships with
  PowerPoint and is the Office default since 2023), code in Consolas. Without Aptos the body is
  Arial (Liberation Sans on Linux has the same widths). Sizes step down a fixed scale (… 30, 28, 24,
  22, 20, 18, 16, 14 …), so they recur from slide to slide. `brand.fonts: { "head": "…", "body": "…" }`
  overrides the faces; only when the user asks. A deck for an older Office without Aptos (2019 or
  earlier) is built with `DECK_ARIAL=1`.
- Colour and finish: greys and hairlines lie between `ink` and `paper`; `tint` (optional)
  overrides the slightly deeper paper of tint slides. Items hang from hairlines instead of sitting
  in cards; tiles are flat white, without borders or shadows; dark and accent slides get a quiet
  gradient within their own colour. Connectors in drawings are neutral, and the accent marks only
  what the slide is about.

Fields every slide accepts:

| Field | Meaning |
|---|---|
| `id` | short name, used in lint messages |
| `layout` | one of the 41 below |
| `covers` | the ids of the sources' parts this slide carries (see `meta.coverage`) |
| `side` | on asymmetric layouts, which side the picture, chart or panel takes; leave it out and the layout mirrors itself on every second use |
| `kicker` | the part of the deck, in small capitals at the top right; on the first slide of a part only |
| `title` | the point of the slide, one sentence |
| `notes` | speaker notes, required, at least a sentence or two |
| `tone` | `light`, `tint`, `dark`, or `accent` (the brand's accent colour; for `statement`, `quote`, `section`, `big-number`, `kpi`, `closing`), to override the layout's default |
| `source` | one small line at the bottom: where the data comes from, how to read the slide |
| `glow` | `true` adds a soft light from a corner on a dark or accent slide (off by default) |
| `key` | legend items: `{ "color": "accent" \| "primary" \| "warn" \| "muted" \| "light", "label": "…" }` or `{ "arrow": true, "label": "…" }` |

A `band` (where a layout has one) is a full-width strip: a string, or
`{ "lead": "Result:", "text": "…", "kind": "warn" | "accent" | "deep" | "soft" }`.
Where a field is written `bullets | text`, give an array for bullets or a string for a paragraph.
Icons are react-icons names, chosen by prefix: `Fa…` (Font Awesome), `Lu…` (Lucide, line icons;
the best match for the infographic layouts), `Pi…` (Phosphor, e.g. `PiHandshakeLight`), `Tb…` (Tabler),
`Fi…`, `Md…`, `Ri…`, `Bs…`, `Hi…`. Prefer a real logo or picture (`image`) when there is one.

## The five kinds

Each layout makes one kind of slide. The rhythm of a deck is the sequence of kinds and tones, and
lint checks it (see `reference/design.md` for why).

| Kind | Layouts |
|---|---|
| S statement | `statement`, `big-number`, `kpi`, `quote`, `section`, `cover`, `closing` |
| P picture | `photo`, `figure`, `gallery`, `annotated`, `image-text`, `screen`, `code`, `logo-wall`, `bands` |
| D data | `chart`, `dashboard`, `table`, `matrix`, `status` |
| G drawing | `diagram`, `process`, `arrows`, `cycle`, `hub`, `diamond`, `pyramid`, `tree`, `roadmap`, `stations`, `nested`, `timeline` |
| T text and cards | `icon-grid`, `feature`, `split`, `pairs`, `comparison`, `summary`, `agenda`, `ribbons` |

No kind three times in a row; a statement every five to seven slides; text and cards at most two
slides in five; about one slide in four dark or accent.

## Content shape → layout

| The content is… | Layout |
|---|---|
| the opening | `cover` |
| one claim, finding or decision that carries a part of the deck | `statement` (a photo behind it, or three facts beside it) |
| the executive summary of a report: findings, the numbers that carry them, the decision asked | `summary` |
| one number that carries the message | `big-number` |
| three to six numbers of equal weight, with their change if there is one | `kpi` |
| a period's numbers against target or last period, with one or two charts | `dashboard` |
| where each piece of work stands: status, progress, owner | `status` |
| a few items of equal weight, each a name and a sentence | `icon-grid` |
| what something consists of, and what can be done with it | `feature` |
| two sides: done and pending, now and next, ours and theirs | `split` |
| options compared on the same attributes | `comparison` |
| steps in order | `process`; the same as big arrows: `arrows` |
| phases over time, each with what it delivers | `roadmap` |
| a loop that repeats | `cycle` |
| one centre and the parts around it | `hub` |
| a process with a yes/no decision | `diagram` with `"shape": "decision"` nodes (a flowchart) |
| levels from broad to narrow, or a narrowing pipeline | `pyramid` (`invert` for a funnel) |
| a hierarchy: a whole, its parts, their parts | `tree` |
| four options, alternatives or pillars | `diamond` |
| principles, commitments, vision and mission | `ribbons` |
| many products, tools or brands | `logo-wall` |
| three to six things side by side, each with a picture | `bands` |
| stages or phases | `timeline` |
| one comparison of numbers, a trend, or parts of a whole | `chart` (`bar`, stacked `bar`, `line`, `area`, `doughnut`, `pie`) |
| a table from a source: a register, schedule, list of sites, specification, results to look up | `table` (long tables continue on the next slides) |
| a map, a plan, a drawing, a scanned page, a chart whose data you do not have | `figure` |
| a person's own words | `quote` |
| one photo that carries the point, with the explanation beside it | `photo` |
| a screen or picture whose parts need explaining | `annotated` |
| a system's parts and how they connect: architecture, topology, data path | `diagram` |
| a photo or screenshot with a short explanation | `image-text` |
| photos or screenshots of several things, each with a name: devices, sites, screens, figures | `gallery` |
| the same stations seen with different rows beneath (problem, then answer) | `stations` |
| A contains B contains C | `nested` |
| a pattern across many cells (which option is weak where) | `matrix` |
| something the user will see or operate: a screen, a ticket, a report | `screen` (`screen.image` for a real screenshot) |
| a command, prompt or file the audience types, with what it does | `code` |
| pairs: learned → changed, before → after, cause → response | `pairs` |
| the closing: decisions asked, next steps | `closing` |
| only when the user asks or the deck is long | `agenda`, `section` |

## The 41 layouts

Limits in brackets are enforced by lint.

**cover** (light) — `kicker`, `title` (set large in the serif), `accent` (second part of the title,
in the accent colour and italic), `subtitle`, `for`, `note` (in italic under `for`), `logos` (keys
from `brand.logos`; the header logo by default), `panel`:
`{ "items": [{ "icon" | "image", "label", "tag" }] [≤6], "arrows": true, "caption": "…", "image", "focus", "shade" }`.
The panel is the column on the right: a photo (`image`, cropped to fill it), the deck's spine as a
list between hairlines (`items`), or both, the photo then under a layer of the deep colour
(`shade`: its transparency, default 28, lower is darker).

**agenda** (light) — `items` [2–7]: strings, or `{ "title", "text" }` to say in a line what each
part holds; `aside`: `{ "heading", "items" }`.

**statement** (dark) — one sentence in large type: the claim a part of the deck opens with, a
finding, a decision. No cards and no bullets; the slide is the sentence. `title` (the sentence,
24–40 pt, one or two lines read best), `kicker`, `sub` (one supporting line), `points`:
`[{ "value", "label", "warn": true }]` [≤3] as facts beside the sentence, `image` (a photo behind
the whole slide, cropped to fill it and toned for the text; `focus`, `shade` 0–90, default 18),
`tone`: `"dark"` (default) or `"accent"`. Exempt from the empty-area lint: its air is the point.

**section** (dark) — `number`, `title`, `subtitle`; `image` (optional): a cut-out or illustration
stands at the right, a photo fills the right 40% under a layer of the deep colour
(`shade`, default 30; `focus`). The title then takes the width that is left.

**big-number** (tint) — `number` (in Aptos Light, as large as the room allows; the column is as wide
as the number), `label`, `body` (bullets | text), `stats`: `[{ "value", "label" }]` [≤3], `logos`:
`[{ "image", "dark", "label" }]` [≤8] — what the number counts, shown as a row of logos with their
names under the text (`logosHeading` labels the row; `dark` is a white version for dark slides).

**kpi** (light) — `tiles`: `[{ "value", "label", "note", "delta", "good", "warn": true }]` [2–6],
`band`. The tiles fill the slide and their texts share one size. `delta` is the change against a
target or an earlier period ("+6% dari Agustus"); a leading "-" turns the triangle down, and
`good: true | false` colours it green or red (grey when left out).

**icon-grid** (tint) — `items`: `[{ "icon" | "image", "title", "body", "warn": true }]` [2–6], `band`.
`image` puts a logo or a small illustration (transparent PNG) where the icon would be, whole and
never cropped; use it when the items are products or brands the audience should recognise. Set
editorially, without cards: each item hangs from a hairline, with its logo or plain icon if it has
one, a title in the serif and the body under it; up to four in a row, five or six in two rows of
three. Leave `icon` out when there is nothing real to show.

**feature** (light) — `panel`: `{ "heading", "bullets" | "text" | "image", "alt", "fit", "focus" }`
on the left (a picture on a white tile, or the text on a block of the deep colour); `itemsHeading`;
`items`: `[{ "icon" | "image", "lead", "text" }]` [2–6] on the right, between hairlines; `band`.

**split** (tint) — `left` and `right`, each
`{ "heading", "bullets" | "text" | "cards": [{ "title", "text" }] [≤4] }`. The left panel is a
white tile, the right one a block of the deep colour unless `"strong": false`; cards inside a panel
are rows between hairlines, not boxes.

**comparison** (light) — `columns`: `[{ "head", "highlight": true, "image" }]` [2–3]; `rows`:
`[{ "label", "cells": [one per column] }]` [2–6]. The same attributes for every option. With an
`image` (a product's logo) each head shows the logo over the name. The table is ruled, not boxed;
the highlighted column sits on one pale band from its head to the last row.

**process** (light) — `steps`: `[{ "title", "tag", "text" }]` [2–6], each hanging from a hairline
with its number ("01") small above the title; `lastStrong: true` sets the last step on a block of
the deep colour; a row of short steps sits in the middle of the room; optional lower half: `list`:
`{ "heading", "items" [≤5] }` and `aside`: `{ "heading", "tag", "fields": [{ "label", "value", "strong" }] [≤6], "result" }`
(an illustrated ticket or record); `band`.

**timeline** (light) — `items`: `[{ "label", "title", "bullets" | "text", "result" }]` [2–5];
`resultLabel` (default from `meta.labels.result`); `roles`: `[{ "who", "does" }]` [≤3]. No dates are required;
leave them out when the user has not given any.

**chart** (light) — `chart`: `{ "type": "bar" | "line" | "area" | "doughnut" | "pie", "title",
"categories": [], "series": [{ "name", "values": [], "color": "muted" | "primary" | "warn" | "bad" }],
"condition", "horizontal", "stacked", "min", "max", "format" }`; `takeaway`:
`{ "heading", "bullets" | "text" }`, a note column beside the chart (a hairline, a label, the
text), which takes the left side on every second chart slide (`side` sets it). `chart.condition` is required: one sentence on the slide saying
which data, setting and period the chart shows. `extract_content.py` writes a source's native
charts in this form (`charts/C01.json`); fill in the condition. Charts are native and editable.

**table** (tint) — `head` [≤8 columns], `rows`, `widths` (relative; by default from the text
lengths), `align` (per column, `"left"` | `"right"`; numeric columns are right-aligned by
default), `highlight` (row indices, from 0, of the rows the slide is about), `highlightCol`
(a column index), `total: true` (the last row is a total: bold, with a rule above), `note`,
`aside`: `{ "heading", "bullets" | "text" }` as a note column beside the table, `band`. A cell is a string, or
`{ "text", "status": "ok" | "warn" | "bad" | "idle" | "done" }` for a coloured status, or
`{ "text", "b": true }`, or `{ "text", "image" }` for a small logo before the text (a table of
products, vendors or tools). One text size for the whole table, the largest at which every cell
fits. A table with more rows than `perSlide` (default 12) continues on the next slides, split
evenly, with the head repeated, the title marked as continued, `n / N` above it, and short notes
(`notesContinued` to write your own); `highlight` and `total` follow the rows. `extract_content.py`
writes a source's tables in this form (`tables/T01.json`: `head`, `rows`); check them against the
page before use. For a deck that is spoken over, a results table is better shown as the one
comparison in a `chart`.

**quote** (dark) — `quote` (set in the serif italic under a large opening mark), `by`, `context`,
`image` (the source's logo or portrait, beside the attribution). Real quotations only; use a
bracketed placeholder until there is one.

**image-text** (light) — `image` (PNG or JPG path; drawn from the top, with `caption` right under it), `alt`, `caption`, `tag` (a small label on
the picture's corner, such as "partner project" or "example screen"), `side`: `"left"` | `"right"`
(by default the picture is on the left, and on the right on every second use), `heading`,
`bullets` | `text`. Without a file it draws a labelled
placeholder.

**gallery** (light) — `items`: `[{ "image", "title", "caption", "tag", "alt", "fit", "focus" }]` [2–6],
each a picture with its name and a short caption. The cards fill the slide; each card puts its
picture above its text ("stack") or beside it ("side"), and the shape and column count that show
the pictures largest without leaving frames half empty are chosen. Override with `cols` and
`card: "stack" | "side"`. Pictures stand on the page with their text under them, no card. How the
pictures sit depends on what they are: cut-outs stand on white tiles at the same visual weight; `"frame": "browser"` puts each screenshot in a browser
window sized to it, with its text below on the slide (best on `"tone": "dark"`, two per slide);
other pictures sit on a matte in their own background colour. A browser gallery is a dark slide
unless `tone` says otherwise. `fit: "cover"` crops all pictures
to their frames (photos of different shapes). `band`.

**photo** (dark) — a photo edge to edge on one side of the slide, cropped to fill it; the title and
explanation on the other side. `image`, `alt`, `side`: `"left"` | `"right"` (default: left, then
right on every second use),
`width` (fraction of the slide, 0.38–0.62, default 0.5), `focus`, `caption` (one line on a dark
strip across the photo's foot), `tag`; then `points`: `[{ "title", "text" }]` [≤5] as a numbered
list, or `bullets` | `text`; `stats`: `[{ "value", "label" }]` [≤3] along the bottom. Set
`"tone": "light"` for a light text side.

**annotated** (light) — one picture with its parts marked, and what each mark shows beside it.
`image`, `alt`, `caption` (one line in italic under the picture), `points`:
`[{ "box": [x1, y1, x2, y2], "title", "text" }]` [1–6]. `box` is the region a point is about, in
fractions of the picture (left top to right bottom): everything outside the boxes is washed pale,
each box gets a thin accent outline with a small square number tag on its top left edge (inside the
corner when the box starts at the picture's edge), and the list beside the picture repeats the same
tags. A point with `x` and `y` instead gets the tag on that spot; a point with neither has no
place on the picture. `"wash": false` keeps the picture unwashed. `listHeading`, `note` (a box
under the list), `side`: `"left"` | `"right"` (default: left, then right on every second use),
`frame`: `"plain"` (rounded corners on a soft shadow; the default), `"browser"` (a drawn window),
`"dark"`, or `"none"` (the default for a cut-out), `tag`, `band`. The picture is as large as the
slide allows with a list at least 3.6 in wide beside it. Crop scrollbars and window chrome off a
capture before using it.

**code** (light) — a command, a prompt or a file the audience will type, set in a dark panel in a
monospace face, with what it does beside it. `code`: `{ "label", "lines": [] }` (one string per
line; lines starting with `#` or `//` are dimmed as comments; `text` with line breaks also works);
`result`: `{ "heading", "text" | "bullets" }`, the expected outcome in a box under the panel;
`heading`, `points`: `[{ "title", "text" }]` [≤6] as a numbered list beside the panel, or
`bullets` | `text`; `note` (a box under the list); `width` (the panel's share of the width,
0.42–0.66, default 0.56); `side` (which side the panel takes; it mirrors on every second use);
`band`. The text size is the largest at which every line fits; long lines wrap, so keep commands
short and put one per line.

**diagram** (light) — boxes on a grid joined by arrows, in optional containers. `nodes`:
`[{ "id", "row", "col", "title", "text", "image" | "icon", "strong", "warn", "fit", "focus" }]` [2–12],
one node per grid cell, rows and columns counted from 0; a node with `image` shows the photo
(beside its text when the node is wide); `strong` fills the node with the dark colour. `links`:
`[{ "from", "to", "label", "dash", "arrow": false, "muted", "strong" }]` (neutral grey by default;
`strong` draws the link in the accent colour, for the one path the slide is about), drawn along a row, along a column,
or between neighbouring rows (out of the node, across, and into the other node); a label on a
link along a row widens the gaps, so keep labels for the links that need one. `groups`:
`[{ "label", "nodes": [ids], "strong", "dash" }]` draw a container around their nodes' cells.
`aside`: `{ "heading", "bullets" | "text" }` on the right; `band`. Arrows mean "feeds into" or
"sends data to"; a dashed line without a head means "watches" or "belongs to".

**screen** (light) — a screen in a frame: a real screenshot, or an illustration with example data.
With `screen.image` (and `alt`) the screenshot fills the frame, the tag defaults to
`meta.labels.screenshot`, and tiles, bars and rows are left out. Without it: `screen`: `{ "title", "tag" (default from
`meta.labels.illustration`), "tiles": [{ "label", "value", "warn" }] [≤5], "barsTitle",
"bars": [{ "label", "value", "text", "warn" }] [≤6], "barsMax", "rowsTitle",
"rows": [{ "text", "status": "ok" | "warn" | "idle" }] [≤6], "note" }`; `side`:
`{ "heading", "steps" [≤5], "numbered": false, "note" }`. Keep the example numbers consistent
with each other and with other slides.

**pairs** (tint) — `leftHead`, `rightHead`, `rows`: `[{ "left", "right" }]` [2–6], joined by
arrows. Say in `source` what the arrow means.

**summary** (light) — the executive summary of a report or a study. `points`:
`[{ "title", "text", "warn": true }]` [2–5], numbered down the left, each a finding with one or
two sentences; `numbersHeading`, `numbers`: `[{ "value", "label", "warn": true }]` [≤4] stacked on
a dark column; `ask`: `{ "heading", "text" }`, the decision asked for, in a box at the column's
foot. `"side": "left"` puts the column on the left.

**dashboard** (tint) — a reporting page. `tiles`: `[{ "value", "label", "delta", "good", "warn" }]`
[2–5] along the top, each with its change; `charts` [1–2]: chart objects as in `chart` (each with
its `condition`), side by side below; `side`: `{ "heading", "bullets" | "text" }`, a dark panel
for what to note, which mirrors to the left on every second dashboard; `band`.

**status** (light) — where each piece of work stands. `rows`: `[{ "name", "status": "done" | "ok" |
"risk" | "late" | "idle", "progress" (0–100), "text", "owner" }]` [2–10]; the status shows as a
coloured pill with its name (`meta.labels.status`, or `statusLabels` on the slide), progress as
a bar with its percentage; columns without data are left out. `columns`: the column heads
(defaults from `meta.labels.statusHead`); `band`.

**figure** (light) — one picture from a source that cannot be redrawn: a map, a site plan, an
engineering drawing, a scanned page, a Gantt chart, a chart whose data is not available. `image`,
`alt`, `caption` (under the picture), `tag` (under the picture, at its right edge, so it never
covers the figure), `frame`: `"plain"` (the default: a card in the picture's own background
colour), `"browser"`, `"dark"` or `"none"`; then `points`: `[{ "title", "text" }]` [≤4], or
`bullets` | `text`, with `heading`. The picture is shown as large as the slide allows: the text
goes beside a tall picture and under a wide one, whichever leaves the picture larger. Leave the
text out and the picture takes the whole slide.

**arrows** (light) — the steps of a process as big chevron arrows in a row, each step's text under
its arrow. `steps`: `[{ "title", "text", "tag", "strong": true }]` [3–6]; `lastStrong: true` sets the
last arrow in the accent; `band`. The arrows darken from light to deep; the composition sits in the
middle of the room when the texts are short.

**roadmap** (light) — a big arrow across the slide with milestones on it; each milestone's title and
line sit above and below the arrow in turn. `items`: `[{ "label", "title", "text" }]` [3–7]
(`label` is set on the arrow next to its milestone: "V1", "Q3", "Fase 1").

**cycle** (light) — stages in a loop: numbered nodes on a ring around a centre label, each stage's
title and line beside its node. `center`: `{ "title" }` (or a string), `items`:
`[{ "title", "text", "icon" | "image" }]` [3–6], starting at the top right and going clockwise;
`aside`: `{ "heading", "text" | "bullets" }` as a note column on the left.

**hub** (light) — one centre and the parts around it, joined by spokes. `center`:
`{ "title", "text" }` or `{ "image" }` (a product's logo on a white disc), `items`:
`[{ "title", "text", "icon" | "image" }]` [3–8], `aside`.

**diamond** (light) — four options, alternatives or pillars around a diamond split in four, each
with its title and line at a corner of the slide and a bar pointing in from the slide's edge.
`items`: `[{ "title", "text", "icon" | "image" }]` [exactly 4]; `items[0]` is at the top right, then
clockwise.

**pyramid** (light) — levels from narrow to broad, each label inside its band and the explanation
beside it on a dotted leader. `levels`: `[{ "label", "title", "text" }]` [3–6], top first; the apex
is in the accent. `invert: true` makes a funnel (the widest band at the top, the narrow end in the
accent).

**tree** (light) — a hierarchy: a root bar, its children as tiles under a bus line, and each
child's own items listed under it on a rail. `root`: `{ "title", "text", "color": "deep" }`,
`children`: `[{ "title", "text", "icon" | "image", "children": [strings or { "title" }] [≤5] }]` [2–5].
With an icon or image a child gets a round node on its top edge.

**ribbons** (light) — rows with a coloured label block on the left (an icon or logo and a short
label, `kicker` above it) and the statement fading out to the right: principles, commitments,
vision and mission. `items`: `[{ "kicker", "label", "icon" | "image", "text" }]` [2–5]; `image`
(slide level) puts a picture on the right; `band`.

**logo-wall** (tint) — many products, tools or brands as logos on white tiles that run off the
slide's right edge, the point in large text on the left. `logos`: `[{ "image", "label" }]` [3–24],
`text` | `bullets`. The tile size is the largest that shows every logo.

**bands** (light) — three to six things side by side on slanted pale stripes that run edge to edge,
each with a picture (a logo or an illustration) or an icon, a title and a line: tools, products,
generations of something. `items`: `[{ "image" | "icon", "title", "text" }]` [3–6].

A **flowchart** is a `diagram` whose nodes take `"shape"`: `"decision"` (a diamond for a yes/no
question; its links carry `"label": "Ya"` / `"Tidak"`), `"start"` or `"end"` (a pill in the deep or
the accent colour). Other nodes are the usual tiles.

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
| a table holds 8 columns at most | Keep the columns the slide is about; the rest stay in the source or go to an appendix slide |
| table row N has M cells; the head has K | Give every row one cell per column (an empty string for a blank cell) |
| table cells do not fit even at 9 pt | Shorten the longest cells, drop a column, or lower `perSlide` |
| empty area of W × H in (…% of the content area) | Add what the sources hold on this point (picture, table, numbers), use a layout made for less, or merge the slide with its neighbour. Error from about 22%, warning from 12% |
| a W × H in card is N% empty inside | The same: the card's content is too thin for its size |
| warn: three slides in a row are rows of boxes | Show one of them as the source's picture, a chart, a diagram or a table |
| warn: three … slides in a row (same kind) | Change the kind of one: a statement, a picture, a chart or a drawing |
| warn: N words on the slide (about 60 at most) | Keep the slide's one point; move the detail to the notes, an appendix or a second slide |
| warn: seven slides without a change of pace | Put a `statement`, `big-number`, `quote` or full photo among them |
| warn: deck — N of M slides are light | Make about one in four dark or accent, content slides included |
| warn: deck — N of M slides are text and cards | Show more of the content as pictures, charts, drawings or statements |
| warn: deck — N of M slides put a panel of bullets beside the visual | Say the point in the title; mark it inside the visual |
| warn: "tone": "accent" suits … | Use accent on statement, quote, section, big-number, kpi or closing |
| the deck leaves out N part(s) of the sources | Put each on a slide (`covers`) or list it in `meta.omit` with the reason |
| warn: "covers" names "x", which is not in meta.coverage | Use the ids from `outline.md` (or from the inline list) |
| "charts[i].condition" is missing | Say which data, setting and period the dashboard chart shows |
| status must be one of done, ok, risk, late, idle | Use one of those five |
| two texts overlap | A text above it is too long; shorten that one |
| warn: this slide only organizes the deck | Keep `agenda` and `section` only when asked or the deck is long |
| warn: five light slides in a row | Set `"tone": "dark"` on one content slide, or put a statement or photo there |
| warn: image not found | Fix the path, or leave `image` out for a placeholder |
| warn: image … may look blurry | Show it smaller, crop less, or find a larger original |
| warn: image … fills only N% of its frame | Crop it (`"fit": "cover"` or `crop_image.py`), or use a layout shaped like it (`annotated`, `gallery`, `photo`) |
| warn: gallery pictures fill only N% of their frames | Crop them to one shape, cut them out, or set `"fit": "cover"` |
| warn: N wide pictures in one gallery are shown about … wide | Show one or two screenshots larger (`"frame": "browser"`, `annotated`), or redraw the screen as `screen` |
| nodes … share row …, column … | Give each node its own cell |
| point N: "x" and "y" are fractions | Place markers with values between 0 and 1 |
| warn: gallery item has no "image" | Add the picture, or use `icon-grid` for items without one |
| placeholders to replace | List these in the delivery |

Text sizes step down a little before lint complains, so an error means the text is really too
long. `--force` writes the file anyway; use it only to look at a draft.

## Adding a layout

In `scripts/deck.js`, add `L_['name'] = async (s, sl, n) => { head(s, sl, n); const bot = foot(s, sl); … }`
and `TONE` and `KIND` entries (a slide that draws its own title, like `statement`, calls `chrome(s, n, sl)` for the masthead: logo, kicker and hairline). Draw between `TOP` and `bot` with the helpers: `T` (text, with fit and
lint), `body` (bullets or paragraph), `label`, `rect`, `rrect`, `circle`, `arrow`, `seg`,
`num`, `icon`, `badge`, `image`, `pic`, `band`, `tag`, `delta`, `drawChart`, and `pal()` for
tone-aware colours. Size sibling texts together with `uni([[content, w, h, opts], …], [max, min])`,
which returns one fit range for all of them, and let boxes take the room the slide has rather
than fixed heights. Every helper records what it draws for the empty-area lint; a large light
shape counts as a container, so content must fill it. Check counts with
`need(sl, 'field', min, max)`. An asymmetric layout reads `sl._alt` (true on every second use)
when `side` is not set. Then document the layout here and add a slide to
`example/deck.json` or `example/report.json`. Add a layout when a content shape keeps recurring or when the only
alternative misstates a relationship; never fork the script per deck.
