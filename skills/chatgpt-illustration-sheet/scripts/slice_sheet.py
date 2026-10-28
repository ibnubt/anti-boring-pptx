#!/usr/bin/env python3
"""Cut a ChatGPT illustration sheet into one transparent PNG per illustration.

    slice_sheet.py <sheet.png> <sheet-NN.json> <library_dir>

The manifest (from sheet_prompt.py) gives the rows and the keys in reading order. The sheet is split
along its empty gutters: first into rows, then each row into its cells, so an illustration made of
several separate objects stays in one piece. A white background is cleared from the edges inwards
(white inside an illustration is kept); a transparent background is used as it is.

Writes <library_dir>/<key>.png for every item, adds them to <library_dir>/library.json, and saves
<library_dir>/preview-<sheet>.png: every cut-out on a light and on a blue card, to check by eye.
"""
import datetime
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

WHITE = 236           # a channel above this counts as background white
SPECK = 0.002         # a line with fewer foreground pixels than this share counts as empty


def background(px, transparent):
    if transparent:
        return px[..., 3] < 24
    return (px[..., 0] > WHITE) & (px[..., 1] > WHITE) & (px[..., 2] > WHITE) | (px[..., 3] < 24)


def split(counts, parts, length):
    """Cut a 1-D foreground profile into `parts` pieces at the widest empty gaps between content."""
    full = np.nonzero(counts > max(2, SPECK * length))[0]
    if len(full) == 0:
        return None
    lo, hi = full[0], full[-1] + 1
    if parts == 1:
        return [(lo, hi)]
    empty = counts[lo:hi] <= max(2, SPECK * length)
    runs, start = [], None
    for i, e in enumerate(empty):
        if e and start is None:
            start = i
        if not e and start is not None:
            runs.append((i - start, lo + start, lo + i))
            start = None
    if len(runs) < parts - 1:
        return None
    cuts = sorted((a + b) // 2 for _, a, b in sorted(runs, reverse=True)[:parts - 1])
    edges = [lo] + cuts + [hi]
    return list(zip(edges[:-1], edges[1:]))


def even(lo, hi, parts):
    step = (hi - lo) / parts
    return [(int(lo + i * step), int(lo + (i + 1) * step)) for i in range(parts)]


def clear_white(px):
    """Make the white that touches the crop's edges transparent, then soften the one-pixel rim."""
    white = background(px, False)
    reach = np.zeros_like(white)
    reach[0, :], reach[-1, :], reach[:, 0], reach[:, -1] = white[0, :], white[-1, :], white[:, 0], white[:, -1]
    while True:
        grown = reach.copy()
        grown[1:, :] |= reach[:-1, :]
        grown[:-1, :] |= reach[1:, :]
        grown[:, 1:] |= reach[:, :-1]
        grown[:, :-1] |= reach[:, 1:]
        grown &= white
        if (grown == reach).all():
            break
        reach = grown
    px[reach, 3] = 0
    rim = np.zeros_like(reach)
    rim[1:, :] |= reach[:-1, :]
    rim[:-1, :] |= reach[1:, :]
    rim[:, 1:] |= reach[:, :-1]
    rim[:, :-1] |= reach[:, 1:]
    rim &= ~reach
    light = px[..., :3].min(axis=2).astype(int)
    soft = rim & (light > 200)
    px[soft, 3] = np.clip((255 - light[soft]) * 255 // 55, 0, 255).astype(np.uint8)
    return px


def trim(im):
    box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    return im.crop(box) if box else im


def preview(cuts, path):
    tw, th, cols = 440, 250, 3
    rows = (len(cuts) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw, rows * th), "white")
    d = ImageDraw.Draw(sheet)
    for i, (key, im) in enumerate(cuts):
        x, y = (i % cols) * tw, (i // cols) * th
        for j, colour in enumerate(("#F5F5F7", "#0071E3")):
            cx = x + 10 + j * 210
            d.rounded_rectangle((cx, y + 10, cx + 200, y + 210), 16, fill=colour)
            t = im.copy()
            t.thumbnail((170, 170))
            sheet.paste(t, (cx + (200 - t.width) // 2, y + 10 + (200 - t.height) // 2), t)
        d.text((x + 12, y + 220), f"{key}  ({im.width}x{im.height})", fill="black")
    sheet.save(path)


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    sheet_path, manifest_path, lib = sys.argv[1:]
    man = json.load(open(manifest_path, encoding="utf-8"))
    rows, items = man["rows"], man["items"]
    os.makedirs(lib, exist_ok=True)
    im = Image.open(sheet_path).convert("RGBA")
    px = np.array(im)
    H, W = px.shape[:2]
    transparent = (px[..., 3] < 24).mean() > 0.05
    fg = ~background(px, transparent)
    print(f"{os.path.basename(sheet_path)}: {W}x{H}, background {'transparent' if transparent else 'white'}")

    bands = split(fg.sum(axis=1), len(rows), W)
    if bands is None:
        print("  warning: rows not separated by empty space; cutting into equal rows")
        bands = even(0, H, len(rows))
    cells = []
    for (y0, y1), n in zip(bands, rows):
        cols = split(fg[y0:y1].sum(axis=0), n, y1 - y0)
        if cols is None:
            print(f"  warning: a row has fewer separated illustrations than {n}; cutting into equal cells")
            cols = even(0, W, n)
        cells += [(x0, y0, x1, y1) for x0, x1 in cols]

    pad = int(0.012 * max(W, H))
    cuts, libfile = [], os.path.join(lib, "library.json")
    library = json.load(open(libfile, encoding="utf-8")) if os.path.exists(libfile) else {}
    for it, (x0, y0, x1, y1) in zip(items, cells):
        sub = fg[y0:y1, x0:x1]
        ys, xs = np.nonzero(sub)
        if len(ys) == 0:
            print(f"  warning: {it['key']}: empty cell, nothing saved")
            continue
        bx0, by0 = max(x0, x0 + xs.min() - pad), max(y0, y0 + ys.min() - pad)
        bx1, by1 = min(x1, x0 + xs.max() + 1 + pad), min(y1, y0 + ys.max() + 1 + pad)
        crop = px[by0:by1, bx0:bx1].copy()
        if not transparent:
            crop = clear_white(crop)
        out = trim(Image.fromarray(crop))
        out.save(os.path.join(lib, it["key"] + ".png"))
        cuts.append((it["key"], out))
        library[it["key"]] = {"file": it["key"] + ".png", "subject": it["subject"], "style": man.get("style"),
                              "sheet": man["sheet"], "size": [out.width, out.height],
                              "added": datetime.date.today().isoformat()}
        print(f"  {it['key']}.png  {out.width}x{out.height}")
    json.dump(library, open(libfile, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    prev = os.path.join(lib, f"preview-{man['sheet']}.png")
    preview(cuts, prev)
    print(f"  preview: {prev}")


if __name__ == "__main__":
    main()
