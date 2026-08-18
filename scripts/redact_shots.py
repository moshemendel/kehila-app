# -*- coding: utf-8 -*-
"""
Produces privacy-cleaned copies of the screenshots used by the promo reel.

Phone numbers are pixelated then blurred (the downsample is what makes it
irreversible - a plain gaussian blur can be partly undone). The account name
is repainted rather than blurred, so the home screen still reads as a real
greeting.

    python scripts/redact_shots.py

Writes assets/booklet/raw_clean/. make_demo_video.py prefers that directory
and falls back to raw/ for every screenshot that needs no edit.
"""
import os

from PIL import Image, ImageDraw, ImageFont
from bidi.algorithm import get_display

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "booklet", "raw")
DST = os.path.join(ROOT, "assets", "booklet", "raw_clean")

F_BOLD = "C:/Windows/Fonts/segoeuib.ttf"
F_REG = "C:/Windows/Fonts/segoeui.ttf"

NEW_NAME = "\u05d9\u05e9\u05e8\u05d0\u05dc \u05dc\u05d5\u05d9"   # ישראל לוי

# ("blur", x0, y0, x1, y1)      rectangular pixelation
# ("circle", x0, y0, x1, y1)    pixelation masked to an ellipse
# ("text", x0, y0, x1, y1, right_x, top_y, size, font, rgb, bg_sample_x)
EDITS = {
    "01_home": [
        ("text", 530, 205, 1020, 300, 1010, 212, 74, F_BOLD, (255, 255, 255), 1050),
    ],
    "04_synagogue_detail": [
        ("circle", 288, 788, 562, 1062),   # photo of a notice carrying phone numbers
        ("blur", 95, 2122, 800, 2192),     # gabbai name + mobile
    ],
    "09_business_detail": [
        ("blur", 605, 1100, 940, 1160),
    ],
    "10_mikveh": [
        ("blur", 535, 1788, 895, 1862),
    ],
    "17_gemach": [
        ("text", 690, 845, 990, 915, 967, 852, 40, F_REG, (107, 114, 128), 660),
        ("blur", 610, 950, 900, 1015),
        ("text", 690, 1452, 990, 1522, 967, 1459, 40, F_REG, (107, 114, 128), 660),
        ("blur", 610, 1557, 900, 1622),
    ],
}


def pixelate(im, box, block=14, ellipse=False):
    x0, y0 = box[0], box[1]
    region = im.crop(box)
    w, h = region.size
    small = region.resize((max(1, w // block), max(1, h // block)), Image.BILINEAR)
    coarse = small.resize((w, h), Image.NEAREST)
    if ellipse:
        # The thumbnail is a circle; a square patch over it reads as a glitch.
        mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, w - 1, h - 1], fill=255)
        im.paste(coarse, (x0, y0), mask)
    else:
        im.paste(coarse, (x0, y0))


def repaint(im, x0, y0, x1, y1, right, top, size, fpath, rgb, bg_x):
    """Clear the old string using the background colour of each row, then draw
    the replacement right-aligned (the app is RTL)."""
    d = ImageDraw.Draw(im)
    px = im.load()
    for y in range(y0, y1):
        d.line([(x0, y), (x1, y)], fill=px[bg_x, y])
    f = ImageFont.truetype(fpath, size)
    s = get_display(NEW_NAME)
    d.text((right - d.textlength(s, font=f), top), s, font=f, fill=rgb)


def main():
    os.makedirs(DST, exist_ok=True)
    for name, ops in EDITS.items():
        im = Image.open(os.path.join(SRC, name + ".png")).convert("RGB")
        for op in ops:
            if op[0] in ("blur", "circle"):
                pixelate(im, op[1:5], ellipse=(op[0] == "circle"))
            else:
                repaint(im, *op[1:])
        out = os.path.join(DST, name + ".png")
        im.save(out)
        print("redacted", name, "->", os.path.relpath(out, ROOT))


if __name__ == "__main__":
    main()
