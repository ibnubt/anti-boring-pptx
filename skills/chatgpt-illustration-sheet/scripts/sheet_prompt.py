#!/usr/bin/env python3
"""Write the ChatGPT prompts that draw many illustrations in ONE image (a sheet), and the manifest
slice_sheet.py needs to cut each sheet back into one PNG per illustration.

    sheet_prompt.py <spec.json> <out_dir>

spec.json
    {
      "style": "glossy-3d",       # a preset in styles.json, or the style written out in full
      "cols": 3, "max": 6,        # cells per row and per sheet (defaults 3 and 6; max 9)
      "items": [ {"key": "prime", "subject": "A cluster of blue office buildings, ..."}, ... ]
    }

Writes, per sheet: sheet-NN.prompt.txt (paste into ChatGPT) and sheet-NN.json (the manifest).
Items are packed into as few sheets as possible; the last row of a sheet may be shorter.
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
STYLES = json.load(open(os.path.join(HERE, "..", "styles.json"), encoding="utf-8"))


def rows_for(n, cols):
    """Cell counts per row: full rows of `cols`, the remainder in the last row."""
    rows = [cols] * (n // cols)
    if n % cols:
        rows.append(n % cols)
    return rows


def canvas(rows, cols):
    """ChatGPT's three image sizes; pick the one closest to the grid's shape."""
    c, r = min(cols, max(rows)), len(rows)
    if c > r:
        return 1536, 1024, "landscape"
    if r > c:
        return 1024, 1536, "portrait"
    return 1024, 1024, "square"


def prompt(items, rows, style):
    w, h, orient = canvas(rows, max(rows))
    n = len(items)
    shape = ", ".join(f"row {i + 1} with {c}" for i, c in enumerate(rows))
    lines = [
        f"Create ONE image: a sheet of {n} separate illustrations in {len(rows)} rows ({shape}).",
        "Each illustration sits alone, centred in its own equal-sized cell, with wide empty space around it,",
        "so that no two illustrations touch or overlap and every illustration is complete, nothing cut off.",
        "No grid lines, no frames, no shadows on a floor, no numbers, no captions, no titles.",
        "Background: fully transparent PNG. If transparency is not possible, plain pure white (#FFFFFF).",
        f"Size: {w}x{h} pixels ({orient}).",
        "",
        "Style, identical for every illustration on the sheet:",
        style,
        "",
        "The illustrations, row by row, left to right (the numbers are only for this list; do not draw them):",
    ]
    k = 0
    for r, c in enumerate(rows):
        lines.append(f"Row {r + 1}:")
        for _ in range(c):
            k += 1
            lines.append(f"  {k}. {items[k - 1]['subject']}")
    lines += ["", "Draw no words inside the illustrations unless the list above asks for a specific word."]
    return "\n".join(lines) + "\n", (w, h)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    spec = json.load(open(sys.argv[1], encoding="utf-8"))
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    style_name = spec.get("style", "glossy-3d")
    style = STYLES.get(style_name, style_name)
    cols, per = int(spec.get("cols", 3)), min(int(spec.get("max", 6)), 9)
    items = spec["items"]
    keys = [it["key"] for it in items]
    if len(set(keys)) != len(keys):
        sys.exit("duplicate keys in spec")
    if len(items) < 2:
        sys.exit("a sheet needs at least 2 illustrations; add the next ones the deck will need")
    # spread items evenly over the fewest sheets, so no sheet is left with a single illustration
    sheets = math.ceil(len(items) / per)
    size = math.ceil(len(items) / sheets)
    done = 0
    for s in range(sheets):
        chunk = items[done:done + size]
        done += len(chunk)
        rows = rows_for(len(chunk), cols)
        name = f"sheet-{s + 1:02d}"
        text, wh = prompt(chunk, rows, style)
        open(os.path.join(out, name + ".prompt.txt"), "w", encoding="utf-8").write(text)
        json.dump({"sheet": name, "style": style_name, "rows": rows, "size": wh,
                   "items": [{"key": it["key"], "subject": it["subject"]} for it in chunk]},
                  open(os.path.join(out, name + ".json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        print(f"{name}: {len(chunk)} illustrations, rows {rows}, {wh[0]}x{wh[1]}"
              f" -> paste {name}.prompt.txt into ChatGPT, save the image as {name}.png")


if __name__ == "__main__":
    main()
