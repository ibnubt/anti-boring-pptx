#!/usr/bin/env python3
"""Turn a deck PDF into slide JPGs and contact sheets for visual QA.

    contact_sheet.py <deck.pdf> <out-dir> [--dpi 68] [--per 6]

Writes <out-dir>/slide-NN.jpg (one per page) and <out-dir>/sheet-N.jpg (two columns,
`per` slides each). Older slide-*.jpg and sheet-*.jpg in <out-dir> are replaced.
Needs `pdftoppm` (poppler) and Pillow.
"""
import glob
import os
import subprocess
import sys

from PIL import Image


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        print(__doc__)
        return 2
    pdf, out = args[0], args[1]
    dpi = int(sys.argv[sys.argv.index("--dpi") + 1]) if "--dpi" in sys.argv else 68
    per = int(sys.argv[sys.argv.index("--per") + 1]) if "--per" in sys.argv else 6
    os.makedirs(out, exist_ok=True)
    for old in glob.glob(os.path.join(out, "slide-*.jpg")) + glob.glob(os.path.join(out, "sheet-*.jpg")):
        os.remove(old)
    subprocess.run(["pdftoppm", "-jpeg", "-r", str(dpi), pdf, os.path.join(out, "slide")], check=True)
    files = sorted(glob.glob(os.path.join(out, "slide-*.jpg")))
    rows = (per + 1) // 2
    for n in range(0, len(files), per):
        ims = [Image.open(f) for f in files[n:n + per]]
        w, h = ims[0].size
        sheet = Image.new("RGB", (2 * w + 30, rows * h + 10 * (rows + 1)), "white")
        for i, im in enumerate(ims):
            sheet.paste(im, (10 + (i % 2) * (w + 10), 10 + (i // 2) * (h + 10)))
        name = os.path.join(out, "sheet-%d.jpg" % (n // per + 1))
        sheet.save(name, quality=88)
        print("sheet", name, "slides %d-%d" % (n + 1, n + len(ims)))
    print(len(files), "slides")
    return 0


if __name__ == "__main__":
    sys.exit(main())
