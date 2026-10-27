# Design — what keeps a deck from looking generated

Read this with step 3. SKILL.md has the rules; this file has the reasons, the details and the
treatments for pictures, logos and wording.

Contents: why decks turn monotonous · the five kinds and the rhythm · one focal element · frame and
tone · the editorial look · borrowed pictures · marking a screenshot · logos · visual finish · plain
words · tables

## Why decks turn monotonous

A deck can use thirty different layouts and still look like one slide repeated, because the eye
does not see layouts. It sees four things, and when they repeat the deck is monotonous:

1. **The same frame.** Kicker, two-line title top left, logo top right, footer, page number, on
   every slide. The frame is useful; on every slide it makes every slide the same picture.
2. **The same density.** Every slide holds 80 to 100 words in boxes of similar size, so no slide
   is lighter or heavier than another and nothing stands out.
3. **The same tone.** Nine slides in ten on white or a pale tint; dark only for section dividers.
4. **The same answer to "where is the point?"** A visual on the left and a dark panel of bullets
   on the right, slide after slide.

The cure is contrast between slides and inside each slide: big against small, dark against light,
one sentence against a full chart, a photo edge to edge against a dense table. Contrast is planned
in the storyline, not added at the end.

## The five kinds and the rhythm

| Kind | Layouts | What it does to the pace |
|---|---|---|
| S statement | `statement`, `big-number`, `kpi`, `quote`, `section`, `cover`, `closing` | slows down: one big thing to take in |
| P picture | `photo`, `figure`, `gallery`, `annotated`, `image-text`, `screen`, `code`, `logo-wall`, `bands` | shows what exists |
| D data | `chart`, `dashboard`, `table`, `matrix`, `status` | proves with numbers |
| G drawing | `diagram`, `process`, `arrows`, `cycle`, `hub`, `diamond`, `pyramid`, `tree`, `roadmap`, `stations`, `nested`, `timeline` | explains how things fit |
| T text and cards | `icon-grid`, `feature`, `split`, `pairs`, `comparison`, `summary`, `agenda`, `ribbons` | lists and compares |

- No kind three times in a row. A run of explanation (G, T) needs a picture or a number between.
- A statement slide every five to seven slides. It is a content slide — the claim a part of the
  deck opens with, a finding, a decision — not a divider. Use `statement` with the sentence that
  carries the point, `big-number` with the number, or `quote` with the source's own words.
- Text and cards at most two slides in five. They are the default an author falls back on; most
  of their content is better as a drawing, a chart or a picture.
- About one slide in four dark or accent, spread through the deck: a statement, a dark chart or
  kpi, a photo, a dark diagram (`"tone": "dark"`). Accent (`"tone": "accent"`) is strongest; use it
  for one or two slides that carry the main message.

## One focal element

Each slide has one element that proves its title and that the eye finds first: a picture, a
chart, a drawing, a number or a sentence. It takes at least half of the content area and is the
largest thing on the slide.

- Everything else is smaller and fewer: a title, a condition line, one highlighted label, at most
  a short caption. If a second element competes for attention, it is a second slide.
- Contrast of scale: the focal element is two or three times the size of the next thing. A slide
  where every text has the same size has no entry point.
- Highlight inside the visual instead of explaining beside it: one bar in the accent colour and
  the rest muted, one row highlighted, one numbered marker on a screenshot.
- The takeaway goes in the title. A panel of bullets beside the visual (`takeaway`, `aside`,
  `side`) is for about one slide in four, when the reader needs the reasons spelled out.
- Words: about 60 on a slide spoken over, title included, and about 120 on a slide read alone.
  Tables, code, status rows and labelled illustrations are exempt. The detail goes into the notes;
  when the reader needs it on screen, onto a second slide or an appendix.
- Empty space is not filled with text. An empty bottom third means the focal element is too small
  (make the chart, picture or drawing larger) or the slide is too thin (merge it, or use a layout
  made for less: `statement`, `big-number`, `photo`).

## Frame and tone

- The masthead is the same on every slide: the company logo at the top left, a hairline under it,
  and the part of the deck at the top right when the slide opens a part. No page numbers and no
  footer band: the bottom of the slide belongs to the content.
- The kicker is a signpost for the first slide of a part; it is not repeated on every slide.
- Statement, photo and section slides drop the card grid entirely: the sentence or the picture is
  the slide.
- Asymmetric layouts mirror on every second use (`side` overrides when the content needs a side).
- A quiet transition between slides is available (`meta.transition: "fade"`) when the user wants
  the deck to move. No animations inside slides.
- Write with words, not symbol shorthand. Arrows "→", middle dots "·", tildes and dashes standing
  for words in titles and body text make a slide read as generated; write "from 9 days to 1",
  "about 600", "A and B". Arrows belong in drawings, where they mean "then" or "feeds into".

## The editorial look

The renderer carries one look, closer to a well-set report or a magazine than to a slide template.
Keep it, and do not set sizes or colours per slide. What makes a deck read as generated is the
template vocabulary: rows of cards, a tinted disc with an icon on each, coloured stripes on card
edges, glows, every slide in the same sans. The editorial look replaces each of them.

- **Paper and ink.** Light slides are a paper colour, text is near-black ink, and every grey and
  hairline lies between the two. White tiles on the paper are the only "cards", flat, without
  borders or shadows.
- **Five calm themes.** `brand.theme` picks the colours: `paper` (warm paper, charcoal,
  terracotta; the default), `ocean` (cool white, deep sea blue), `forest` (pale stone, deep green,
  moss), `graphite` (near white, graphite, one blue), `navy` (ivory, navy, muted gold). Each is a
  paper, an ink, one dark colour and one accent, nothing more: a deck with many colours looks busy.
  `brand.colors` overrides any of them. Vary the theme between decks, not inside one.
- **Two looks.** `brand.style: "editorial"` (the default) sets headlines in a serif; `"bold"` sets
  them in heavy Aptos in the deep colour, like a corporate infographic deck. Everything else below
  holds for both.
- **Two faces.** Headlines and quotations in Georgia, a serif every PowerPoint has. Body, labels
  and anything bold in Aptos (SemiBold for bold); big numbers in Aptos Light, whose figures line up
  (Georgia's old-style figures dance at display sizes). Labels in small spaced capitals. Captions
  and sources in Georgia italic. `brand.fonts.head` replaces the serif when the brand has its own.
- **One scale.** Titles 30 pt (down to 22 for long ones), statements 44 to 56, numbers up to 200
  on a `big-number` slide, item titles 18 to 28, body 14 to 20, labels 9 in spaced capitals. Fitted
  text steps down this scale only.
- **Hairlines instead of boxes.** Items hang from a hairline (ink, 1 pt); rows are separated by
  lighter rules; a table has a rule under its head and between rows, no filled head and no zebra
  stripes. A step or a column that needs weight sits on a block of the brand's primary colour.
- **Quiet numbers.** Steps, findings and agenda items get a small "01" in the bold sans, in the
  muted colour, above or beside their title; no big numerals, no coloured discs, no little arrows
  between steps. A number tag (a small accent square) is used only where it points at something:
  a region on a picture and the matching line in the list beside it.
- **Readable first.** Body text is in the ink (or the light text colour on dark slides), never in
  the muted grey; grey is for captions, labels and sources. Text on a dark slide is near white.
- **Colour.** The brand's primary colour is for dark slides and strong blocks, the accent marks
  the one thing a slide is about, `warn` and `bad` mark state. Dark and accent slides get a quiet
  gradient within their own colour; nothing is mixed across hues, nothing glows.
- **The content starts under the title.** A one-line title pulls the content up; short rows of
  steps or closing points sit in the middle of the room rather than leaving its bottom empty.

## Infographic drawings

Big arrows, cycles, hubs, a diamond of four, pyramids and funnels, trees, flowcharts and roadmaps
make a deck look designed when the shape is the relationship: steps that follow each other are
arrows, a loop is a cycle, a breakdown is a tree, a narrowing is a funnel, a yes/no is a diamond
node in a flowchart. Chosen for decoration, they are the generated look again. Rules:

- The shapes take two hues only: the deep colour in shades and the accent (`FAM`). The accent goes
  to the one part the slide is about (`strong` on a step, the apex of a pyramid, the last arrow).
- Text on and beside shapes is set as large as the room allows and never below 10 pt; a label
  that does not fit is shortened, not shrunk.
- Pictures stay real: a node, a band or a hub centre takes the product's logo or a real
  illustration (`image`) before a generic icon. Icons, when used, are line icons (Lucide `Lu…`,
  Phosphor `Pi…Light`) in white on their shape.
- No decoration without meaning: no arrow that does not mean "then", no ring that is not a loop.

## Marking a screenshot

A screenshot is explained on the picture, not with a border round it and big numbers stuck to its
edge. On `annotated`, give each point a `box` (`[x1, y1, x2, y2]`, fractions of the picture) round
the part it is about. The renderer rounds the picture's corners, sets it on a soft shadow, washes
everything outside the boxes pale, draws a thin accent outline round each box and hangs a small
square number tag on the outline at its top left; the list beside the picture repeats the same
tags.
Crop scrollbars, window chrome and other customers' names off the capture first
(`crop_image.py`). A point with only `x` and `y` gets the small number on that spot.

## Borrowed pictures look like one set

Pictures from several documents arrive in different styles. Give each kind one treatment and use
it every time.

- Product and device photos are cut out and stand on a white card or on the slide, at the same
  visual weight. No grey backgrounds left showing.
- Screenshots sit in a drawn browser window (`"frame": "browser"`), at most two per slide, each
  large enough to read — about 5 in wide or more. Otherwise show one marked with boxes
  (`annotated`, see "Marking a screenshot"), or redraw it as `screen`.
- Photos of places and installations fill their area edge to edge (`photo`, `statement` with
  `image`, or `"fit": "cover"`).
- Maps, plans and drawings get `figure`, which gives them the most room and keeps their edges.
- Explain a picture on the picture: the parts that matter boxed and numbered (`annotated`), not a
  bullet list beside a bare image. A picture fills the frame it is given.
- No box inside a box: the renderer frames a picture in its own background colour.
- Real things over icons. Where the sources have the photo, the screen or the number, show that.
  When items are products, tools or brands the audience knows, give each its logo (`image` in
  place of `icon` in `icon-grid`, `feature`, `stations`, `diagram` nodes, the cover panel, a
  `comparison` head, a `table` cell, or the `logos` row of `big-number`). With nothing real to
  show, leave `icon` out: the item is set in type alone. Icons, when used, are drawn plain in the
  accent, without a disc behind them.

## Logos

Logos are real files with transparent backgrounds: list them in `brand.logos`, name the company's
(and its holding's) in `brand.header` (they sit at the top left of every slide), and the ones for
the cover in its `logos`. A logo is never recoloured: no white version made by hand or by script.
On a dark slide the masthead turns into a light band, so the logos keep their colours. Give every logo that
appears on a dark slide its white version as `"dark"`. A logo is never put on a white plate.
Without a logo file the renderer prints `brand.name` as text; say so in the delivery. Use the
brand's own second colour for `warn` when the logo has one.

## Visual finish

The renderer carries the finish; keep it, and do not undo it with fields. No hairline borders round
cards, no stripes on their edges, no shadows except under a picture set on the page (a screenshot,
a figure), no glows (`"glow": true` brings one back on a dark slide when the user wants it). A tile
that needs attention is marked by its tint (warm for a warning, red for a problem), a figure that
needs attention by its colour. A fitting photo can fill the cover's right side (`panel.image`). A
white capture never sits on a white tile: on the paper it gets rounded corners and a soft shadow.
Numbers on dark slides stand free, without boxes.

## Plain words

1. Whole sentences: a subject and a verb, in the order a speaker of that language uses.
2. Words people say in a meeting of this audience. Never coin a word or a construction.
3. Every term is the audience's own or is explained in plain words the first time it appears.
4. One name per thing through the whole deck.
5. One idea per sentence. Read each title aloud; if it sounds translated, rewrite it.

| Hard to follow | What is wrong | Plain |
|---|---|---|
| "Compatibility as prerequisite" | headline fragment: who must do what? | "The new system must work with the ones already installed" |
| "Performance comparably benchmarked" | coined construction | "Every site can be compared using the same measures" |
| "Tare is checked against master tare" | trade jargon for a management audience | "The empty truck's weight is checked against its recorded empty weight" |
| "Cutting by section retrieves equally well" | invented wording for an expert audience | "Recall@5 of section-level chunks matches sliding windows, with less than half the context" |
| "The 95% CI excludes zero" | statistical shorthand | "The drop is larger than sampling noise would explain" |

The vocabulary runs in two directions. For peers, examiners and technical trainees, keep the
field's terms and the source's names (chunk, token, agent, Recall@5) and define each once; a
home-made translation is stranger than the term. That covers the source's section and category
names too: "AI Tools Landscape", "Getting Started with Claude Code", "Four integration
categories", "approval gate", "deliverables" stay as they are, inside sentences of the deck
language ("Setiap fase punya approval gate sendiri"), not "Peta alat AI" or "gerbang". For non-specialists (clients, management), lead
with the plain equivalent and give the original term once. Numbers follow the same rule: values as
the source prints them for peers, the spoken form for others.

## Tables

For a deck that is spoken over, a table is a last resort: the presenter ends up reading cells
aloud. Show the comparison as a chart and keep the table in an appendix. For a deck that is read,
and for content that is naturally a table (a register, a schedule, a list of sites, a
specification), the source's table goes on the slide: native, the columns the slide is about,
numbers aligned, the row that carries the point highlighted (`highlight`), totals marked
(`total`), status shown in colour, a title that says what to look at.
