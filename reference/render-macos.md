# Rendering a deck on macOS without LibreOffice

Read this when `soffice` is missing and Microsoft PowerPoint is installed. It explains how to
get slide images for visual QA, and what the failure signs mean. The signs do not explain
themselves, so each one is listed with its cause.

## The path that works

```bash
bash $SKILL/scripts/export_pdf_mac.sh out/deck-v1.pptx out/qa/deck.pdf
python3 $SKILL/scripts/contact_sheet.py out/qa/deck.pdf out/qa
```

Then open `out/qa/sheet-N.jpg`. A 20-slide deck exports in a few seconds.

Why the script copies the deck into `~/Library/Containers/com.microsoft.Powerpoint/Data/`:
PowerPoint is sandboxed. It can always read and write inside its own container, but a save to
any other folder may silently wait for a permission dialog nobody sees. The copy has a unique
name on every run, because a name left over from a failed run can stay blocked.

## Failure signs

| What you see | What it means | What to do |
|---|---|---|
| Script prints `pdf ok` | Export worked | Carry on |
| PowerPoint says `ok` but there is no PDF | The deck has an element PowerPoint can open but cannot export. This is a defect in the deck, not a sandbox problem | Build once with the charts switched off. If that exports, a chart option is invalid (seen: `lineDash` given as an array in pptxgenjs 4, which writes `prstDash val="solid,dash"`). Fix the option, rebuild |
| Error `-9074` on `open` | PowerPoint is holding a hidden dialog from an earlier failed export, so every later open fails, including decks that are fine | Rerun with `--restart` |
| `quit` returns `-128` (user cancelled) | Same hidden dialog | Rerun with `--restart` |
| Exit code 4 | `--restart` was refused because presentations are open | Tell the user; do not kill PowerPoint yourself |

## Rules that protect the user's work

- Never close or kill PowerPoint while the user has presentations open. They often keep the
  delivered deck open and edit it. The script checks this before `--restart`; do not bypass it
  with your own `pkill`.
- If you did restart PowerPoint, say so in the delivery.
- After a restart, PowerPoint needs several seconds before it accepts `open`; the script waits.

## When nothing renders

`qlmanage -t -s 2200 -o <dir> deck.pptx` gives a picture of slide 1 only, without charts and
with substituted fonts. It is good for a rough layout look, nothing more. If that is all you
have, deliver the deck and say plainly that it was not checked visually.

## Reading someone else's deck

`python3 -I $SKILL/scripts/pptx_text.py other.pptx` gives the text of every slide and the
number of pictures on it. A slide with many pictures and little text (client logos, an
architecture drawing, a dashboard screenshot) has to be rendered with the two commands above
and looked at; its content is not in the text.
