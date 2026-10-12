#!/bin/zsh
# Export a .pptx to PDF with Microsoft PowerPoint on macOS (for machines without LibreOffice).
#
#   export_pdf_mac.sh <deck.pptx> <out.pdf> [--restart]
#
# PowerPoint is sandboxed: it can always read and write inside its own container, so the deck
# is copied there under a unique name, exported there, and the PDF is copied back out.
# Presentations the user has open are left alone.
#
# Exit codes: 0 PDF written · 1 PowerPoint reported no error but wrote no PDF (the deck has
# invalid content; see reference/render-macos.md) · 2 usage · 3 PowerPoint not found ·
# 4 --restart refused because presentations are open.
set -u
[ $# -ge 2 ] || { echo "usage: export_pdf_mac.sh <deck.pptx> <out.pdf> [--restart]"; exit 2; }
[ -f "$1" ] || { echo "not found: $1"; exit 2; }
SRC="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
mkdir -p "$(dirname "$2")"
DST="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
BOX="$HOME/Library/Containers/com.microsoft.Powerpoint"
[ -d "$BOX" ] || { echo "Microsoft PowerPoint container not found; is PowerPoint installed?"; exit 3; }
TMP="$BOX/Data/tmp_qa"; mkdir -p "$TMP"

if [ "${3:-}" = "--restart" ]; then
  # Restarting closes whatever is open. Only do it when nothing is open.
  N=$(osascript -e 'tell application "Microsoft PowerPoint" to count of presentations' 2>/dev/null || echo "?")
  if [ "$N" != "0" ]; then
    echo "PowerPoint has $N presentation(s) open. Not restarting it: ask the user to save and close them, then retry."
    exit 4
  fi
  pkill -x "Microsoft PowerPoint"; sleep 4
  osascript -e 'tell application "Microsoft PowerPoint" to launch' >/dev/null 2>&1; sleep 8
fi

ID="q$(date +%H%M%S)$$"
cp "$SRC" "$TMP/$ID.pptx"
OUT=$(osascript 2>&1 <<OSA
with timeout of 300 seconds
  tell application "Microsoft PowerPoint"
    open POSIX file "$TMP/$ID.pptx"
    delay 1
    set d to presentation "$ID.pptx"
    save d in POSIX file "$TMP/$ID.pdf" as save as PDF
    delay 3
    close d saving no
    return "ok"
  end tell
end timeout
OSA
)
RC=1
if [ -f "$TMP/$ID.pdf" ]; then
  cp "$TMP/$ID.pdf" "$DST"; echo "pdf ok: $DST"; RC=0
else
  echo "no PDF (PowerPoint said: $OUT)"
  echo "If it said ok, the deck has an element PowerPoint cannot export; chart options are the first suspect."
  echo "If it said -9074, PowerPoint is holding a dialog from an earlier failure; retry with --restart."
fi
rm -f "$TMP/$ID.pdf" "$TMP/$ID.pptx"
exit $RC
