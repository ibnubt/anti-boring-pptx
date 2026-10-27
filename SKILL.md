---
name: pptx-varied-deck
license: MIT
compatibility: Written for Claude (Claude Code, the Claude apps, the Agent SDK) and works best there. Needs Node 18 or newer and Python 3 (PyMuPDF for PDF, openpyxl for XLSX). Visual QA needs LibreOffice, or PowerPoint on macOS, plus poppler and Pillow.
description: Build a new, fully editable .pptx deck with varied, non-repetitive layouts from reference documents (reports, papers, notes, spreadsheets, earlier decks) or a brief, for any purpose (reports, training, talks, proposals), so it looks designed rather than a stack of identical text slides. Each slide is built around one focal element (a statement, a number, a picture, a chart or a drawing); the deck keeps a rhythm of kinds and tones; diagrams take the form of the relationship they show; the sources' own pictures, tables and chart data are reused; every fact is traceable and every part of the source accounted for; speaker notes narrate every slide. Use it whenever the user asks for a presentation, deck, slides, PPT or PowerPoint ("presentasi", "paparan", "buatkan ppt dari dokumen ini"), and again when they react to such a deck (monotonous, too much text, empty, missing points). For rebuilding a slide image as-is use image-to-pptx; for small text edits in an existing .pptx edit that file directly.
---

# Varied PPTX deck — content first, layout from a library

## Principle

Four things make a deck fail. This skill handles each one structurally, not with adjectives.

**Monotony** — every slide is "title + text in cards", in the same frame, on the same white
background, with the same amount of text. It is the failure people notice first.

- **41 layouts** in five kinds (statement, picture, data, drawing, text and cards) and four
  background tones live in `scripts/deck.js`, among them infographic drawings: big arrows, cycles,
  hubs, a diamond of four, pyramids and funnels, hierarchies, flowcharts, roadmaps, logo walls and
  slanted bands. You write one file, `deck.json`: pick a layout per
  slide and fill its fields. No rendering code.
- **One focal element per slide**: the statement, number, picture, chart or drawing that proves
  the title, larger than everything else on the slide. Text is its caption, about 60 words on a
  slide that is spoken over; the rest goes into the notes (step 3).
- **Rhythm**: the kind and the tone change from slide to slide, a statement changes the pace
  every few slides, and about one slide in four is dark or accent. Lint enforces it: the same
  layout twice in a row fails the build; three slides of one kind in a row, five light slides in
  a row, seven slides without a change of pace, slides over the word budget, and decks that are
  mostly text and cards, mostly light, or full of side panels of bullets are flagged.

**Pictures that say the wrong thing** — a hierarchy drawn as a flow, a chart that leaves out the
quantity its title is about. A diagram is a claim about how things relate, so its form is chosen
from the relationship in the content (step 3) and checked against the source after rendering.

**Slides nobody can present** — decoration, unexplained numbers, tables with no way in. A person
will stand up and speak this deck, so every element on a slide is something the presenter points
at and explains, and every slide carries speaker notes that do exactly that (step 5).

**Content the sources do not back** — a part of the document that never appears, a number put on
the wrong noun, a guess stated as fact. Every fact comes from a list that records its origin, and
every part of the source is on a slide or left out on purpose with the reason (step 1).

Editability is never compromised: every text is a text box, charts are native with datasheets,
tables are native tables, icons are small PNGs inside real shapes.

## Ask first (one message), then decide the rest yourself

Before the storyline, ask the user what you cannot derive and what would change the whole deck.
One message, and only the items the request leaves open:

- **Sources.** Which documents is the deck based on, and what is each one for: the content to
  present, supporting material (earlier decks, reports, catalogues, data), or a look to follow?
  If the request names none, ask rather than writing from memory.
- **Length.** How many slides, or how long is the talk? The answer is a ceiling, appendix
  included. From a duration, derive the count — about one content slide per minute — and state
  it. If they leave it to you, let the content decide, one message per slide, and report the
  count. Do not carry a number over from another deck.
- **Occasion and audience**, if not stated (management meeting, monthly review, training,
  seminar, client meeting). It sets the depth, the vocabulary and what the cover says.
- **Presented or read?** A deck someone speaks over carries short text; a deck sent around and
  read alone carries whole explanations. It sets the word budget (`meta.mode`).
- **Scope**, when briefs or notes leave it open: what is the deck about, and what is outside it?
- **Logos and template.** Look for the files in the project before asking. Every logo the
  company puts on its slides goes into `brand.header` (a list: e.g. the company and its holding).
- **Language**, only when it is really open (see the rule below).

If the content is your own synthesis — a recommendation or a design worked out from notes — put
the storyline in the same message, one line per slide, and build after the user reacts. A deck
that presents a finished document does not need this. If you cannot ask, or the user says to
just proceed, continue with content-driven length and list your assumptions in the delivery.
Layouts, order and wording are yours to decide; don't ask about them. Two looks are available:
`brand.style` `"editorial"` (serif headlines, hairlines; the default) and `"bold"` (heavy sans
headlines in the deep colour, the look of a corporate infographic deck); pick by the occasion and
say which in the delivery. Without brand colours, pick
one of the colour themes (`brand.theme`: `paper`, `ocean`, `forest`, `graphite`, `navy`) to suit
the occasion, say which in the delivery, and use a different one when the user wants variety.

**Language rule.** Write the deck — titles, body, labels inside charts and tables, legends,
speaker notes — in the language the user writes to you in, including when the source document is
in another language. Keep as-is: established technical terms, identifiers and names from the
source (metric names, configuration names, product names, a screen's own interface). In a
technical or training deck that includes the field's vocabulary and the source's own section and
category names — "AI Tools Landscape", prompt, context, workflow, approval gate, deliverable,
frontend — inside sentences of the deck language; a home-made translation ("Peta alat AI") reads
stranger than the term. Indonesian affixes on such words are hyphenated (`di-review`,
`meng-inspect`); the renderer keeps them whole at line ends. Format
numbers the way that language does (Indonesian: `0,822`, `1.155 token`). Ask about language only
when there is a concrete reason to doubt, such as an international venue.

## Time budget — hard limits

| Step | Budget | Stop rule |
|---|---|---|
| 0 Dependencies | 1 command | never repeated in a session |
| Ask | 1 message | only what the request leaves open |
| 1 Sources + facts | 1 read and 2 extraction commands per document | the whole document, once |
| 2 Storyline | 1–2 min per deck | one line per slide: message + kind + focal element + layout |
| 3–5 `deck.json` + notes | ~1–2 min per slide | fill fields; unknowns → placeholder + note |
| 6 Render + QA | 1 command | open the contact sheets, not single slides |
| Fix loop | **max 2 rounds** | batch all fixes, rerun once per round |
| 7 Deliver | 5–10 lines | no narration of the process |

Banned because they blow the budget: writing or forking pptxgenjs code per deck (one exception:
"Without the renderer" below); more than the one round of questions above; nudging coordinates;
re-rendering after each micro-edit; high-DPI QA; researching fonts or libraries mid-task.

## Workflow

### 0. Dependencies (once)

```bash
SKILL=<path to this skill folder>
ls $SKILL/scripts/deck.js $SKILL/reference/layouts.md $SKILL/example/deck.json
(cd $SKILL && node -e "require('pptxgenjs');require('sharp');require('react-icons/fa')" 2>/dev/null || npm install)
python3 -c "import fitz, openpyxl" 2>/dev/null || echo "PDF/XLSX extraction needs: pip install pymupdf openpyxl"
command -v soffice || command -v libreoffice || ls /Applications 2>/dev/null | grep -i powerpoint
```

- `scripts/deck.js` missing → tell the user in one line and follow "Without the renderer".
- The last line looks for something that renders slides for visual QA: LibreOffice anywhere, or
  PowerPoint on macOS (`reference/render-macos.md`). Contact sheets need `pdftoppm` and Pillow.
  If nothing can render, deliver anyway and say plainly that the deck was not checked visually.

### 1. Read the source, collect the facts

`reference/sources.md` has the detail; the essentials:

- Take stock of each document once: `python3 $SKILL/scripts/extract_content.py <doc> <out>`
  writes its outline, its tables and the data of its native charts; `extract_images.py` writes
  its pictures with the page each is on. Then read the whole document. Caveats, limitations and
  the numbers that qualify the headline sit past the abstract.
- List the facts the deck will use: every number with its unit, **the noun it counts**, its
  condition and uncertainty (n, interval, "at k = 5"), the qualifiers the authors attach, and
  where it came from. A slide says only what this list supports, and a title never claims more
  than the source does. Where the source hedges, the hedge goes on the same slide as the claim.
- The outline is the coverage list: in `deck.json`, `meta.coverage` points at it, every slide
  names the parts it carries in `covers`, and a part left out on purpose goes into `meta.omit`
  with the reason. Covering a part means the slide shows its point, not all its words.
- Use what the documents already hold: their tables as native tables, their chart data as native
  charts, their photos and screenshots cropped or cut out, their diagrams rebuilt in the deck's
  own drawing, their maps and drawings shown whole. An icon where the document has a photo, or
  bullets that retype a table, waste the source.
- Choose one concrete example from the source and reuse it through the deck (one site, one
  customer, one transaction). Slides then explain each other.
- Anything the source does not contain — event name, date, quotations, example wording, names you
  would fill in from memory — is left out, shown as an obvious placeholder, or listed under
  "to verify" in the delivery. Never invent content silently; this covers text as much as figures.

### 2. Storyline before layout

Read `reference/layouts.md` once. Then write the storyline as one line per slide:
**the message the slide proves** + **its kind and tone** + **the focal element** + the layout.

```
3  D light   "Barang masuk naik 6% dan selisih turun di tiga gudang"   stacked bar per gudang   chart
4  S accent  "Gudang C masih tertinggal karena satu lorong"              the sentence + 3 facts   statement
5  P light   "Selisihnya terkumpul di lorong belakang"                  the floor plan, marked   figure
```

- A slide title states the point ("Waktu laporan turun dari 9 hari ke kurang dari 1 hari"), not
  the topic ("Waktu laporan"). Exceptions: cover, section, closing.
- One message per slide. If a slide needs two focal elements, it is two slides.
- **Substance test.** Each slide answers "what was done, built, found or decided here?" in one
  plain sentence. Slides that only organize — agenda, dividers, "design principles" — are kept
  only when the user asks or the deck is long enough to need signposts.
- **Show the thing itself.** For a system: how it works, what it consists of, what its user sees.
  For a study: what was done to what, and what came out. For a report: what happened, how much,
  against what, and what was decided.
- **One spine.** Find the structure the content really has — the steps of a process, the parts of
  a system, the sites — and reuse it, so problem and answer, plan and result line up.
- **Leave undecided things undecided.** Dates, durations, prices and quantities that are in no
  document and that the user has not given are not yours to commit.
- Default sequences (adapt to the source's own order):
  - *Report or status update:* cover → summary → the numbers against target → one topic per
    slide with its evidence → where the work stands → issues → decisions and next period.
  - *Summary of documents:* cover → the answer in one slide → one finding per slide → what it
    means → open questions.
  - *Paper, thesis or seminar talk:* cover → why it matters → background and gap →
    contributions → method on the running example → evaluation setup → one finding per slide →
    error or qualitative analysis → conclusion → limitations.
  - *Training:* cover → what it is for → its parts → how to use it, step by step, on real
    screens → common mistakes → where to get help.
  - *Proposal:* cover → summary → the problem on the spine → the answer on the same spine → the
    thing itself, part by part → how the parts fit → evidence it has been done → phases → next
    steps.
- **Check the rhythm in the storyline, before any JSON.** Read the kind and tone columns alone:
  no layout twice in a row, no kind three times in a row, a statement every five to seven
  slides, text and cards at most two slides in five, about one slide in four dark or accent and
  not only the dividers, ≥ 60% distinct layouts. Change kinds now; it costs nothing here and a
  full rebuild later.

### 3. Design each slide around its focal element

`reference/design.md` has the reasons and the picture treatments. The rules:

- **The focal element first.** Decide what proves the title — a sentence, a number, a picture, a
  chart, a drawing — and give it at least half of the content area. It is the largest thing on the
  slide, two or three times the size of the next. Everything else is smaller and fewer.
- **Words: about 60 on a slide spoken over, about 120 on a slide read alone**, title included
  (`meta.mode`: `"presented"` or `"read"`). Tables, code, status rows and labelled illustrations
  are exempt. A card body is one line of thought; bullets ≤ 5 per block. Long source text is
  summarized, not shrunk: the detail goes into the notes, or onto a second slide or an appendix
  when the reader needs it on screen.
- **The takeaway goes in the title.** Mark the point inside the visual — one bar in the accent
  colour, one highlighted row, one numbered marker — instead of a panel of bullets beside it. A
  side panel (`takeaway`, `aside`, `side`) is for about one slide in four.
- **Vary the frame.** The kicker opens a part of the deck; it is not repeated on every slide.
  Statement, photo and section slides drop the card grid: the sentence or the picture is the
  slide. Dark and accent slides carry content too: a statement, a dark chart or kpi, a photo.
- **Empty space is not filled with text.** An empty third means the focal element is too small
  (make the picture, chart or drawing larger) or the slide is too thin (merge it, or use a layout
  made for less: `statement`, `big-number`, `photo`). Lint reports large empty areas.
- **Keep the editorial look.** The renderer sets it: a paper page, headlines in a serif (Georgia),
  body in Aptos, big numbers in Aptos Light, one accent, hairlines instead of boxes, the company
  logos at the top left of every slide and no page numbers. Colours come from one of five calm
  themes (`brand.theme`) or the brand's own; do not set sizes or colours per slide
  (`reference/design.md`).
- **Numbers stay quiet.** Steps, findings and list items carry a small "01" in the bold sans, not a
  big numeral or a coloured disc; the order is read from it, it is not decoration. Body text is
  never set in the muted grey: grey is for captions, labels and sources.
- **Depth from colour, not from lines.** No borders, no stripes on card edges, no glows. Where a
  block is needed it is a flat tile or a block of the brand colour.
- **Real things over icons.** Show the photo, the screen or the number the source has; give named
  products their logos (`image` on items, nodes, table cells, `big-number` `logos`). Leave `icon`
  out when there is nothing real to show: the renderer then sets the item in type alone, which
  reads better than a row of generic symbols.
- **Mark screenshots, don't frame them.** A real screen goes on `annotated` with `box` regions:
  the rest of the picture is washed pale, the region gets a thin accent outline with a small square
  number tag on its edge, and the list beside it repeats the same tags. No border round the picture.
- **Words, not symbols.** No "→", "·", "~" or dashes standing for words in titles and body text;
  write them out. Arrows belong in drawings.

Choose each visual from the relationship it shows:

| Relationship in the content | Draw it as | Not as |
|---|---|---|
| One claim that carries a part of the deck | `statement`: the sentence in large type, a photo behind or three facts beside | a title over a box of bullets |
| A contains B contains C (hierarchy, scope, taxonomy) | nested boxes (`nested`) | a row of boxes joined by arrows |
| A, then B, then C (process, pipeline, timeline) | boxes in order with arrows; every real connection drawn, including shared resources and feedback (`process`, `arrows`, `diagram`, `timeline`) | a grid of cards |
| Phases over time with what each delivers | a big arrow with milestones (`roadmap`) | a table of phases |
| A loop that repeats, or parts around one centre | `cycle` (numbered stages on a ring), `hub` (spokes from the centre) | a list |
| A decision inside a process (yes / no) | `diagram` with a `decision` node and labelled links: a flowchart | prose that says "if" |
| Levels, from broad to narrow, or a narrowing pipeline | `pyramid` (`invert` for a funnel) | stacked cards |
| A hierarchy: one thing broken down into parts and their parts | `tree` | nested bullets |
| Four options, alternatives or pillars | `diamond` | a 2 × 2 of cards |
| Principles, commitments, vision and mission | `ribbons` | a bullet list |
| Many products, tools or brands | `logo-wall`; three to six seen side by side with a picture each: `bands` | names in a sentence |
| A system's parts and how they connect | `diagram`, with the source's photos in its nodes | the source's diagram pasted as a picture |
| Options compared on the same attributes | aligned columns; the same example treated by each option (`comparison`) | unrelated cards with different content |
| Trade-off between two quantities | a chart showing both | a bar chart of one quantity with the other in a caption |
| Parts of a whole | doughnut or stacked bar whose parts add up | separate big numbers |
| Before → after, with or without a factor | paired bars, or `pairs` | two charts on different scales |
| A period's numbers against target or last period | `dashboard` or `kpi` with the change (`delta`) | numbers without their comparison |
| A pattern across many cells | a matrix of marks (`matrix`) | a grid of numbers |
| A register, schedule or specification a reader looks up | the source's table, native, the row that matters highlighted | bullets that retype the table |
| What a thing physically is (a device, a site) | its photo (`photo`, `gallery`) | an icon standing in for it |
| Something the user sees or operates | the real screenshot, marked (`annotated`); else `screen` with example data, labeled | a list of features |
| A map, a plan, a drawing, a scanned page | `figure`, as large as the slide allows | a redrawn approximation |
| One concrete case | an annotated example taken from the source | an invented example |

Then hold every drawing to these:

- A mark means one thing throughout the deck: arrow = "then / feeds into", nesting = "contains",
  bracket = "one unit", length or position = a quantity. A mark that means nothing is removed.
- The drawing agrees with the text beside it, and the chart contains the quantity named in the
  title. "Same recall on half the context" needs both recall and context in the picture.
- Plot only what the source reports. Don't add points to complete a curve.
- One accent color marks the item the slide is about, and that item keeps its color across
  slides. Any color code or table convention gets a key on the slide itself — the audience cannot
  see the notes. Each chart names its condition (which data, which period) on the slide.

### 4. Write `deck.json`

```json
{ "meta": { "lang": "id-ID", "mode": "presented", "coverage": "assets/doc/outline.json" },
  "brand": { "theme": "ocean",
             "logos": { "company": { "light": "assets/logo.png", "dark": "assets/logo-white.png" },
                        "holding": { "light": "assets/holding.png", "dark": "assets/holding-white.png" } },
             "header": ["company", "holding"] },
  "slides": [ { "id": "cover", "layout": "cover", "title": "…", "subtitle": "…", "notes": "…" },
              { "id": "claim", "layout": "statement", "tone": "accent", "title": "…", "covers": ["2"], "notes": "…" } ] }
```

- Fields per layout, `meta` and `brand`: `reference/layouts.md`. `example/deck.json` (a pilot told
  as a proposal) and `example/report.json` (a monthly report) show the layouts in use.
- Plain words: whole sentences, words this audience says, every term explained once, one name per
  thing, one idea per sentence. For technical audiences keep the field's terms (token, agent,
  KPI); for non-specialists lead with the plain equivalent. Examples in `reference/design.md`.
- Numbers you do not have → obvious placeholders ("[n]", "Rp [jumlah]") and a `source` note.
  Numbers in text boxes and tables are literal strings in the deck language's format; chart data
  labels are drawn by PowerPoint in the viewer's locale.
- Logos: files in `brand.logos` (with a white `"dark"` version for dark slides; make one when the
  logo has white parts inside a dark mark, since the automatic one would merge them); the logos
  named in `brand.header` (one key or a list) sit side by side at the top left of every slide,
  above a hairline. Logos keep their own colours, always: never recolour one (no home-made white
  version). On dark slides the masthead becomes a light band so the logos stay as they are. If
  `brand.json` exists in the project, omit `brand`.

### 5. Speaker notes are the narration

Every slide has `notes`, written as what the presenter says, in the deck language. The renderer
writes them as real speaker notes and refuses a slide without them.

- Follow the order the eye travels across the slide, and say where to look. Group the lines under
  a label in capitals that names the part of the slide ("GRAFIK KIRI", "KOTAK GELAP", "BARIS
  KUNING"), two to four short spoken sentences each, one per line; end with a "PESAN" (or
  "MESSAGE") group: the so-what, which also sets up the next slide. Labels are shown in bold.
- Explain how to read an encoding before giving the conclusion: what the axes are, what a color
  or a mark means. Explain, do not read the slide aloud; say a number only when it is the point.
- Length matches the time the slide gets — about 120 words a minute; two or three sentences for a
  cover or a statement.

**Narration test.** For every element on the slide — each box, arrow, number, color, icon,
caption — the notes contain a sentence that uses it. If you cannot write that sentence, the
element goes. This is what removes decorative motifs, orphan statistics and icons that mean nothing.

### 6. Render + QA (one command, four passes)

```bash
bash $SKILL/scripts/qa.sh deck.json out/<name>-v1.pptx
```

1. **Lint.** Errors stop the build and say what to do: text that does not fit, the same layout
   twice in a row, a missing note, a chart without its condition, a large empty area, a part of
   the source no slide covers. Fix all of them in `deck.json` and rerun once. Treat the rhythm
   warnings (kinds, light runs, change of pace, word budget, side panels) as errors unless you
   can say why the content needs it.
2. **Rhythm**, on `out/qa/sheet-N.jpg` (6 slides per image) at thumbnail size: do neighbouring
   slides look alike? Is a sheet all white boxes with text? Is there a slide whose point you see
   before reading a word? Change the kind, the tone or the focal element of the slides that blur
   together.
3. **Layout**, on the same sheets: clipped text → overlaps → large empty areas → contrast, logos
   on dark slides included.
4. **Meaning**, slide by slide against the fact list. Lint cannot check this; you do.
   - Read the titles alone, in order: do they tell the whole story?
   - Does the focal element show what the title claims? Does every arrow, nesting, bracket and
     bar agree with the source and with the text beside it?
   - Does every element pass the narration test? Are color codes and table conventions explained
     on the slide?
   - Is every number the source's, on its noun, with its qualifier, in the deck language's format?
   - Is every part of the source on a slide that really says it, or omitted with a reason the user
     would accept?

Batch layout and meaning fixes for the whole deck and rerun once. Two rounds maximum. A diagram
that misstates the content is not cosmetic — fix it within the rounds; only cosmetic leftovers go
into the summary.

### 7. Deliver

`out/<name>-v1.pptx` plus 5–10 lines in the user's language: slide count and the sequence of
kinds in one line; palette and font; coverage (parts on slides, parts omitted and why); tables,
charts and pictures taken from the sources; placeholders the user must replace; content to verify
(anything not from the source); whether visual QA ran; how to revise ("edit `deck.json`, rerun
`bash <skill>/scripts/qa.sh`"). Each later round is a new file (`-v2`, `-v3`); never overwrite a
delivered deck.

## Revisions

- **Has the user edited the delivered file?** Compare it with your last build
  (`scripts/pptx_text.py --diff`) and mirror their edits into `deck.json` before rebuilding.
- **"Monotonous", "boring", "looks generated"** → run the rhythm pass over the whole deck: kinds,
  tones, statements, focal elements, word budget, side panels. Re-plan the storyline's kind and
  tone columns; changing colours alone does not fix it.
- **"Too much text"** → apply the word budget to every slide; move detail to the notes or split.
- **"Too empty"** → enlarge the focal element or merge thin slides; never pad with text.
- Feedback that names no slide ("the illustrations are still wrong", "too crowded") → re-run the
  matching pass over every slide instead of guessing one, and report each change as
  before → after with the reason.
- Examples followed by "etc." name a class, not a list: fix every instance of the class.
- "Something from the document is missing" → check the coverage list and the slide that claims it.
- "I'm confused by slide N" → explain the content with one worked example from the data; change
  no slide until asked.
- A corrected fact → replace it everywhere, slides and notes. A language change is a rebuild with
  a full QA round.
- Change the source file and rerun. Never patch the .pptx by hand; the next rebuild loses the fix.

## When no layout fits

First compose from existing layouts, as long as the relationship survives: a 2×2 matrix as
`icon-grid` with 4 items keeps its meaning, a funnel as `process` does, pricing tiers as `table`
or `comparison` do. A containment hierarchy forced into `process` does not.

Add **one** generic layout to `L_` in `scripts/deck.js` (with `TONE` and `KIND` entries) when a
content shape recurs across decks, or when the only alternative is a layout that misstates the
relationship. The helpers and how to add one are at the end of `reference/layouts.md`. Never fork
a per-deck script.

pptxgenjs rules for that case: hex without `#`; never share an options object between two `add*`
calls; `rectRadius` only on `roundRect`; `margin: 0` on text aligned to shapes; bullets via
`bullet: true` + `breakLine`, never a literal "•"; speaker notes via `slide.addNotes(text)`, never
a text box; connectors are line shapes with `dashType` / `endArrowType`; a chart's `lineDash` is
one string for all series. After adding a layout, render both examples and export them to PDF.

## Without the renderer

If `scripts/deck.js` cannot run (no Node, no packages), the "no per-deck code" rule cannot hold:

- Say so in one line, so the user knows why this build is slower and how to fix it.
- Write one `build.js` (or the equivalent the machine supports) next to the output: small helpers
  at the top (text, rule, logo masthead, title), one block per slide, composed freely per
  slide, in the same editorial look (`reference/design.md`). Keep it with the deck so it can be rebuilt.
- Everything else in this skill still applies: asking first, the fact list and coverage, one
  focal element per slide, the rhythm of kinds and tones, the word budget, visuals chosen by
  relationship, notes on every slide, the QA passes, two fix rounds.

## Bundled files

- `scripts/deck.js <deck.json> <out.pptx> [--force] [--no-charts]` — the renderer and its lint.
- `scripts/qa.sh <deck.json> <out.pptx>` — build, render to PDF, contact sheets.
- `scripts/extract_content.py <document> <out-dir>` — outline, tables and chart data of a PDF,
  DOCX, PPTX, XLSX or Markdown file.
- `scripts/extract_images.py <document> <out-dir> [--pages]` — the pictures inside a PDF, PPTX or
  DOCX, with where each appears.
- `scripts/crop_image.py <in> <out> [--box x0,y0,x1,y1] [--trim] [--cutout]` — keep the part of a
  picture the slide needs, or cut a product out of its background.
- `scripts/pptx_text.py <deck.pptx> [--diff other.pptx]`, `scripts/contact_sheet.py`,
  `scripts/export_pdf_mac.sh` with `reference/render-macos.md`.
- `reference/layouts.md` — every layout, its kind and fields, `meta`, `brand`, the lint messages,
  how to add a layout. `reference/design.md` — rhythm, focal element, frame and tone, picture
  treatments, logos, plain words. `reference/sources.md` — extraction, coverage, the fact list,
  what to do with each table, chart and picture.
- `example/deck.json`, `example/report.json` — two decks to render and read.

## Scope

- New decks from documents, notes, data or a brief → this skill.
- "Make this slide image editable" → `image-to-pptx` (rebuild, not redesign).
- A deck that already exists as .pptx and only needs text edits → edit that file directly.
