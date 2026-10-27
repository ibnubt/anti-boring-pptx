# Sources — taking stock of the documents and using what they hold

Read this in step 1 when the deck is built from documents. SKILL.md has the short version.

Contents: roles · the two extraction commands · coverage · the fact list · supporting documents ·
what to do with each table, chart and picture

## Roles

Give every document a role before reading closely. The **primary** document is what the deck
presents. **Supporting** documents supply evidence, examples or background. A **style** document
(a template, an earlier deck) only sets the look. With several documents, write one line for each
— what it is, its date, its role, what the deck takes from it. The same lines tell the user
afterwards what you used.

## Two extraction commands per document

```bash
python3 $SKILL/scripts/extract_content.py <document> <project>/assets/<doc-key>
python3 $SKILL/scripts/extract_images.py  <document> <project>/assets/<doc-key>/pictures [--pages]
```

- `extract_content.py` (PDF, DOCX, PPTX, XLSX, Markdown) writes the **outline** (`outline.md`,
  `outline.json`: every heading, slide or sheet with its words, tables, charts and pictures), the
  **tables** (`tables/T01.json`, ready for the `table` layout) and the **data of native charts**
  (`charts/C01.json`, ready for `chart`), plus `index.md` listing them.
- `extract_images.py` writes the pictures with the page or slide each one is on (`index.tsv`) and
  contact sheets (`images-N.jpg`) to look at them. `--pages` also renders whole pages, for a
  figure that is not available as a picture of its own.
- Read `outline.md`, `index.md` and the contact sheets once, then read the document itself whole:
  caveats, limitations and the numbers that qualify the headline sit past the summary.

## Coverage

The outline is the list of what the deck must carry. In `deck.json`, `meta.coverage` points at it
(`"assets/report/outline.json"`, or `{ "report": "…/outline.json", "notes": "…" }` for several
documents, whose ids become `key:id`). Every slide lists the parts it carries in `"covers"`; a
part left out on purpose goes into `meta.omit` with the reason. The renderer refuses a deck that
leaves a part with substance (40 words or more, or a table, chart or picture) neither covered nor
explained.

- Parts are merged freely — one slide may carry three short sections — but none disappears.
- Naming a parent part covers all its children. Name the parts a slide really carries; a cover
  slide names none.
- A document without headings (meeting notes, an email, a brief) gets its coverage list from the
  fact list, written inline: `"coverage": [{ "id": "F1", "title": "…" }, …]`.
- Covering a part does not mean putting all of its words on a slide. The slide shows the part's
  point; the rest of what the part says goes into the notes or an appendix slide.

## The fact list

For each fact the deck uses: the number with its unit **and the noun it counts**, its condition
and uncertainty (n, interval, "at k = 5"), the qualifiers the authors attach — and its **origin**:
the primary document, a supporting document, something the user said, outside knowledge you looked
up, or your own inference.

- Only the first three origins are stated as fact on a slide, and a title never claims more than
  the source does. Outside knowledge goes on a slide only if the user wants it, with its source.
  An inference is worded as one ("our estimate") or stays off.
- Re-read the sentence around every number to see what it counts. "12 branches serving 40
  districts" is not "40 branches".
- Add up parts that should make a total. If the source lists 5, 4 and 3 branches by region, the
  deck says 12.
- Do not sharpen the source. "To be inventoried" is not "none exists". A risk you anticipate is
  not a condition that exists today. A hedge ("preliminary", "not statistically resolvable") goes
  on the same slide as the claim.
- When a note can be read two ways, pick a reading and say which in the delivery, or ask. When
  two documents give different figures for the same thing, use the primary one and name the
  difference in the delivery.
- Anything the sources do not contain — event name, date, quotations, names you would fill in
  from memory — is left out, shown as an obvious placeholder, or listed under "to verify".

## Supporting documents

- A report of work done is evidence that something happened; a proposal, a study or a kick-off
  deck is only a plan, and the slide says "planned".
- Take what the deck's argument needs, not everything interesting in the document; their coverage
  is what the deck uses from them, not every section.
- Prices, budgets, internal performance figures and letter numbers do not travel into the new deck
  unless the user says so. An unflattering result is the user's call to show: name it in the
  delivery instead of deciding alone.
- When the deck presents another party's solution as the user's own offer (a reseller or a prime
  contractor), write it as the user's offer: no "our partner", no third-party branding. A past
  project the user did not carry out is not claimed as theirs.

## What to do with each table, chart and picture

For each, note what it shows, where it is (page or slide) and a decision. Reused material goes into
the fact list with its origin, like numbers.

- **A table** goes onto a slide as a native `table` from its `T01.json`. Compare it with the page
  first: extraction from PDF can split a row in two, shift a cell or add empty columns; fix those
  in `deck.json`. Keep the columns the slide is about (eight at most) and the source's numbers and
  units exactly; a long table continues on the next slides by itself. A picture of a table is
  still a table: retype it. In a deck that is spoken over, show the one comparison the slide is
  about as a chart and keep the full table in an appendix.
- **A native chart** (PPTX, DOCX, XLSX) is rebuilt as a native `chart` from its `C01.json`, with
  the source's numbers, in the deck's colours, with its condition written on the slide. Never paste
  a picture of a chart whose data you have.
- **A photo or a real screenshot** of something a slide talks about is **reused**, **cropped** to
  the part that matters (`crop_image.py --box`, `--trim`), or **cut out** when it is a product on a
  plain background (`crop_image.py --cutout`; check it on a dark and a light background).
- **A diagram, a flow, a topology** — anything made of boxes, arrows and labels — is **rebuilt**
  with the deck's layouts (`diagram`, `process`, `nested`), in the deck's words and colours, with
  the source's photos of the parts in its nodes. A pasted diagram brings another document's fonts,
  colours, language and logo and cannot be edited.
- **A figure that cannot be redrawn** — a map, a site plan, an engineering drawing, a scanned or
  signed page, a Gantt chart from a planning tool, a chart whose data is not available — is shown
  whole in `figure`, as large as the slide allows, with its source.
- **A sentence worth quoting** (a finding, a definition, a decision, a customer's words) is quoted
  exactly in `quote` or `statement`, with who said or wrote it.
- **Skip** decoration and stock photos, the author's certificates and logos, and anything that
  contradicts the deck: another customer's or site's name, an older version, prices, personal
  data. Check what is visible inside each picture too: crop away another customer's name, or draw
  that screen yourself (`screen`) and keep the photo for what it shows well.
- **Training decks** that show how a tool is used take their screens from a real session, captured
  step by step with the same inputs the participants will use, rather than illustrations of the
  screen. The steps that matter most are the turns: a request refused and another way found, an
  error fixed, a gate approved, the result opened.
