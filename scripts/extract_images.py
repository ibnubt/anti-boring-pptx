#!/usr/bin/env python3
"""Pull the pictures out of a reference document so the deck can reuse them.

    python3 extract_images.py <document> <out-dir> [--min-px 120] [--pages] [--dpi 150]

Works on PDF (needs poppler: pdfimages, pdftoppm) and on Office files (.pptx, .docx, .xlsx),
whose pictures sit in the zip's media folder. Writes into <out-dir>:

  p05-01.png / s05-image3.png   each picture, named by page (PDF) or slide (PPTX)
  index.tsv                     file, where it appears, width and height in pixels
  images-N.jpg                  contact sheets of the pictures, twelve per sheet, to look at
  pages/page-05.png             with --pages: every page rendered whole (PDF only)

Use --pages when a figure is assembled from several pieces (a diagram drawn with shapes and
small pictures): the pieces come out separately, so render the page and crop the region with
crop_image.py instead. Pictures smaller than --min-px on their short side (icons, bullets) and
exact duplicates are skipped. Vector pictures in Office files (EMF, WMF, SVG) are listed but not
converted; render that slide instead.
"""
import argparse
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from xml.etree import ElementTree as ET

try:
    from PIL import Image, ImageDraw
except ImportError:
    Image = None

RASTER = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tif', '.tiff', '.webp'}
VECTOR = {'.emf', '.wmf', '.svg', '.eps'}


def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def from_pdf(doc, out, min_px):
    if not shutil.which('pdfimages'):
        sys.exit('pdfimages not found: install poppler (macOS: brew install poppler; Debian: apt install poppler-utils)')
    rows = []
    for line in run(['pdfimages', '-list', doc]).splitlines()[2:]:
        f = line.split()
        if len(f) >= 5 and f[0].isdigit():
            rows.append({'page': int(f[0]), 'type': f[2], 'w': int(f[3]), 'h': int(f[4])})
    tmp = tempfile.mkdtemp(prefix='imgx_')
    try:
        run(['pdfimages', '-png', doc, os.path.join(tmp, 'x')])
        files = sorted(os.listdir(tmp), key=lambda n: int(re.findall(r'\d+', n)[-1]))
        found, per_page = [], {}
        for i, r in enumerate(rows):
            if i >= len(files):
                break
            src = os.path.join(tmp, files[i])
            if r['type'] == 'smask':
                # an alpha mask for the picture listed just before it: merge, so transparency survives
                if found and found[-1]['page'] == r['page'] and Image:
                    base = Image.open(found[-1]['src']).convert('RGB')
                    base.putalpha(Image.open(src).convert('L').resize(base.size))
                    base.save(found[-1]['src'])
                continue
            if r['type'] != 'image':
                continue
            found.append({'page': r['page'], 'src': src, 'size': (r['w'], r['h'])})
        kept = []
        for it in found:
            if min(it['size']) < min_px:
                continue
            per_page[it['page']] = per_page.get(it['page'], 0) + 1
            name = f"p{it['page']:02d}-{per_page[it['page']]:02d}.png"
            shutil.copy(it['src'], os.path.join(out, name))
            kept.append((name, f"page {it['page']}", it['size']))
        return kept
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def slide_map(z):
    """media file -> slide numbers that use it (PPTX only)."""
    uses = {}
    for n in z.namelist():
        m = re.fullmatch(r'ppt/slides/_rels/slide(\d+)\.xml\.rels', n)
        if not m:
            continue
        for rel in ET.fromstring(z.read(n)):
            t = rel.get('Target', '')
            if '/media/' in t or t.startswith('media/'):
                uses.setdefault(os.path.basename(t), set()).add(int(m.group(1)))
    return uses


def from_office(doc, out, min_px):
    kept, vectors = [], []
    with zipfile.ZipFile(doc) as z:
        uses = slide_map(z) if doc.lower().endswith('.pptx') else {}
        media = [n for n in z.namelist() if re.match(r'(ppt|word|xl)/media/', n)]
        for n in sorted(media):
            base = os.path.basename(n)
            ext = os.path.splitext(base)[1].lower()
            slides = sorted(uses.get(base, []))
            where = ('slide ' + ', '.join(map(str, slides))) if slides else ('not on a slide' if uses else '-')
            if ext in VECTOR:
                vectors.append((base, where))
                continue
            if ext not in RASTER:
                continue
            data = z.read(n)
            stem = (f's{slides[0]:02d}-' if slides else '') + os.path.splitext(base)[0]
            if ext in ('.png', '.jpg', '.jpeg'):
                name = stem + ('.jpg' if ext == '.jpeg' else ext)
                with open(os.path.join(out, name), 'wb') as f:
                    f.write(data)
            elif Image:
                name = stem + '.png'
                tmp = os.path.join(out, '_tmp' + ext)
                with open(tmp, 'wb') as f:
                    f.write(data)
                Image.open(tmp).save(os.path.join(out, name))
                os.remove(tmp)
            else:
                continue
            size = Image.open(os.path.join(out, name)).size if Image else (0, 0)
            if Image and min(size) < min_px:
                os.remove(os.path.join(out, name))
                continue
            kept.append((name, where, size))
    for base, where in vectors:
        print(f'vector picture not converted: {base} ({where}) — render that slide instead')
    return kept


def dedupe(out, kept):
    seen, res = {}, []
    for name, where, size in kept:
        h = hashlib.md5(open(os.path.join(out, name), 'rb').read()).hexdigest()
        if h in seen:
            os.remove(os.path.join(out, name))
            if where not in seen[h][1]:
                seen[h][1].append(where)
            continue
        seen[h] = (name, [where])
        res.append([name, [where], size])
    for r in res:
        r[1] = seen[hashlib.md5(open(os.path.join(out, r[0]), 'rb').read()).hexdigest()][1]
    return res


def sheets(out, items, per=12, cols=4, cell=(420, 300)):
    if not Image:
        print('Pillow not installed: no contact sheets (pip install pillow)')
        return
    for k in range(0, len(items), per):
        chunk = items[k:k + per]
        rows = (len(chunk) + cols - 1) // cols
        S = Image.new('RGB', (cols * cell[0], rows * (cell[1] + 30)), 'white')
        d = ImageDraw.Draw(S)
        for i, (name, where, size) in enumerate(chunk):
            im = Image.open(os.path.join(out, name))
            if im.mode in ('RGBA', 'LA', 'P'):
                bg = Image.new('RGB', im.size, (236, 239, 242))
                im = im.convert('RGBA')
                bg.paste(im, mask=im.split()[-1])
                im = bg
            im.thumbnail((cell[0] - 16, cell[1] - 16))
            x, y = (i % cols) * cell[0], (i // cols) * (cell[1] + 30)
            S.paste(im.convert('RGB'), (x + (cell[0] - im.width) // 2, y + (cell[1] - im.height) // 2))
            d.text((x + 8, y + cell[1] + 6), f'{name}  {size[0]}x{size[1]}  {where[0]}', fill=(40, 40, 40))
        p = os.path.join(out, f'images-{k // per + 1}.jpg')
        S.save(p, quality=82)
        print('sheet', p)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('document')
    ap.add_argument('out')
    ap.add_argument('--min-px', type=int, default=120, help='skip pictures smaller than this on the short side')
    ap.add_argument('--pages', action='store_true', help='PDF: also render every page whole')
    ap.add_argument('--dpi', type=int, default=150)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    low = a.document.lower()
    if low.endswith('.pdf'):
        kept = from_pdf(a.document, a.out, a.min_px)
        if a.pages:
            pd = os.path.join(a.out, 'pages')
            os.makedirs(pd, exist_ok=True)
            run(['pdftoppm', '-r', str(a.dpi), '-png', a.document, os.path.join(pd, 'page')])
            print('pages rendered to', pd)
    elif low.endswith(('.pptx', '.docx', '.xlsx', '.pptm', '.docm')):
        kept = from_office(a.document, a.out, a.min_px)
    else:
        sys.exit('supported: .pdf, .pptx, .docx, .xlsx')
    items = dedupe(a.out, kept)
    with open(os.path.join(a.out, 'index.tsv'), 'w') as f:
        f.write('file\twhere\twidth\theight\n')
        for name, where, size in items:
            f.write(f"{name}\t{'; '.join(where)}\t{size[0]}\t{size[1]}\n")
    print(f'{len(items)} pictures written to {a.out} (index.tsv lists where each appears)')
    sheets(a.out, items)


if __name__ == '__main__':
    main()
