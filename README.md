# anti-boring-pptx

This repository holds `pptx-varied-deck`, a skill that lets an AI agent turn reference documents
into a PowerPoint deck for any purpose: a monthly or project report, a status update, a summary,
a briefing, a study talk, training material or a proposal, presented or sent to be read. You hand
over reports, papers, notes, spreadsheets or earlier decks; the agent takes stock of everything
in them (outline, tables, chart data, pictures), asks a few questions, writes one `deck.json`,
and renders a fully editable `.pptx` with speaker notes on every slide.

> **Note: best used with Claude.** This skill is written for Claude (Claude Code, the Claude
> apps, the Claude Agent SDK) and has only been tried with Claude. Other agents can read
> `SKILL.md` and run the scripts, but the instructions are tuned for how Claude works.

## What it guards against

| A deck fails when it… | The skill's check |
|---|---|
| says nothing: agenda, dividers, benefits with no mechanism | substance test on every slide |
| leaves out what the documents hold | the documents' outline becomes a coverage list; the renderer refuses a deck that drops a part silently |
| says what the documents do not | a fact list that records where each fact came from |
| uses words the audience would not | a plain-words pass, different for experts and for laypeople |
| draws the wrong picture | the visual is chosen from the relationship it shows |
| cannot be presented: number grids, decoration | a narration test, and lint in the renderer |
| wastes or pastes the documents' material | tables come over as native tables, chart data as native charts, photos and screenshots are reused, diagrams rebuilt, maps and drawings shown whole |
| is monotonous: the same frame, the same density, the same white background, slide after slide | one focal element per slide, a word budget, a planned rhythm of five kinds of slide (statement, picture, data, drawing, text) and of tones, checked by lint |
| leaves empty space | the focal element grows into the room, and lint measures the largest empty area of every slide |

## What is in the folder

| Path | What it is |
|---|---|
| `SKILL.md` | the instructions the agent follows |
| `scripts/deck.js` | the renderer: `deck.json` in, `.pptx` out, with lint (44 layouts; looks `bento`, `editorial`, `bold`) |
| `scripts/extract_content.py` | outline, tables and chart data of a PDF, DOCX, PPTX, XLSX or Markdown file |
| `scripts/qa.sh` | build, render to PDF, and tile contact sheets for a visual check |
| `reference/layouts.md` | every layout, its kind and fields, lint messages, how to add a layout |
| `reference/design.md` | why decks turn monotonous, the rhythm, the focal element, picture treatments, plain words |
| `reference/sources.md` | extraction, coverage, the fact list, what to do with each table, chart and picture |
| `example/deck.json` | a 28-slide pilot deck, told as a proposal |
| `example/report.json` | a 10-slide monthly report: summary, dashboard, status, a source figure, a two-slide table |
| `example/proposal.json` | a 17-slide proposal in six parts, each opened by a section slide: summary tiles, price options, a week-by-week schedule, a separate thank-you slide |
| `scripts/pptx_text.py` | text of any `.pptx`; `--diff` compares two decks |
| `scripts/contact_sheet.py` | PDF pages to JPG, six per sheet |
| `scripts/extract_images.py` | the pictures inside a PDF, PPTX or DOCX, with where each appears |
| `scripts/crop_image.py` | keep the part of a picture a slide needs |
| `scripts/export_pdf_mac.sh`, `reference/render-macos.md` | PowerPoint export on macOS without LibreOffice |

## Requirements

- Node 18 or newer.
- Python 3 for the extraction scripts, with PyMuPDF for PDF and openpyxl for XLSX
  (`pip install pymupdf openpyxl`); DOCX and PPTX need nothing extra.
- For the visual check: LibreOffice (any system) or Microsoft PowerPoint (macOS), plus
  `pdftoppm` from poppler and Python 3 with Pillow. Taking pictures out of a PDF uses
  `pdfimages`, also from poppler. Without these the deck is still built and
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
node scripts/deck.js example/report.json /tmp/report.pptx
bash scripts/qa.sh example/proposal.json /tmp/proposal-qa/proposal-v1.pptx
bash scripts/qa.sh example/deck.json /tmp/example-qa/example-v1.pptx
python3 scripts/extract_content.py some-report.pdf /tmp/some-report
```

The first command prints the lint result and writes the deck. The second also renders it and
writes `sheet-N.jpg` contact sheets next to it. The third lists what a document holds. The example is in Indonesian; a deck is always
written in the language of the person who asks for it.

## Use it

Ask Claude for a deck and point it at the documents:

> Make a deck from this report for a 15-minute management briefing.
>
> Turn the September operations report and its spreadsheet into the monthly review deck.

Claude asks what it cannot derive (which documents, how long, for whom, which logos), then
builds the deck. Each revision is a new file (`-v2`, `-v3`), so earlier versions stay.

## Licence

MIT, see `LICENSE`. The packages it installs keep their own licences: pptxgenjs, React,
react-icons and opentype.js are MIT, sharp is Apache-2.0, and the icons that react-icons
bundles carry the licences of their icon sets.

## Ringkasan (Bahasa Indonesia)

Skill ini membuat agen AI menyusun PowerPoint dari dokumen referensi untuk keperluan apa pun:
laporan bulanan atau proyek, status pekerjaan, ringkasan, paparan kajian, materi pelatihan, atau
usulan. Seluruh isi dokumen dibawa: tiap bagian dicek masuk slide, tabel dan data grafik dipakai
ulang secara native, gambar dipakai ulang. Slide diisi tanpa ruang kosong, dan layoutnya
bervariasi agar tidak terlihat seperti buatan AI. Hasilnya berkas `.pptx` yang bisa disunting,
dengan catatan penyaji di tiap slide. Tampilan default `bento`: slide putih, kartu abu-abu
bersudut bulat, satu warna biru, logo di kanan atas, tanpa nomor halaman. Proposal disusun per
bagian (Executive Summary, Masalah, Solusi, Arsitektur, Harga, Implementasi), tiap bagian dibuka
satu slide pembatas, dan ditutup slide terima kasih tersendiri. Skill ini ditulis untuk Claude dan paling baik dipakai dengan Claude. Cara pasang
dan cara mencoba ada di atas.
