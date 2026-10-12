#!/usr/bin/env bash
# Build a deck from deck.json, then render it for visual QA.
#
#   bash qa.sh <deck.json> <out.pptx> [--force] [--no-charts]
#
# 1. node deck.js     lint + write the .pptx (stops here on lint errors)
# 2. render to PDF    LibreOffice if present, else PowerPoint on macOS
# 3. contact sheets   <out-dir>/qa/sheet-N.jpg, six slides each
#
# Without a renderer the deck is still written; the script says clearly that it was not
# checked visually, and that sentence belongs in the delivery.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ $# -ge 2 ] || { echo "usage: bash qa.sh <deck.json> <out.pptx> [--force] [--no-charts]"; exit 2; }
JSON="$1"; OUT="$2"; shift 2
node "$HERE/deck.js" "$JSON" "$OUT" "$@" || exit 1

QA="$(cd "$(dirname "$OUT")" && pwd)/qa"; mkdir -p "$QA"
NAME="$(basename "${OUT%.pptx}")"; PDF="$QA/$NAME.pdf"
[ -f "$PDF" ] && rm -f "$PDF"

SOFFICE=""
command -v soffice >/dev/null 2>&1 && SOFFICE="soffice"
[ -z "$SOFFICE" ] && command -v libreoffice >/dev/null 2>&1 && SOFFICE="libreoffice"
[ -z "$SOFFICE" ] && [ -x /Applications/LibreOffice.app/Contents/MacOS/soffice ] && SOFFICE="/Applications/LibreOffice.app/Contents/MacOS/soffice"

if [ -n "$SOFFICE" ]; then
  "$SOFFICE" --headless --convert-to pdf --outdir "$QA" "$OUT" >/dev/null 2>&1
  # Some servers run without a writable home folder; give LibreOffice a profile of its own.
  [ -f "$PDF" ] || "$SOFFICE" "-env:UserInstallation=file://${TMPDIR:-/tmp}/lo_profile_$$" --headless --convert-to pdf --outdir "$QA" "$OUT" >/dev/null 2>&1
elif [ "$(uname)" = "Darwin" ] && [ -d "/Applications/Microsoft PowerPoint.app" ]; then
  zsh "$HERE/export_pdf_mac.sh" "$OUT" "$PDF"
else
  echo "QA: no renderer on this machine (LibreOffice or PowerPoint). The deck passed lint but was NOT checked visually."
  exit 0
fi
if [ ! -f "$PDF" ]; then
  echo "QA: render failed, no PDF. If lint passed, some element cannot be exported: run again with --no-charts to test the charts."
  exit 3
fi
if command -v pdftoppm >/dev/null 2>&1 && python3 -c "import PIL" >/dev/null 2>&1; then
  python3 "$HERE/contact_sheet.py" "$PDF" "$QA"
else
  echo "QA: PDF written to $PDF. Install poppler (pdftoppm) and Pillow to get contact sheets."
fi
