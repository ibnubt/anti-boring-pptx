#!/usr/bin/env python3
"""Print the text of every slide in a .pptx, or compare two decks slide by slide.

    pptx_text.py <deck.pptx>                 text per slide, plus picture and table counts
    pptx_text.py <deck.pptx> --diff <other>  only the slides whose text differs

Use it to read reference decks, and to see whether the user edited a delivered deck before
you rebuild it. It reads text only: logos, diagrams and screenshots have to be rendered and
looked at. Standard library only; run untrusted files with `python3 -I`.
"""
import html
import re
import sys
import zipfile


def slides(path):
    z = zipfile.ZipFile(path)
    names = sorted((n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)),
                   key=lambda n: int(re.findall(r"\d+", n)[-1]))
    out = []
    for n in names:
        x = z.read(n).decode("utf-8", "ignore")
        paras = []
        for para in re.findall(r"<a:p[ >].*?</a:p>", x, flags=re.S):
            t = html.unescape("".join(re.findall(r"<a:t>([^<]*)</a:t>", para))).strip()
            if t:
                paras.append(t)
        out.append({"n": int(re.findall(r"\d+", n)[-1]), "text": paras,
                    "pics": len(re.findall(r"<p:pic>", x)), "tables": len(re.findall(r"<a:tbl>", x))})
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    a = slides(sys.argv[1])
    if "--diff" in sys.argv:
        b = slides(sys.argv[sys.argv.index("--diff") + 1])
        print("slides: %d vs %d" % (len(a), len(b)))
        same = True
        for i in range(max(len(a), len(b))):
            ta = a[i]["text"] if i < len(a) else []
            tb = b[i]["text"] if i < len(b) else []
            if ta != tb:
                same = False
                print("\n=== slide %d ===" % (i + 1))
                for t in ta:
                    if t not in tb:
                        print("  only in first :", t)
                for t in tb:
                    if t not in ta:
                        print("  only in second:", t)
        print("\nno text differences" if same else "")
        return 0
    print("slides:", len(a))
    for s in a:
        print("\n=== slide %d (pictures %d, tables %d) ===" % (s["n"], s["pics"], s["tables"]))
        for t in s["text"]:
            print(" ", t)
    return 0


if __name__ == "__main__":
    sys.exit(main())
