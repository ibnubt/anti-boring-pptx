# anti-boring-pptx

This repository holds `pptx-varied-deck`, a skill that lets an AI agent turn reference documents
into a PowerPoint deck that a person can stand up and present. You hand over a paper, a report, meeting notes or earlier decks; the
agent asks a few questions, writes one `deck.json`, and renders a fully editable `.pptx` with
speaker notes on every slide.

> **Note: best used with Claude.** This skill is written for Claude (Claude Code, the Claude
> apps, the Claude Agent SDK) and has only been tried with Claude. Other agents can read
> `SKILL.md` and run the scripts, but the instructions are tuned for how Claude works.

## What it guards against

| A deck fails when it… | The skill's check |
|---|---|
| says nothing: agenda, dividers, benefits with no mechanism | substance test on every slide |
| says what the documents do not | a fact list that records where each fact came from |
| uses words the audience would not | a plain-words pass, different for experts and for laypeople |
| draws the wrong picture | the visual is chosen from the relationship it shows |
| cannot be presented: number grids, decoration | a narration test, and lint in the renderer |

## What is in the folder

| Path | What it is |
|---|---|
| `SKILL.md` | the instructions the agent follows |
| `scripts/deck.js` | the renderer: `deck.json` in, `.pptx` out, with lint (21 layouts) |
| `scripts/qa.sh` | build, render to PDF, and tile contact sheets for a visual check |
| `reference/layouts.md` | every layout and its fields, lint messages, how to add a layout |
| `example/deck.json` | a 21-slide deck that uses every layout |
| `scripts/pptx_text.py` | text of any `.pptx`; `--diff` compares two decks |
| `scripts/contact_sheet.py` | PDF pages to JPG, six per sheet |
| `scripts/export_pdf_mac.sh`, `reference/render-macos.md` | PowerPoint export on macOS without LibreOffice |
| `skills/chatgpt-illustration-sheet/` | a companion skill for the deck's illustrations, see below |

## Companion skill: illustrations drawn by ChatGPT

`skills/chatgpt-illustration-sheet` makes a consistent set of 3D illustrations for a deck. It writes
one prompt that asks ChatGPT for a sheet of several illustrations at once (6 by default, up to 9),
so one generation gives a whole family in one style. The person pastes the prompt into ChatGPT and
saves the image; the skill then cuts the sheet into one transparent PNG per illustration, records
each in a `library.json` for reuse, and saves a preview on a light and a blue card.

It is a separate skill, so it is installed on its own, next to `pptx-varied-deck`:

```bash
cp -R ~/.claude/skills/pptx-varied-deck/skills/chatgpt-illustration-sheet ~/.claude/skills/
```

It needs Python 3 with Pillow and numpy. Nothing in it calls an image API.

## Requirements

- Node 18 or newer.
- For the visual check: LibreOffice (any system) or Microsoft PowerPoint (macOS), plus
  `pdftoppm` from poppler and Python 3 with Pillow. Without these the deck is still built and
  linted, and the agent says that nobody has looked at it.

## Install

For Claude Code, put the folder where Claude looks for skills and install the packages once:

```bash
git clone https://github.com/ibnubt/anti-boring-pptx.git ~/.claude/skills/pptx-varied-deck
cd ~/.claude/skills/pptx-varied-deck && npm install
```

The folder keeps the skill's own name, `pptx-varied-deck`, whatever the repository is called.
Use a project's `.claude/skills/` folder instead to share the skill with that project only.
In the Claude apps, upload the folder as a zip where custom skills are managed.

## Try it

```bash
node scripts/deck.js example/deck.json /tmp/example.pptx
bash scripts/qa.sh example/deck.json /tmp/example-qa/example-v1.pptx
```

The first command prints the lint result and writes the deck. The second also renders it and
writes `sheet-N.jpg` contact sheets next to it. The example is in Indonesian; a deck is always
written in the language of the person who asks for it.

## Use it

Ask Claude for a deck and point it at the documents:

> Make a deck from this report for a 15-minute management briefing.

Claude asks what it cannot derive (which documents, how long, for whom, which logos), then
builds the deck. Each revision is a new file (`-v2`, `-v3`), so earlier versions stay.

## Licence

MIT, see `LICENSE`. The packages it installs keep their own licences: pptxgenjs, React,
react-icons and opentype.js are MIT, sharp is Apache-2.0, and the icons that react-icons
bundles carry the licences of their icon sets.

## Ringkasan (Bahasa Indonesia)

Skill ini membuat agen AI menyusun PowerPoint dari dokumen referensi: makalah, laporan,
notulen, atau deck lama. Hasilnya berkas `.pptx` yang bisa disunting, dengan catatan penyaji di
tiap slide. Skill ini ditulis untuk Claude dan paling baik dipakai dengan Claude. Cara pasang
dan cara mencoba ada di atas.
