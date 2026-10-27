#!/usr/bin/env python3
"""Crop a picture to the part a slide needs.

    python3 crop_image.py <in.png|jpg> <out.png> [--box x0,y0,x1,y1] [--trim] [--pad 12] [--cutout [--tol 14]]

--box   the region to keep. Values between 0 and 1 are fractions of the width and height
        ("0,0.15,1,0.8" keeps the middle band); larger values are pixels.
--trim  cut away a plain border (white, transparent, or the colour of the top-left corner).
--pad   pixels of margin left around the content after --trim.
--cutout  make a plain background transparent (a product photo on white or grey), so the object
        sits directly on the slide or card instead of inside its own grey box. The background is
        the colour that runs along the picture's border; only the part connected to the border
        is removed, so light parts inside the object stay. --tol sets how far a pixel may differ
        from that colour (default 14; raise it for noisy JPEG backgrounds, lower it when light
        parts of the object disappear). Look at the result on a dark and a light background.

Typical uses: keep the screen and drop the slide header or a third party's logo around it,
keep one panel of a figure, or take a diagram out of a whole page rendered by
extract_images.py --pages. Run it once per picture and look at the result.
"""
import argparse
import sys

try:
    from PIL import Image, ImageChops, ImageDraw, ImageFilter
except ImportError:
    sys.exit('Pillow is needed: pip install pillow')


def parse_box(v, size):
    parts = [float(x) for x in v.split(',')]
    if len(parts) != 4:
        sys.exit('--box needs four numbers: x0,y0,x1,y1')
    if all(0 <= p <= 1 for p in parts):
        w, h = size
        parts = [parts[0] * w, parts[1] * h, parts[2] * w, parts[3] * h]
    x0, y0, x1, y1 = [int(round(p)) for p in parts]
    if x1 <= x0 or y1 <= y0:
        sys.exit('--box: x1 must be larger than x0 and y1 larger than y0')
    return x0, y0, x1, y1


def trim(im, pad):
    rgba = im.convert('RGBA')
    alpha = rgba.split()[-1]
    if alpha.getextrema()[0] < 255:
        box = alpha.point(lambda a: 255 if a > 16 else 0).getbbox()
    else:
        rgb = rgba.convert('RGB')
        bg = Image.new('RGB', rgb.size, rgb.getpixel((0, 0)))
        diff = ImageChops.difference(rgb, bg).convert('L').point(lambda d: 255 if d > 18 else 0)
        box = diff.getbbox()
    if not box:
        return im
    x0, y0, x1, y1 = box
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


def cutout(im, tol):
    """Background connected to the border -> transparent. Returns RGBA."""
    rgba = im.convert('RGBA')
    rgb = rgba.convert('RGB')
    w, h = rgb.size
    step = max(1, min(w, h) // 60)
    border = [(x, 0) for x in range(0, w, step)] + [(x, h - 1) for x in range(0, w, step)] + \
             [(0, y) for y in range(0, h, step)] + [(w - 1, y) for y in range(0, h, step)]
    cols = sorted(rgb.getpixel(p) for p in border)
    bg = tuple(sorted(c[i] for c in cols)[len(cols) // 2] for i in range(3))  # median border colour
    near = lambda c: max(abs(c[i] - bg[i]) for i in range(3)) <= tol
    mark = (255, 0, 254)
    work = rgb.copy()
    for p in border:
        c = work.getpixel(p)
        if c != mark and near(c):
            ImageDraw.floodfill(work, p, mark, thresh=tol)
    gone = ImageChops.difference(work, Image.new('RGB', work.size, mark)).convert('L').point(lambda v: 255 if v > 0 else 0)
    gone = gone.filter(ImageFilter.GaussianBlur(0.7))  # soften the cut edge a little
    alpha = ImageChops.multiply(rgba.split()[-1], gone)
    rgba.putalpha(alpha)
    return rgba


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--box')
    ap.add_argument('--trim', action='store_true')
    ap.add_argument('--pad', type=int, default=12)
    ap.add_argument('--cutout', action='store_true')
    ap.add_argument('--tol', type=int, default=14)
    a = ap.parse_args()
    im = Image.open(a.src)
    if a.box:
        im = im.crop(parse_box(a.box, im.size))
    if a.cutout:
        if a.out.lower().endswith(('.jpg', '.jpeg')):
            sys.exit('--cutout needs a .png output (JPEG has no transparency)')
        im = cutout(im, a.tol)
    if a.trim:
        im = trim(im, a.pad)
    if a.out.lower().endswith(('.jpg', '.jpeg')) and im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGB')
    im.save(a.out)
    print(f'{a.out}: {im.width}x{im.height}')


if __name__ == '__main__':
    main()
