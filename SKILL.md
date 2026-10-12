---
name: pptx-varied-deck
license: MIT
compatibility: Written for Claude (Claude Code, the Claude apps, the Agent SDK) and works best there. Needs Node 18 or newer. Visual QA needs LibreOffice, or PowerPoint on macOS, plus poppler and Pillow.
description: Build a fully editable .pptx deck from reference documents — a paper, a report, meeting notes, a brief, earlier decks, or several together — that a person can stand up and present. The documents decide what the deck says, and this skill makes each slide show what they actually contain (what was done, found, built or decided) instead of scaffolding, in words the audience would use, with every fact traceable to its document, diagrams whose form matches the content, varied layouts, and speaker notes for every slide. Use it whenever the user asks for a presentation, deck, slides, PPT or PowerPoint ("presentasi", "paparan", "buatkan ppt dari dokumen ini") for any purpose, such as a seminar talk, a report summary, a briefing, a proposal or training material, and again when they react to a deck built this way (too long, hard to follow, no substance). For rebuilding a slide image as-is use image-to-pptx, and for small text edits in an existing .pptx edit that file directly.
---

# Varied PPTX deck — from reference documents to a deck someone can present

The usual job: the user hands over one or more reference documents and wants a deck made from
them, for a seminar, a briefing, a report to management, a proposal or a training session. The
documents decide what the deck says. This skill decides how it is said and shown, and keeps
the deck faithful to them.

## What this skill protects against

A person will stand up and speak this deck. A deck fails them in five ways. Each one has a
concrete check below, because adjectives like "clear" or "substantive" prevent none of them.

| The deck… | It looks like | Checked by |
|---|---|---|
| says nothing | agenda, section dividers, "design principles", benefits with no mechanism | substance test (step 2) |
| says what the source does not | a number on the wrong noun, a guess stated as fact, a plan cited as a result | fact list with origins (step 1) |
| uses words the audience would not | headline fragments, coined terms, undefined jargon, sentences that sound translated | plain-words pass (step 4) |
| draws the wrong picture | a hierarchy shown as a flow, a chart without the quantity in its title | visual from the relationship (step 3) |
| cannot be presented | grids of numbers, decoration, every slide "title + row of cards" | narration test (step 5), layout library and lint |

Layouts come from a library, so variety costs nothing: **21 layouts** with different
compositions and background tones live in `scripts/deck.js`. You write one file, `deck.json`,
picking a layout per slide and filling its fields, and you write no drawing code. Lint stops
the build on text that does not fit, a slide without notes, a chart without its condition, a
table that is too big, or the same layout twice in a row.

Editability is never compromised: every text is a text box, charts are native with datasheets,
tables are native tables, icons are small PNGs inside real shapes.

## Ask first (one message), then decide the rest yourself

Before the storyline, ask what you cannot derive and what would change the whole deck. One
message, only the items the request leaves open. Use the question tool when you have one; a
checklist suits "what must be in".

- **Sources.** Which documents is the deck based on, and what is each one for: the content to
  present, supporting material to draw on (earlier decks, reports, catalogues), or a look to
  follow (a template)? If the request names none, ask rather than writing from memory.
- **Length.** How many slides, or how long is the talk? The answer is a ceiling, and the
  appendix counts toward it. If the content seems to need more, cut, merge or ask; never exceed
  it quietly: a deck that runs past the number the user gave reads as long-winded, however good
  the extra slides are. From a duration, derive the count — about one content slide per
  minute — and state it. If they leave it to you, build the shortest deck that carries the
  argument and report the count. Do not carry a number over from another deck.
- **Occasion and audience**, if not stated (thesis seminar, conference talk, management
  briefing, client meeting, internal review). It sets the depth, the balance of method and result, the vocabulary
  (step 4), and what the cover says.
- **Scope.** What is the deck about, and what is outside it? Briefs and meeting notes rarely
  say. Stay inside the answer and inside the documents: what you look up yourself helps you
  understand the subject, but it goes on a slide only if the user wants it there. Material from
  outside the brief reads as off-topic, however accurate it is.
- **What must be in**, when the deck presents a document and the time is limited. Offer the
  document's own parts as a checklist (gap and contributions, data and metrics, each result,
  further analyses) instead of deciding alone what to drop.
- **Logos and template.** Which logos go on the cover and on every slide? Look for the files in
  the project before asking. Is there an official template the deck must follow?
- **Language**, only when it is really open (see the rule below).

**Show the storyline first when the content is yours.** If the deck's content is your own
synthesis — a recommendation or a design worked out from notes or several documents — put the storyline in
that same message, one line per slide, and build after the user reacts. They have never seen
this content, so it is the most expensive thing to get wrong, and a list is cheaper to correct
than a deck. A deck that presents a finished document does not need this. And when the user
says they want to talk the content through first, stay in the conversation: give the analysis
in chat and build the file when they ask for it.

If you cannot ask (non-interactive run) or the user says to just proceed, build the shortest
deck that carries the argument — when in doubt, fewer slides; a clear short deck is easier to
extend than a long one is to cut — and list your assumptions in the delivery. Palette, layouts,
order and wording are yours to decide; don't ask about them.

**Language rule.** Write the deck — titles, body, labels inside charts and tables, legends,
speaker notes — in the language the user writes to you in, including when the source document is
in another language. Someone who asks in Indonesian for a deck from an English paper is going to
present in Indonesian. Keep as-is: established technical terms, identifiers and names from the
source (metric names, configuration names, product names). Format numbers the way that language
does (Indonesian: `0,822`, `1.155 token`). Ask about language only when there is a concrete
reason to doubt, such as an international venue.

## Time budget — hard limits

| Step | Budget | Stop rule |
|---|---|---|
| 0 Dependencies | 1 command | never repeated in a session |
| Ask | 1 message | open questions, plus the storyline when the content is yours |
| 1 Sources + facts | 1 read each | the whole document, once; image-heavy pages rendered once |
| 2 Storyline | 1–2 min per deck | one line per slide: message + visual + layout |
| 3–5 `deck.json` + notes | ~1–2 min per slide | fill fields; unknowns → placeholder + note |
| 6 Render + QA | 1 command | open the contact sheets, not single slides |
| Fix loop | **max 2 rounds** | batch all fixes, rerun once per round |
| 7 Deliver | a short list | no narration of the process |

Banned because they blow the budget: writing or forking pptxgenjs code per deck (one exception:
"If Node cannot be used" below); more than the one round of questions above; nudging coordinates;
re-rendering after each micro-edit; high-DPI QA; researching fonts or libraries mid-task.

## Workflow

### 0. Dependencies (once)

```bash
SKILL=<path to this skill folder>
ls $SKILL/scripts/deck.js $SKILL/reference/layouts.md $SKILL/example/deck.json
(cd $SKILL && node -e "require('pptxgenjs');require('sharp');require('react-icons/fa')" 2>/dev/null || npm install)
command -v soffice || command -v libreoffice || ls /Applications 2>/dev/null | grep -i powerpoint
```

- Node 18 or newer. The packages are installed once inside the skill folder and serve every
  project; `deck.js` also finds them in the project folder.
- The last line looks for something that can render slides for visual QA. LibreOffice works
  everywhere; on macOS PowerPoint works too (`reference/render-macos.md`). The contact sheets
  also need `pdftoppm` (poppler) and Pillow.
- No renderer → the deck is still built and linted, but nobody has seen it. Say that plainly in
  the delivery. Installing LibreOffice on a machine you do not own is the owner's decision: ask.
- Lint measures text with Arial or Liberation Sans font files. Without them it estimates, a
  little on the safe side.

### 1. Read the sources, list the facts and where each came from

- Give every document a role before reading closely. The **primary** document is what the
  deck presents. **Supporting** documents supply evidence, examples or background. A **style**
  document (a template, an earlier deck) only sets the look. With several documents, write one
  line for each — what it is, its date, its role, what the deck takes from it. The same lines
  tell the user afterwards what you used.
- Read each document whole. Caveats, limitations and the numbers that qualify the headline sit
  past the abstract.
- List the facts the deck will use. For each: the number with its unit **and the noun it
  counts**, its condition and uncertainty (n, interval, "at k = 5"), the qualifiers the authors
  attach — and its **origin**: the primary document, a supporting document, something the user
  said, outside knowledge you looked up, or your own inference.
- Only the first three origins are stated as fact on a slide, and a title never claims more
  than the source does. Outside knowledge goes on a slide only if the user wants it, with its
  source. An inference is worded as one on the slide ("our estimate") or stays off.
- Three checks, each for a mistake that is easy to make:
  - Re-read the sentence around every number to see what it counts. "12 branches serving 40
    districts" is not "40 branches".
  - Add up parts that should make a total. If the source lists 5, 4 and 3 branches by region,
    the deck says 12.
  - Do not sharpen the source. "To be inventoried" is not "none exists". A risk you anticipate
    is not a condition that exists today. A hedge ("preliminary", "difference not
    statistically resolvable") goes on the same slide as the claim.
- When a note can be read two ways, pick a reading and say which in the delivery, or ask.
- When two documents give different figures for the same thing, use the primary one and name
  the difference in the delivery.
- Choose one concrete example from the source and reuse it through the deck (one article of a
  statute, one customer, one transaction). Method, result and error slides then explain each other.
- Anything the sources do not contain — event name, date, quotations, example wording, names you
  would fill in from memory — is left out, shown as an obvious placeholder, or listed under
  "to verify" in the delivery. Never invent content silently; this covers text as much as figures.

**Supporting documents** (earlier decks, reports, catalogues, studies):

- Note what kind of document each one is. A report of work done is evidence that something
  happened; a proposal, a study or a kick-off deck is only a plan, and the slide says "planned".
- Take what the deck's argument needs, not everything that is interesting in the document.
- Text extraction (`scripts/pptx_text.py`) misses logos, diagrams and screenshots. Render
  those pages and look at them.
- Prices, budgets, internal performance figures and letter numbers do not travel into the new
  deck unless the user says so. An unflattering result is the user's call to show: name it in
  the delivery instead of deciding alone.

### 2. Storyline before layout

Read `reference/layouts.md` once. Then write the storyline as one line per slide:
**the message the slide proves** + **what the visual shows** + the layout from the
"content shape → layout" table.

- A slide title states the point ("Reporting time fell from 9 days to under 1"), not the topic
  ("Reporting time"). Exceptions: cover, closing.
- One message per slide. If a slide needs two layouts, it is two slides.
- **Substance test.** Each slide answers "what was done, built, found or decided here?" in one
  plain sentence. Slides that only organize — agenda, section dividers, "design principles",
  generic before/after tables — fail it. Drop them, unless the user asks for them or the deck is
  long enough that the audience would be lost without a signpost.
- **Show the thing itself.** Whatever the documents describe, the slide shows it rather than
  remarks on it. For a system or a product: how it works step by step, what it consists of,
  what its user sees. For a study: what was done to what, and what came out. For a report:
  what happened, how much, and what was decided. A benefit with no mechanism is a claim nobody
  can check: "performance is monitored" says nothing, while the six measures, what each one
  means and when it raises a warning says what exists.
- **One spine.** Find the structure the content really has — the steps of a process, the parts
  of a system, the stages of a chain — and reuse it. When two slides use the same stations
  (problem and answer, before and after, plan and result), the audience sees what corresponds
  to what, and the slides that follow already have their place. Closing lists such as next
  steps follow the same spine, one item per part, so nothing the deck opened is left hanging.
- **Leave undecided things undecided.** Dates, durations, prices and quantities that are in no
  document and that the user has not given are not yours to commit. Show phases without dates,
  and a quantity as "to be set". A date on a slide is read as a promise.
- **Shorter must not mean thinner.** Every conclusion the source draws stays, together with the
  method facts needed to trust it: what was varied and what was held fixed, the data, the
  metrics. To save time, merge slides or simplify visuals. If a main point really has to go,
  that is the user's call — ask.
- Take the order from the primary document and the occasion. Three shapes cover most decks;
  for any other (training, briefing, status update), keep the document's own order and apply
  the same tests.
  - *Presenting a paper, thesis or study:* cover → background → gap and contributions → the
    pipeline, marking the one thing that is varied → what was compared, on the running
    example → data and metrics → one finding per slide (claim title + one simple visual) →
    further analyses → limitations → conclusion and recommendation, which stays on screen
    for questions.
  - *Reporting on or summarizing documents:* cover → the answer in one slide → one topic or
    finding per slide, each with its evidence → what it means and what has to be decided →
    open questions.
  - *Proposing something:* cover → summary (condition → proposal → result) → the problem on
    the spine → the answer on the same spine → one or two slides per part, showing the thing
    itself → how the parts fit together → evidence from the supporting documents that it has
    been done before → phases → next steps.
- Before moving on, check the rhythm: no layout twice in a row, a dark or tinted slide at least
  every 3–4 slides, ≥ 60% distinct layouts. Rhythm comes from the tone and layout of content
  slides; never add a divider or a filler slide to satisfy it.

### 3. Choose each visual from the relationship it shows

| Relationship in the content | Draw it as | Not as |
|---|---|---|
| A contains B contains C (hierarchy, scope, taxonomy) | nested boxes or an indented tree | a row of boxes joined by arrows |
| A, then B, then C (process, pipeline, timeline) | boxes in order with arrows; every real connection drawn, including shared resources and feedback | a grid of cards |
| Options compared on the same attributes | aligned columns; the same example treated by each option | unrelated cards with different content |
| Trade-off between two quantities | scatter or two-axis chart showing both | a bar chart of one quantity with the other in a caption |
| Parts of a whole | doughnut or stacked bar whose parts add up | separate big numbers |
| Before → after, with or without a factor | paired bars, or a delta table with the meaningful cells marked | two charts on different scales |
| A results table in the source | the one comparison the slide is about, as 2–6 bars | the table itself, even with highlights or a color key |
| A pattern across many cells (which option fails on which measure) | a matrix of marks — filled dot / empty dot — with no numbers | a table or heat map of values |
| Something the user will see or operate (a screen, a ticket, a report) | an illustration of it with example data, labeled as an illustration | a list of features |
| The same stations seen twice (problem and answer, before and after) | the same row of stations on both slides, with only the rows beneath changed | two unrelated layouts |
| One concrete case | an annotated example taken from the source | an invented example |

Then hold every drawing to these:

- A mark means one thing throughout the deck: arrow = "then / feeds into", nesting = "contains",
  bracket = "one unit", length or position = a quantity. A mark that means nothing is removed.
- The drawing agrees with the text beside it. If the text says one window covers an article and
  parts of its neighbours, the drawn window covers exactly that.
- The chart contains the quantity named in the title. "Same recall on half the context" needs
  both recall and context in the picture.
- Plot only what the source reports. Don't add points to complete a curve.
- Each option keeps one color through the whole deck, and that color is not reused for another
  meaning (if gold is "method B" on one slide, it is not "with label" on the next).
- Any color or symbol code gets a key on the slide itself — the audience cannot see the notes.
- Example data in an illustration is labeled on the slide ("Illustration · example data"), agrees
  with itself (the parts add up to the total; the event on one screen is the same event on the
  next), and is listed in the delivery so nobody mistakes it for real data.
- A table is the last resort. A grid of numbers cannot be spoken: the presenter ends up reading
  cells aloud, and the audience reads ahead. The source's tables stay in the source. If a table
  is truly unavoidable, keep it small — a handful of rows, three or four columns — and make
  every cell something the presenter will say.

### 4. Write `deck.json`

```json
{ "brand": { "colors": { "primary": "1E2761", "accent": "F96167", "tint": "EEF2FA" } },
  "slides": [ { "id": "cover", "layout": "cover", "title": "…", "subtitle": "…", "notes": "…" }, … ] }
```

Fields per layout, and the `brand` block (colours, logos, footer): `reference/layouts.md`.
`example/deck.json` shows all 21 layouts in use.

**Plain words.** Wording is where a deck most often fails after its content is right. Before
rendering, read every title, label, sentence and note the way the audience will, and apply
these:

1. Write whole sentences: a subject and a verb, in the order a speaker of that language uses.
   Headline fragments that pack a thought into a noun phrase are the usual offender.
2. Use words people say. If you would not hear it in a meeting of this audience, replace it.
   Never coin a word or a construction to save space.
3. Every term is either the audience's own or is explained in plain words on that slide the
   first time it appears. An abbreviation gets its function ("DCS = the plant's control system").
4. One name per thing through the whole deck. Don't alternate "site", "location" and "facility".
5. One idea per sentence. Read each title aloud; if it sounds translated or needs a second
   reading, rewrite it.

| Hard to follow | What is wrong | Plain |
|---|---|---|
| "Compatibility as prerequisite" | headline fragment: who must do what? | "The new system must work with the ones already installed" |
| "Performance comparably benchmarked" | coined construction | "Every site can be compared using the same measures" |
| "Tare is checked against master tare" | trade jargon for a management audience | "The empty truck's weight is checked against its recorded empty weight" |
| "Cutting by section retrieves equally well" | invented wording for an expert audience | "Recall@5 of section-level chunks matches sliding windows, with less than half the context" |
| "The 95% CI excludes zero" | statistical shorthand | "The drop is larger than sampling noise would explain" |

These are examples of a principle, not a word list. The same rules hold in any language; the
examples are in English only so that everyone can read them.

- **Match the vocabulary to the audience** — the two directions fail differently. For peers and
  examiners (seminar, conference, thesis defense), keep the field's standard terms and the
  source's own names exactly as the presenter says them — chunk, sliding window, metadata,
  Recall@5, a configuration's name — define each once, and do not coin translations: a
  home-made equivalent of "chunk" in the deck's language is stranger to this audience than the
  term itself. For non-specialists (clients, management), lead with the plain equivalent
  ("empty truck weight" for tare, "warning" for alarm, "digital delivery note" for e-manifest)
  and give the original term once if they will meet it again.
- Numbers follow the same rule: for peers, the values as the source prints them (0,822), so the
  presenter recognizes them; for non-specialists, the spoken form (82%).
- Say what every figure refers to. Each chart and each number names its condition on the slide
  itself, not only in the notes: which configuration, which setting (k, with or without
  metadata), which data (baseline or expanded corpus). A number borrowed from prior work
  carries its source on the slide, so nobody takes it for the deck's own result.
- Keep bodies short: a card body is one line of thought (≤ ~90 chars); bullets ≤ 5 per block.
  Long source text is summarized, not shrunk; the detail moves to the notes. Most languages run
  longer than English, so shorten further rather than letting titles wrap into the content.
  Short still means a whole sentence — cut ideas, not grammar.
- Numbers you do not have → obvious placeholders ("[amount]", "[n]") and a `source` note
  ("Example — replace with real data"). Lint lists every bracketed placeholder it finds.
- Numbers in text boxes and tables are literal strings: write them in the deck language's format.
  Chart data labels are drawn by PowerPoint in the viewer's locale and may differ.
- Icons by meaning (react-icons names).
- Logos are real files: list them in `brand.logos`, name the one for every slide in
  `brand.header`, and the ones for the cover in its `logos`. A logo drawn for a white
  background gets a light plate on dark slides automatically. Without a logo file the
  renderer prints `brand.name` as text; say so in the delivery.
- If `brand.json` exists in the project, omit `brand`.

### 5. Speaker notes are the narration

Every slide has `notes`, written as what the presenter says, in the deck language and under
the same plain-words rules. The renderer writes them as real speaker notes and refuses a slide
that has none.

- Follow the order the eye travels across the slide, and say where to look ("the chart on the
  right", "the gold row").
- Explain how to read an encoding before giving the conclusion: what the axes are, what a color
  or an asterisk means.
- End with the "so what", which also sets up the next slide.
- Write sentences the presenter can read aloud as they stand: short, spoken, no symbols or
  bracketed intervals.
- Length matches the time the slide gets — about a minute for a content slide, two or three
  sentences for a cover.
- If explaining how to read a visual takes more than two sentences, the visual is too complex.
  Simplify the visual; don't lengthen the notes.

**Narration test.** For every element on the slide — each box, arrow, number, color, icon,
caption — the notes contain a sentence that uses it. If you cannot write that sentence, the
element goes. This is what removes decorative motifs, orphan statistics and icons that mean nothing.

### 6. Render + QA (one command, four passes)

```bash
bash $SKILL/scripts/qa.sh deck.json out/<name>-v1.pptx
```

1. **Lint.** Errors print with the slide and say what to do ("shorten it by about 30
   characters", "holds 6 at most") and stop the build. Fix all of them in `deck.json`, rerun
   once. Cut an idea rather than grammar; split a slide rather than shrink it. The list of
   lint messages is in `reference/layouts.md`. Lint also prints the placeholders it found,
   which go into the delivery.
2. **File health.** The file opens in PowerPoint without a repair prompt and exports to PDF.
   An export that reports success but leaves no PDF means some element is invalid, and charts
   are the first suspect: run once with `--no-charts` to confirm. A deck the user cannot
   export is broken even if it looks fine on screen. Without a renderer on the machine,
   `qa.sh` says so; repeat that sentence in the delivery instead of implying the deck was seen.
3. **Layout**, on `out/qa/sheet-N.jpg` (6 slides per image), in this order: clipped text →
   overlaps → big empty areas (content too thin for the layout — pick a denser one or merge
   slides) → contrast, including logos on dark slides.
4. **Meaning**, slide by slide against the fact list. Lint cannot check this; you do.
   - Read the titles alone, in order. Do they tell the whole argument? A title that could sit
     on any deck ("Hasil", "Pembahasan") is a topic, not a point.
   - Does every slide pass the substance test, and is every main point of the source still in
     the deck? Is any grid of numbers left?
   - Does the visual show what the title claims? Does every arrow, nesting, bracket and bar
     agree with the source and with the text beside it?
   - Does every element pass the narration test, and can the slide be presented in about a
     minute from its notes?
   - Would this audience use these words themselves — whole sentences, no coined terms, no
     undefined jargon for laypeople, no invented translations for experts, one name per thing?
   - Is every number the source's, on the noun the source puts it on, in the deck language's
     format, with its qualifier? Is every inference worded as one?
   - Does each chart state its condition (configuration, setting, data), and does each
     borrowed number carry its source? Is example data labeled and consistent with itself?
   - Are color and symbol codes explained on the slide, with one meaning per color?
   - Is everything inside the scope, with no date, price or quantity the user did not give?

Batch layout and meaning fixes for the whole deck and rerun once. Two rounds maximum. A diagram
that misstates the content is not cosmetic — fix it within the rounds; only cosmetic leftovers go
into the summary.

### 7. Deliver

`out/<name>-v1.pptx` plus a short list in the user's language:

- slide count and sections, and which documents they draw on, in a line or two;
- placeholders to replace (numbers, logos, contacts, event name);
- content to verify, with its origin: anything that came from outside the sources, any
  inference, any note you read one of two ways;
- example data used in illustrations;
- anything you left out on purpose that the user may want back (an unflattering result, a
  detail outside the scope);
- whether visual QA ran, and how to revise ("edit `deck.json`, rerun `bash <skill>/scripts/qa.sh`").

Each later round is a new file (`-v2`, `-v3`). Never overwrite a delivered deck: the user
compares versions, and may have edited the one they hold.

## Revisions

- **First, has the user edited the delivered file?** Compare it with your last build — the
  time stamp, then the slide text (`scripts/pptx_text.py` on both). Mirror their edits into the
  source before rebuilding; otherwise the rebuild quietly undoes their work.
- **Examples followed by "etc." name a class, not a list.** Three sentences quoted as hard to
  understand mean every text on every slide and in every note gets the same pass. Report the
  class with two or three before → after pairs, not a line per change. The same holds when the
  user quotes one phrase and then says what they meant: fix the approach, not the phrase.
- Feedback that names no slide ("the illustrations are still wrong", "too crowded") → re-run the
  matching QA pass over every slide instead of guessing one.
- "Too many slides", "I can't present this", "I don't see the substance" → first confirm the
  duration and the points that must stay, then go back to the storyline and rebuild: substance
  test, the thing itself, one simple visual per finding, no number grids. Cutting to a guessed
  length drops points the presenter needs; trimming slide by slide keeps the problem.
- "The language is hard to understand" → check who the audience is first, because the fix runs
  in opposite directions (step 4), then redo the plain-words pass on everything, notes included.
- "I'm confused by slide N", "where does this number come from?" → explain the content, with
  one worked example traced back to the data, and say so if your recount differs from what is
  written. Change no slide until asked: the presenter has to defend the number, not admire a
  new layout.
- A corrected fact (a name, a number) → search for it and replace it everywhere, slides and notes.
- A question about the documents or the deck ("can we use anything from these?", "why is this
  in here?") → answer it first, plainly. Then correct what the answer shows to be wrong, and
  rebuild the deck only when asked.
- A language change is a rebuild: translate `deck.json` including notes, labels and legends, then
  run a full QA round — text lengths change everywhere.
- Change the source file and rerun. Never patch the .pptx by hand; the next rebuild loses the fix.

## When no layout fits

First compose from existing layouts, as long as the relationship survives: a 2×2 matrix as
`icon-grid` with 4 items keeps its meaning, a funnel as `process` does, pricing tiers as
`comparison` do. A containment hierarchy forced into `process` does not; use `nested`.

Add **one** generic layout to `scripts/deck.js` when a content shape recurs across decks, or
when the only alternative is a layout that misstates the relationship. How to add one, and the
helpers to build it from, are at the end of `reference/layouts.md`. Shapes still missing: a
two-quantity trade-off as a scatter with labelled points, the same example cut several ways
(rows with brackets), a pipeline with a cross-row connector. Never fork the script per deck.

pptxgenjs rules for that case: hex without `#`; never share an options object between two
`add*` calls; `rectRadius` only on `roundRect`; `margin: 0` on text aligned to shapes; bullets
via `bullet: true` + `breakLine`, never a literal "•"; speaker notes via `slide.addNotes(text)`,
never a text box; connectors are line shapes with `dashType` / `endArrowType`; a chart's
`lineDash` is one string for all series — an array produces a file PowerPoint opens but
cannot export. After adding a layout, render `example/deck.json` and export it to PDF.

## If Node cannot be used

`deck.js` needs Node and its packages. On a machine where they cannot be installed, say so in
one line and write the deck another way the machine supports, keeping everything else in this
skill: the questions, the fact list, the storyline, visuals chosen by relationship, plain
words, notes on every slide, the QA passes. Do not hand-write pptxgenjs per deck when `deck.js`
is available; that is slower and loses the lint.

## Bundled files

- `scripts/deck.js <deck.json> <out.pptx> [--force] [--no-charts]` — the renderer and its lint.
- `scripts/qa.sh <deck.json> <out.pptx>` — build, render to PDF, contact sheets.
- `reference/layouts.md` — every layout and its fields, the lint messages, how to add a layout.
- `example/deck.json` — a 21-slide deck that uses every layout; render it to see them.
- `scripts/pptx_text.py <deck.pptx> [--diff other.pptx]` — slide text of any .pptx, for reading
  reference decks and for comparing a file the user edited with your last build.
- `scripts/contact_sheet.py <deck.pdf> <out-dir>` — pages to JPG, six per sheet.
- `scripts/export_pdf_mac.sh`, `reference/render-macos.md` — PowerPoint export on macOS
  without LibreOffice, and what its failure signs mean.

## Scope

- New decks from a brief, outline, notes, or an attached document → this skill.
- "Make this slide image editable" → `image-to-pptx` (rebuild, not redesign).
- A deck that already exists as .pptx and only needs text edits → edit that file directly.
