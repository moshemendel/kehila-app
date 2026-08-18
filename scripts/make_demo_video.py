# -*- coding: utf-8 -*-
"""
Renders the "Kehila" pitch reel: a narrated screen tour built from the real
device screenshots in assets/booklet/raw, piped frame-by-frame into ffmpeg.

    python scripts/make_demo_video.py            # vertical 1080x1920
    python scripts/make_demo_video.py --wide     # landscape 1920x1080

Hebrew is laid out with python-bidi because the Pillow build here has no raqm.
"""
import argparse
import json
import os
import subprocess
import sys
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from bidi.algorithm import get_display

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "assets", "booklet", "raw")
SHOTS_CLEAN = os.path.join(ROOT, "assets", "booklet", "raw_clean")
OUT = os.path.join(ROOT, "assets", "promo")


def shot(name):
    """Prefer the privacy-cleaned copy from redact_shots.py when there is one."""
    clean = os.path.join(SHOTS_CLEAN, name + ".png")
    return clean if os.path.exists(clean) else os.path.join(SHOTS, name + ".png")

FPS = 30

# Palette lifted from the booklet's dark theme.
NAVY_DEEP = (12, 29, 56)
NAVY = (27, 58, 107)
GOLD = (217, 180, 74)
INK = (255, 255, 255)
INK_2 = (195, 208, 228)
MUTED = (137, 150, 171)

F_BOLD = "C:/Windows/Fonts/segoeuib.ttf"
F_REG = "C:/Windows/Fonts/segoeui.ttf"

# The 45-second cut: two questions, the reveal, the four modules that answer
# them, the Shabbat lock, and the sign-off. No chapter cards, no admin.
SHORT_REEL = [
    "hook1", "hook2", "title",
    "06_prayertimes", "08_businesses", "10_mikveh", "17_gemach",
    "32_shabbat_closed", "end",
]
SHORT_LEAD, SHORT_TAIL = 0.30, 0.40

NARR = os.path.join(OUT, "narration")
# A licensed track dropped here is used instead of the synthesised bed.
# Put one in place with --music <path>; keep your licence record with it.
MUSIC_TRACK = os.path.join(OUT, "music-track.mp3")
SR = 44100
LEAD = 0.35         # silence between a scene appearing and its line starting
TAIL = 0.55         # silence after the line before the next transition
MIN_HOLD = 1.7      # floor, so a very short line still gets a readable beat
# Calibrated by ear against the measurement that actually predicts masking:
# music energy inside the speech band (300-3500 Hz) relative to the voice.
# 0.60 puts the licensed corporate track at -10.3 dB in-band. Raw level is a
# poor guide here - the old synth pad sat at the same overall level but only
# -15.2 dB in-band, because it was low-passed sine content that lived under
# the voice rather than on top of it. Retune after swapping the track.
MUSIC_LEVEL = 0.60  # bed level before ducking (bed is levelled first)
DUCK = 0.55         # how far the bed drops under speech
DUCK_ATTACK = 0.06  # seconds to pull the bed down when a line starts
DUCK_RELEASE = 0.32 # seconds to let it back up afterwards

TITLE_HOLD = 3.4
CHAPTER_HOLD = 1.9
SCREEN_HOLD = 2.3
TRANS = 0.42        # push between two screens
TRANS_CARD = 0.62   # dip through the background, into or out of a card
END_HOLD = 4.2


def font(path, size):
    return ImageFont.truetype(path, size)


def rtl(s):
    return get_display(s)


def ease(t):
    return 1 - (1 - t) ** 3


# Cold open: three questions a resident actually asks, before the app appears.
HOOKS = [
    ("hook1", "חיפשתם פעם מניין ולא מצאתם?"),
    ("hook2", "רציתם לברר על כשרות של מסעדה, ולא ידעתם את מי לשאול?"),
    ("hook3", "העירוב תקין? מתי המקווה נפתח? מאיפה משאילים מיטת תינוק?"),
]

# The reel, in order.
#   ("chapter", n, title, blurb)
#   ("screen", basename, title, line)
SCENES = [
    ("chapter", 1, "\u05de\u05e1\u05da \u05d4\u05d1\u05d9\u05ea \u05d5\u05e0\u05d9\u05d5\u05d5\u05d8",
     "\u05e0\u05e7\u05d5\u05d3\u05ea \u05d4\u05e4\u05ea\u05d9\u05d7\u05d4, \u05d5\u05d4\u05d3\u05e8\u05da \u05dc\u05db\u05dc \u05e9\u05d0\u05e8 \u05d4\u05de\u05d5\u05d3\u05d5\u05dc\u05d9\u05dd"),
    ("screen", "01_home", "\u05de\u05e1\u05da \u05d4\u05d1\u05d9\u05ea",
     "\u05d1\u05e8\u05db\u05d4 \u05d0\u05d9\u05e9\u05d9\u05ea, \u05d4\u05ea\u05d0\u05e8\u05d9\u05da \u05d4\u05e2\u05d1\u05e8\u05d9 \u05d5\u05d4\u05e4\u05e8\u05e9\u05d4, \u05d4\u05ea\u05e4\u05d9\u05dc\u05d4 \u05d4\u05d1\u05d0\u05d4, \u05db\u05e0\u05d9\u05e1\u05ea \u05e9\u05d1\u05ea \u05d5\u05e7\u05d9\u05e6\u05d5\u05e8\u05d9 \u05d3\u05e8\u05da \u05dc\u05db\u05dc \u05d4\u05de\u05d5\u05d3\u05d5\u05dc\u05d9\u05dd."),
    ("screen", "13_search", "\u05d7\u05d9\u05e4\u05d5\u05e9 \u05d0\u05d7\u05d3 \u05dc\u05db\u05dc \u05d4\u05e2\u05d9\u05e8",
     "\u05d1\u05ea\u05d9 \u05db\u05e0\u05e1\u05ea, \u05e2\u05e1\u05e7\u05d9\u05dd \u05db\u05e9\u05e8\u05d9\u05dd, \u05d0\u05d9\u05e8\u05d5\u05e2\u05d9\u05dd \u05d5\u05d2\u05de\u05f4\u05d7\u05d9\u05dd \u2014 \u05d1\u05e9\u05d3\u05d4 \u05d7\u05d9\u05e4\u05d5\u05e9 \u05d0\u05d7\u05d3, \u05e2\u05dd \u05e1\u05d9\u05e0\u05d5\u05df \u05dc\u05e4\u05d9 \u05e1\u05d5\u05d2."),
    ("screen", "15b_tabbar_customize", "\u05d4\u05e1\u05e8\u05d2\u05dc \u05e9\u05db\u05dc \u05ea\u05d5\u05e9\u05d1 \u05de\u05e1\u05d3\u05e8 \u05dc\u05e2\u05e6\u05de\u05d5",
     "\u05db\u05dc \u05de\u05e9\u05ea\u05de\u05e9 \u05d1\u05d5\u05d7\u05e8 \u05d0\u05d9\u05dc\u05d5 \u05d0\u05e8\u05d1\u05e2\u05d4 \u05de\u05d5\u05d3\u05d5\u05dc\u05d9\u05dd \u05d9\u05d5\u05e4\u05d9\u05e2\u05d5 \u05dc\u05d5 \u05d1\u05e1\u05e8\u05d2\u05dc \u05d4\u05ea\u05d7\u05ea\u05d5\u05df."),

    ("chapter", 2, "\u05d1\u05ea\u05d9 \u05db\u05e0\u05e1\u05ea \u05d5\u05ea\u05e4\u05d9\u05dc\u05d4",
     "\u05dc\u05d9\u05d1\u05ea \u05d4\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4: 69 \u05d1\u05ea\u05d9 \u05d4\u05db\u05e0\u05e1\u05ea \u05e9\u05dc \u05de\u05e2\u05dc\u05d4 \u05d0\u05d3\u05d5\u05de\u05d9\u05dd"),
    ("screen", "03_synagogues", "\u05e8\u05e9\u05d9\u05de\u05ea \u05d1\u05ea\u05d9 \u05d4\u05db\u05e0\u05e1\u05ea",
     "69 \u05d1\u05ea\u05d9 \u05d4\u05db\u05e0\u05e1\u05ea \u05d1\u05e2\u05d9\u05e8, \u05d1\u05e1\u05d9\u05e0\u05d5\u05df \u05dc\u05e4\u05d9 \u05e9\u05db\u05d5\u05e0\u05d4 \u05d5\u05e0\u05d5\u05e1\u05d7, \u05d5\u05d1\u05de\u05d9\u05d5\u05df \u05dc\u05e4\u05d9 \u05d0\u05f3\u2013\u05ea\u05f3 \u05d0\u05d5 \u05dc\u05e4\u05d9 \u05de\u05e8\u05d7\u05e7."),
    ("screen", "04_synagogue_detail", "\u05db\u05e8\u05d8\u05d9\u05e1 \u05d1\u05d9\u05ea \u05db\u05e0\u05e1\u05ea",
     "\u05ea\u05de\u05d5\u05e0\u05d5\u05ea, \u05db\u05ea\u05d5\u05d1\u05ea, \u05e0\u05d5\u05e1\u05d7 \u05d5\u05e9\u05db\u05d5\u05e0\u05d4, \u05e4\u05e8\u05d8\u05d9 \u05d4\u05d2\u05d1\u05d0\u05d9, \u05e0\u05d9\u05d5\u05d5\u05d8 \u05d9\u05e9\u05d9\u05e8 \u05d5\u05d3\u05d9\u05d5\u05d5\u05d7 \u05e2\u05dc \u05de\u05d9\u05d3\u05e2 \u05e9\u05d2\u05d5\u05d9."),
    ("screen", "05_synagogue_detail_schedule", "\u05dc\u05d5\u05d7 \u05d4\u05d6\u05de\u05e0\u05d9\u05dd \u05e9\u05dc \u05d1\u05d9\u05ea \u05d4\u05db\u05e0\u05e1\u05ea",
     "\u05ea\u05e4\u05d9\u05dc\u05d5\u05ea \u05d4\u05d9\u05d5\u05dd \u05d5\u05dc\u05d5\u05d7 \u05e9\u05d1\u05d5\u05e2\u05d9 \u05de\u05dc\u05d0. \u05db\u05dc \u05ea\u05e4\u05d9\u05dc\u05d4 \u05ea\u05d5\u05de\u05db\u05ea \u05d1\u05db\u05de\u05d4 \u05de\u05e0\u05d9\u05d9\u05e0\u05d9\u05dd \u05d5\u05d1\u05d6\u05de\u05e0\u05d9\u05dd \u05d4\u05e0\u05d2\u05d6\u05e8\u05d9\u05dd \u05de\u05d4\u05e0\u05e5."),
    ("screen", "06_prayertimes", "\u05de\u05e0\u05d9\u05d9\u05e0\u05d9\u05dd \u05d1\u05e2\u05d9\u05e8",
     "\u05db\u05dc \u05d4\u05de\u05e0\u05d9\u05d9\u05e0\u05d9\u05dd \u05d4\u05e7\u05e8\u05d5\u05d1\u05d9\u05dd \u05dc\u05e4\u05d9 \u05e1\u05d5\u05d2 \u05ea\u05e4\u05d9\u05dc\u05d4, \u05de\u05de\u05d5\u05d9\u05e0\u05d9\u05dd \u05dc\u05e4\u05d9 \u05d4\u05d6\u05de\u05df \u05e9\u05e0\u05d5\u05ea\u05e8 \u05e2\u05d3 \u05ea\u05d7\u05d9\u05dc\u05ea\u05dd."),
    ("screen", "07_zmanim", "\u05d6\u05de\u05e0\u05d9 \u05d4\u05d9\u05d5\u05dd",
     "\u05de\u05e2\u05dc\u05d5\u05ea \u05d4\u05e9\u05d7\u05e8 \u05d5\u05e2\u05d3 \u05e6\u05d0\u05ea \u05d4\u05db\u05d5\u05db\u05d1\u05d9\u05dd, \u05dc\u05e4\u05d9 \u05e9\u05d9\u05d8\u05ea \u05d4\u05d7\u05d9\u05e9\u05d5\u05d1 \u05e9\u05e0\u05d1\u05d7\u05e8\u05d4 \u05d5\u05dc\u05e4\u05d9 \u05e7\u05d5 \u05d4\u05d0\u05d5\u05e8\u05da \u05d5\u05d4\u05e8\u05d5\u05d7\u05d1 \u05e9\u05dc \u05d4\u05e2\u05d9\u05e8."),
    ("screen", "02_selichot", "\u05e1\u05dc\u05d9\u05d7\u05d5\u05ea \u2014 \u05de\u05e1\u05da \u05e2\u05d5\u05e0\u05ea\u05d9",
     "\u05de\u05e0\u05d9\u05d9\u05e0\u05d9 \u05d4\u05e1\u05dc\u05d9\u05d7\u05d5\u05ea \u05de\u05e7\u05d5\u05d1\u05e6\u05d9\u05dd \u05dc\u05e4\u05d9 \u05dc\u05d9\u05dc\u05d4: \u05de\u05e0\u05d9\u05d9\u05df \u05d1\u05be00:15 \u05d9\u05d5\u05e4\u05d9\u05e2 \u05ea\u05d7\u05ea \u05dc\u05d9\u05dc \u05d0\u05ea\u05de\u05d5\u05dc. \u05e0\u05e4\u05ea\u05d7 \u05d5\u05e0\u05e1\u05d2\u05e8 \u05de\u05d0\u05dc\u05d9\u05d5."),

    ("chapter", 3, "\u05db\u05e9\u05e8\u05d5\u05ea \u05d5\u05e2\u05e1\u05e7\u05d9\u05dd",
     "\u05d1\u05ea\u05d9 \u05d4\u05d0\u05d5\u05db\u05dc \u05d5\u05d4\u05e2\u05e1\u05e7\u05d9\u05dd \u05d1\u05e2\u05d9\u05e8, \u05d5\u05d4\u05ea\u05e2\u05d5\u05d3\u05d5\u05ea \u05e9\u05de\u05d0\u05d7\u05d5\u05e8\u05d9\u05d4\u05dd"),
    ("screen", "08_businesses", "\u05e2\u05e1\u05e7\u05d9\u05dd \u05db\u05e9\u05e8\u05d9\u05dd",
     "\u05e8\u05de\u05ea \u05d4\u05db\u05e9\u05e8\u05d5\u05ea \u05d5\u05d4\u05d2\u05d5\u05e8\u05dd \u05d4\u05de\u05db\u05e9\u05d9\u05e8 \u05dc\u05db\u05dc \u05e2\u05e1\u05e7, \u05e1\u05d9\u05e0\u05d5\u05df \u05dc\u05e4\u05d9 \u05e1\u05d5\u05d2 \u05d5\u05d0\u05d5\u05e4\u05d9, \u05d5\u05ea\u05e6\u05d5\u05d2\u05ea \u05de\u05e4\u05d4."),
    ("screen", "09_business_detail", "\u05db\u05e8\u05d8\u05d9\u05e1 \u05e2\u05e1\u05e7",
     "\u05ea\u05e2\u05d5\u05d3\u05ea \u05d4\u05db\u05e9\u05e8\u05d5\u05ea \u05d5\u05ea\u05d0\u05e8\u05d9\u05da \u05d4\u05ea\u05d5\u05e7\u05e3 \u05e9\u05dc\u05d4, \u05e9\u05e2\u05d5\u05ea \u05e4\u05e2\u05d9\u05dc\u05d5\u05ea, \u05d7\u05d9\u05d5\u05d2 \u05d5\u05e0\u05d9\u05d5\u05d5\u05d8."),
    ("screen", "36_kashrut_updates", "\u05e2\u05d3\u05db\u05d5\u05e0\u05d9 \u05db\u05e9\u05e8\u05d5\u05ea",
     "\u05e9\u05d3\u05e8\u05d5\u05d2 \u05db\u05e9\u05e8\u05d5\u05ea \u05d1\u05d9\u05e8\u05d5\u05e7, \u05d9\u05e8\u05d9\u05d3\u05ea \u05db\u05e9\u05e8\u05d5\u05ea \u05d1\u05d0\u05d3\u05d5\u05dd. \u05db\u05dc \u05e2\u05d3\u05db\u05d5\u05df \u05e0\u05e9\u05dc\u05d7 \u05db\u05d4\u05ea\u05e8\u05d0\u05d4 \u05dc\u05db\u05dc \u05ea\u05d5\u05e9\u05d1\u05d9 \u05d4\u05e2\u05d9\u05e8."),

    ("chapter", 4, "\u05de\u05e7\u05d5\u05d5\u05d0\u05d5\u05ea \u05d5\u05ea\u05d5\u05e8\u05d9\u05dd",
     "\u05e9\u05e2\u05d5\u05ea \u05d4\u05e4\u05ea\u05d9\u05d7\u05d4, \u05d5\u05de\u05e2\u05e8\u05db\u05ea \u05d4\u05ea\u05d5\u05e8\u05d9\u05dd \u05e9\u05de\u05d0\u05d7\u05d5\u05e8\u05d9\u05d4\u05df"),
    ("screen", "10_mikveh", "\u05e8\u05e9\u05d9\u05de\u05ea \u05de\u05e7\u05d5\u05d5\u05d0\u05d5\u05ea",
     "\u05de\u05e7\u05d5\u05d5\u05d0\u05d5\u05ea \u05e0\u05e9\u05d9\u05dd \u05d5\u05d2\u05d1\u05e8\u05d9\u05dd, \u05e9\u05e2\u05d5\u05ea \u05d4\u05e4\u05ea\u05d9\u05d7\u05d4 \u05e9\u05dc \u05d4\u05d9\u05d5\u05dd, \u05d5\u05e1\u05d9\u05e0\u05d5\u05df \u05dc\u05e4\u05d9 \u05e9\u05db\u05d5\u05e0\u05d4 \u05d5\u05e1\u05d5\u05d2."),
    ("screen", "12_appointment_booking", "\u05e7\u05d1\u05d9\u05e2\u05ea \u05ea\u05d5\u05e8",
     "\u05d1\u05d7\u05d9\u05e8\u05ea \u05e1\u05d5\u05d2 \u05d8\u05d1\u05d9\u05dc\u05d4 \u05d5\u05de\u05e9\u05d1\u05e6\u05ea \u05e4\u05e0\u05d5\u05d9\u05d4, \u05e2\u05dd \u05d7\u05d9\u05d5\u05d5\u05d9 \u05e4\u05e0\u05d5\u05d9 / \u05ea\u05e4\u05d5\u05e1 / \u05e9\u05dc\u05d9."),

    ("chapter", 5, "\u05e7\u05d4\u05d9\u05dc\u05d4",
     "\u05de\u05d4 \u05e9\u05e7\u05d5\u05e8\u05d4 \u05d1\u05e2\u05d9\u05e8 \u05de\u05d7\u05d5\u05e5 \u05dc\u05d1\u05d9\u05ea \u05d4\u05db\u05e0\u05e1\u05ea"),
    ("screen", "14_events", "\u05d0\u05d9\u05e8\u05d5\u05e2\u05d9\u05dd \u05d5\u05d4\u05d5\u05d3\u05e2\u05d5\u05ea",
     "\u05d4\u05d5\u05d3\u05e2\u05d5\u05ea \u05d4\u05e8\u05d1\u05e0\u05d5\u05ea \u05d5\u05d4\u05e7\u05d4\u05d9\u05dc\u05d4, \u05e9\u05d9\u05e2\u05d5\u05e8\u05d9\u05dd \u05d5\u05d0\u05d9\u05e8\u05d5\u05e2\u05d9\u05dd. \u05d4\u05d5\u05d3\u05e2\u05d4 \u05d3\u05d7\u05d5\u05e4\u05d4 \u05de\u05e7\u05d1\u05dc\u05ea \u05ea\u05d2 \u05d0\u05d3\u05d5\u05dd \u05e2\u05d3 \u05e9\u05e0\u05e7\u05e8\u05d0\u05d4."),
    ("screen", "16_eruv", "\u05e2\u05d9\u05e8\u05d5\u05d1",
     "\u05de\u05e6\u05d1 \u05d4\u05e2\u05d9\u05e8\u05d5\u05d1 \u05dc\u05e9\u05d1\u05ea \u05d4\u05e7\u05e8\u05d5\u05d1\u05d4, \u05de\u05e4\u05ea \u05d4\u05d2\u05d1\u05d5\u05dc\u05d5\u05ea \u05d4\u05de\u05dc\u05d0\u05d4, \u05d5\u05db\u05e4\u05ea\u05d5\u05e8 \u05d3\u05d9\u05d5\u05d5\u05d7 \u05e2\u05dc \u05e4\u05d2\u05dd."),
    ("screen", "17_gemach", "\u05d2\u05de\u05f4\u05d7",
     "\u05d2\u05de\u05f4\u05d7\u05d9 \u05d4\u05e2\u05d9\u05e8 \u05dc\u05e4\u05d9 \u05e7\u05d8\u05d2\u05d5\u05e8\u05d9\u05d4, \u05e2\u05dd \u05d7\u05d9\u05d5\u05d2 \u05d9\u05e9\u05d9\u05e8 \u05dc\u05d0\u05d7\u05e8\u05d0\u05d9. \u05db\u05dc \u05ea\u05d5\u05e9\u05d1 \u05d9\u05db\u05d5\u05dc \u05dc\u05d4\u05d2\u05d9\u05e9 \u05d2\u05de\u05f4\u05d7 \u05dc\u05d0\u05d9\u05e9\u05d5\u05e8."),

    ("chapter", 6, "\u05d0\u05d6\u05d5\u05e8 \u05d4\u05e0\u05d9\u05d4\u05d5\u05dc",
     "\u05db\u05dc \u05de\u05d5\u05d3\u05d5\u05dc \u05de\u05e0\u05d5\u05d4\u05dc \u05d1\u05e0\u05e4\u05e8\u05d3, \u05d1\u05d9\u05d3\u05d9 \u05d1\u05e2\u05dc \u05d4\u05ea\u05e4\u05e7\u05d9\u05d3 \u05e9\u05d0\u05d7\u05e8\u05d0\u05d9 \u05e2\u05dc\u05d9\u05d5"),
    ("screen", "20_manage_synagogue", "\u05e0\u05d9\u05d4\u05d5\u05dc \u05d1\u05d9\u05ea \u05db\u05e0\u05e1\u05ea",
     "\u05d4\u05d2\u05d1\u05d0\u05d9 \u05de\u05e2\u05d3\u05db\u05df \u05d1\u05e2\u05e6\u05de\u05d5 \u05d0\u05ea \u05d6\u05de\u05e0\u05d9 \u05d4\u05ea\u05e4\u05d9\u05dc\u05d5\u05ea, \u05d4\u05e9\u05d9\u05e2\u05d5\u05e8\u05d9\u05dd \u05d5\u05e4\u05e8\u05d8\u05d9 \u05d4\u05e7\u05e9\u05e8 \u05e9\u05dc \u05d1\u05d9\u05ea \u05d4\u05db\u05e0\u05e1\u05ea \u05e9\u05dc\u05d5."),
    ("screen", "34_manage_kosher_cert", "\u05e2\u05e8\u05d9\u05db\u05ea \u05ea\u05e2\u05d5\u05d3\u05d5\u05ea \u05db\u05e9\u05e8\u05d5\u05ea",
     "\u05db\u05dc \u05ea\u05e2\u05d5\u05d3\u05d4 \u05d1\u05e0\u05e4\u05e8\u05d3 \u2014 \u05d2\u05d5\u05e8\u05dd \u05de\u05db\u05e9\u05d9\u05e8, \u05e8\u05de\u05d4, \u05ea\u05d0\u05e8\u05d9\u05da \u05ea\u05d5\u05e7\u05e3 \u05d5\u05e6\u05d9\u05dc\u05d5\u05dd \u05d4\u05ea\u05e2\u05d5\u05d3\u05d4 \u05e2\u05e6\u05de\u05d4."),
    ("screen", "35_kashrut_publish_confirm", "\u05e4\u05e8\u05e1\u05d5\u05dd \u05d1\u05e9\u05dc\u05d9\u05d8\u05ea \u05d4\u05de\u05e0\u05d4\u05dc",
     "\u05d4\u05de\u05e2\u05e8\u05db\u05ea \u05de\u05d6\u05d4\u05d4 \u05dc\u05d1\u05d3 \u05de\u05d4 \u05d4\u05e9\u05ea\u05e0\u05d4 \u05d5\u05e9\u05d5\u05d0\u05dc\u05ea \u05de\u05d4 \u05dc\u05e4\u05e8\u05e1\u05dd. \u05e8\u05e7 \u05de\u05d4 \u05e9\u05e1\u05d5\u05de\u05df \u05e0\u05e9\u05dc\u05d7 \u05db\u05d4\u05ea\u05e8\u05d0\u05d4 \u05dc\u05e2\u05d9\u05e8."),
    ("screen", "27_manage_users", "\u05ea\u05e4\u05e7\u05d9\u05d3\u05d9\u05dd \u05d5\u05d4\u05e8\u05e9\u05d0\u05d5\u05ea",
     "\u05d4\u05e2\u05e0\u05e7\u05ea \u05ea\u05e4\u05e7\u05d9\u05d3\u05d9\u05dd \u05dc\u05d1\u05e2\u05dc\u05d9 \u05ea\u05e4\u05e7\u05d9\u05d3 \u05d1\u05e2\u05d9\u05e8. \u05db\u05e0\u05d9\u05e1\u05d4 \u05dc\u05d0\u05d6\u05d5\u05e8 \u05d4\u05e0\u05d9\u05d4\u05d5\u05dc \u05d3\u05d5\u05e8\u05e9\u05ea \u05d0\u05d9\u05de\u05d5\u05ea \u05d1\u05d9\u05d5\u05de\u05d8\u05e8\u05d9 \u05e0\u05d5\u05e1\u05e3."),

    ("chapter", 7, "\u05e9\u05d1\u05ea", "\u05de\u05e1\u05da \u05e9\u05d4\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4 \u05de\u05e6\u05d9\u05d2\u05d4 \u05de\u05e2\u05e6\u05de\u05d4"),
    ("screen", "32_shabbat_closed", "\u05d4\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4 \u05e0\u05d5\u05e2\u05dc\u05ea \u05d0\u05ea \u05e2\u05e6\u05de\u05d4",
     "\u05de\u05d4\u05d3\u05dc\u05e7\u05ea \u05e0\u05e8\u05d5\u05ea \u05d5\u05e2\u05d3 \u05e6\u05d0\u05ea \u05d4\u05e9\u05d1\u05ea, \u05e2\u05dd \u05e9\u05e2\u05ea \u05d4\u05e4\u05ea\u05d9\u05d7\u05d4 \u05de\u05d7\u05d3\u05e9. \u05d0\u05d9\u05df \u05d3\u05e8\u05da \u05dc\u05e2\u05e7\u05d5\u05e3."),
]

EYEBROW = "\u05e7\u05d4\u05d9\u05dc\u05d4 \u00b7 \u05de\u05e2\u05dc\u05d4 \u05d0\u05d3\u05d5\u05de\u05d9\u05dd"
CHAPTER_KICKER = "\u05e4\u05e8\u05e7"
TITLE_NAME = "\u05e7\u05d4\u05d9\u05dc\u05d4"
TITLE_LEDE = "\u05db\u05dc \u05de\u05d4 \u05e9\u05ea\u05d5\u05e9\u05d1 \u05e6\u05e8\u05d9\u05da \u05dc\u05d3\u05e2\u05ea \u05e2\u05dc \u05d4\u05e2\u05d9\u05e8 \u05e9\u05dc\u05d5 \u2014 \u05d1\u05de\u05e7\u05d5\u05dd \u05d0\u05d7\u05d3."
TITLE_FACTS = "\u05de\u05e2\u05dc\u05d4 \u05d0\u05d3\u05d5\u05de\u05d9\u05dd \u00b7 69 \u05d1\u05ea\u05d9 \u05db\u05e0\u05e1\u05ea \u00b7 9 \u05de\u05d5\u05d3\u05d5\u05dc\u05d9\u05dd"
END_KICKER = "\u05de\u05d5\u05db\u05df \u05dc\u05d4\u05e8\u05d7\u05d1\u05d4"
END_TITLE = "\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4 \u05d0\u05d7\u05ea, \u05db\u05dc \u05e2\u05d9\u05e8"
END_BLURB = "\u05d4\u05de\u05e2\u05e8\u05db\u05ea \u05d1\u05e0\u05d5\u05d9\u05d4 \u05dc\u05e8\u05d9\u05d1\u05d5\u05d9 \u05e2\u05e8\u05d9\u05dd \u05de\u05d4\u05d9\u05e1\u05d5\u05d3 \u2014 \u05db\u05dc \u05e2\u05d9\u05e8 \u05e2\u05dd \u05d1\u05ea\u05d9 \u05d4\u05db\u05e0\u05e1\u05ea, \u05d4\u05e2\u05e1\u05e7\u05d9\u05dd, \u05d4\u05de\u05e7\u05d5\u05d5\u05d0\u05d5\u05ea \u05d5\u05d4\u05de\u05e0\u05d4\u05dc\u05d9\u05dd \u05e9\u05dc\u05d4."
END_L1 = "9 \u05de\u05d5\u05d3\u05d5\u05dc\u05d9\u05dd \u00b7 43 \u05de\u05e1\u05db\u05d9\u05dd \u00b7 \u05e0\u05d9\u05d4\u05d5\u05dc \u05dc\u05e4\u05d9 \u05ea\u05e4\u05e7\u05d9\u05d3\u05d9\u05dd"
END_L2 = "\u05e0\u05dc\u05db\u05d3 \u05de\u05d4\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4 \u05e2\u05e6\u05de\u05d4, \u05e2\u05dc \u05de\u05db\u05e9\u05d9\u05e8 \u05d0\u05de\u05d9\u05ea\u05d9"


class Layout:
    """Geometry and plate builders for one aspect ratio."""

    def __init__(self, wide):
        self.wide = wide
        if wide:
            self.W, self.H = 1920, 1080
            self.SH = 880
            self.SW = round(self.SH * 1080 / 2340)
            self.sx = self.W - 240 - self.SW
            self.sy = 100
            self.cap_x, self.cap_w = 150, 950
            self.cap_y = 400
            self.t_size, self.b_size = 60, 34
        else:
            self.W, self.H = 1080, 1920
            self.SH = 1240
            self.SW = round(self.SH * 1080 / 2340)
            self.sx = (self.W - self.SW) // 2
            self.sy = 248
            self.cap_x, self.cap_w = 90, self.W - 180
            self.cap_y = 1572
            self.t_size, self.b_size = 54, 32

        self.bez = 13
        self.r_scr = 34
        self.r_dev = 46

        self.f_title = font(F_BOLD, self.t_size)
        self.f_body = font(F_REG, self.b_size)
        self.f_chip = font(F_BOLD, 26)
        self.f_eye = font(F_BOLD, 24)

        self.bg = self._background()
        self.plain = self._card_bg()   # the colour every card transition dips through
        self.bezel = self._bezel()
        self.mask = self._screen_mask()

    # -- plates ---------------------------------------------------------
    def _background(self):
        W, H = self.W, self.H
        bg = Image.new("RGB", (W, H), NAVY_DEEP)
        d = ImageDraw.Draw(bg)
        for y in range(H):
            t = (1 - y / H) ** 1.6
            d.line([(0, y), (W, y)],
                   fill=tuple(round(NAVY_DEEP[i] + (NAVY[i] - NAVY_DEEP[i]) * t * 0.55)
                              for i in range(3)))
        glow = Image.new("L", (W, H), 0)
        gd = ImageDraw.Draw(glow)
        cx, cy = self.sx + self.SW // 2, self.sy + self.SH // 2
        gd.ellipse([cx - self.SW, cy - self.SH // 2, cx + self.SW, cy + self.SH // 2], fill=42)
        glow = glow.filter(ImageFilter.GaussianBlur(160))
        bg = Image.composite(Image.new("RGB", (W, H), GOLD), bg, glow)

        sh = Image.new("L", (W, H), 0)
        sd = ImageDraw.Draw(sh)
        sd.rounded_rectangle(
            [self.sx - self.bez, self.sy - self.bez + 26,
             self.sx + self.SW + self.bez, self.sy + self.SH + self.bez + 26],
            radius=self.r_dev, fill=150)
        sh = sh.filter(ImageFilter.GaussianBlur(38))
        return Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), bg, sh)

    def _bezel(self):
        dw, dh = self.SW + 2 * self.bez, self.SH + 2 * self.bez
        im = Image.new("RGBA", (dw, dh), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle([0, 0, dw - 1, dh - 1], radius=self.r_dev, fill=(9, 13, 22, 255))
        d.rounded_rectangle([0, 0, dw - 1, dh - 1], radius=self.r_dev,
                            outline=(255, 255, 255, 46), width=2)
        d.rounded_rectangle([self.bez, self.bez, self.bez + self.SW - 1, self.bez + self.SH - 1],
                            radius=self.r_scr, fill=(0, 0, 0, 0))
        return im

    def _screen_mask(self):
        m = Image.new("L", (self.SW, self.SH), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, self.SW - 1, self.SH - 1],
                                            radius=self.r_scr, fill=255)
        return m

    # -- text -----------------------------------------------------------
    def wrap(self, text, f, maxw):
        d = ImageDraw.Draw(Image.new("RGB", (8, 8)))
        lines, cur = [], ""
        for w in text.split():
            t = (cur + " " + w).strip()
            if d.textlength(rtl(t), font=f) <= maxw:
                cur = t
            else:
                if cur:
                    lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        return lines

    def draw_rtl(self, d, xy, text, f, fill):
        s = rtl(text)
        x, y = xy
        d.text((x - d.textlength(s, font=f), y), s, font=f, fill=fill)

    def chrome(self, chapter):
        """Eyebrow + chapter chip, shared by every screen in a chapter."""
        im = Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        if self.wide:
            self.draw_rtl(d, (self.cap_x + self.cap_w, 130), EYEBROW, self.f_eye, GOLD + (255,))
            right, y = self.cap_x + self.cap_w, 220
        else:
            s = rtl(EYEBROW)
            d.text(((self.W - d.textlength(s, font=self.f_eye)) / 2, 60), s,
                   font=self.f_eye, fill=GOLD + (255,))
            y = 124
            right = None
        tw = d.textlength(rtl(chapter), font=self.f_chip)
        pad, h = 22, 46
        if right is None:
            right = int(self.W // 2 + (tw + 2 * pad) // 2)
        d.rounded_rectangle([right - tw - 2 * pad, y, right, y + h], radius=h // 2,
                            fill=(255, 255, 255, 26), outline=GOLD + (110,), width=1)
        self.draw_rtl(d, (right - pad, y + 8), chapter, self.f_chip, GOLD + (255,))
        return im

    def caption(self, title, body):
        im = Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        right = self.cap_x + self.cap_w
        y = self.cap_y
        d.rounded_rectangle([right - 64, y, right, y + 6], radius=3, fill=GOLD + (255,))
        y += 30
        self.draw_rtl(d, (right, y), title, self.f_title, INK + (255,))
        y += int(self.t_size * 1.45)
        for line in self.wrap(body, self.f_body, self.cap_w):
            self.draw_rtl(d, (right, y), line, self.f_body, INK_2 + (255,))
            y += int(self.b_size * 1.5)
        return im

    # -- full-frame cards -----------------------------------------------
    def _card_bg(self):
        im = Image.new("RGB", (self.W, self.H), NAVY_DEEP)
        d = ImageDraw.Draw(im)
        for y in range(self.H):
            t = (1 - y / self.H) ** 1.4
            d.line([(0, y), (self.W, y)],
                   fill=tuple(round(NAVY_DEEP[i] + (NAVY[i] - NAVY_DEEP[i]) * t * 0.7)
                              for i in range(3)))
        return im

    def card(self, kicker, title, blurb, title_size=None, above=0, below=0):
        """`above`/`below` reserve room for art or extra lines the caller adds,
        so the whole composition ends up optically centred."""
        im = self._card_bg()
        d = ImageDraw.Draw(im)
        cw = min(1240, self.W - 140)
        right = (self.W + cw) // 2
        ft = font(F_BOLD, title_size or 84)
        fb = font(F_REG, 38)
        tl = self.wrap(title, ft, cw)
        bl = self.wrap(blurb, fb, cw)
        block = ((52 if kicker else 0) + len(tl) * int(ft.size * 1.2) + 98
                 + len(bl) * int(fb.size * 1.5))
        y = (self.H - (above + block + below)) // 2 + above
        top = y
        if kicker:
            self.draw_rtl(d, (right, y), kicker, self.f_eye, GOLD)
            y += 52
        for line in tl:
            self.draw_rtl(d, (right, y), line, ft, INK)
            y += int(ft.size * 1.2)
        y += 44
        d.rounded_rectangle([right - 88, y, right, y + 7], radius=3, fill=GOLD)
        y += 54
        for line in bl:
            self.draw_rtl(d, (right, y), line, fb, INK_2)
            y += int(fb.size * 1.5)
        return im, right, y, top

    def question_card(self, text):
        """Cold-open card: one question, large, with an oversized gold question
        mark bled off the edge behind it."""
        im = self._card_bg()
        d = ImageDraw.Draw(im)
        cw = min(1240, self.W - 140)
        right = (self.W + cw) // 2

        mark = font(F_BOLD, 620)
        glyph = Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))
        ImageDraw.Draw(glyph).text(
            (self.cap_x - 120, self.H // 2 - 430), "?", font=mark, fill=GOLD + (30,))
        im.paste(glyph, (0, 0), glyph)

        ft = font(F_BOLD, 76 if not self.wide else 68)
        lines = self.wrap(text, ft, cw)
        y = (self.H - len(lines) * int(ft.size * 1.32)) // 2
        for line in lines:
            self.draw_rtl(d, (right, y), line, ft, INK)
            y += int(ft.size * 1.32)
        return im

    def title_card(self):
        s, gap = 190, 54
        im, right, y, top = self.card("", TITLE_NAME, TITLE_LEDE, title_size=132,
                                      above=s + gap, below=64)
        d = ImageDraw.Draw(im)
        icon = Image.open(os.path.join(ROOT, "assets", "icon.png")).convert("RGBA")
        icon = icon.resize((s, s), Image.LANCZOS)
        m = Image.new("L", (s, s), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, s - 1, s - 1], radius=44, fill=255)
        im.paste(icon, (right - s, top - s - gap), m)
        self.draw_rtl(d, (right, y + 30), TITLE_FACTS, font(F_REG, 34), MUTED)
        return im

    def end_card(self):
        im, right, y, _ = self.card(END_KICKER, END_TITLE, END_BLURB, below=140)
        d = ImageDraw.Draw(im)
        y += 46
        self.draw_rtl(d, (right, y), END_L1, font(F_BOLD, 34), GOLD)
        self.draw_rtl(d, (right, y + 54), END_L2, font(F_REG, 32), MUTED)
        return im


def load_manifest():
    p = os.path.join(NARR, "manifest.json")
    if not os.path.exists(p):
        return {}
    with open(p, encoding="utf-8") as f:
        return json.load(f)["clips"]


def read_wav(path):
    with wave.open(path) as w:
        ch = w.getnchannels()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768
    return x.reshape(-1, ch) if ch > 1 else x.reshape(-1, 1)


def write_wav(path, stereo):
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(stereo, -1, 1) * 32767).astype("<i2").tobytes())


def load_track(path, need):
    """Decode a licensed track, loop it to `need` samples with a crossfade at
    the seam, and match the synthesised bed's headroom so MUSIC_LEVEL means the
    same thing either way."""
    tmp = os.path.join(OUT, ".track.wav")
    subprocess.run(["ffmpeg", "-y", "-i", path, "-ar", str(SR), "-ac", "2",
                    tmp, "-loglevel", "error"], check=True)
    x = read_wav(tmp)
    os.remove(tmp)

    if x.shape[0] < need:
        xf = min(int(1.5 * SR), x.shape[0] // 4)
        fade = np.linspace(0, 1, xf)[:, None]
        out = x
        while out.shape[0] < need:
            seam = out[-xf:] * (1 - fade) + x[:xf] * fade
            out = np.concatenate([out[:-xf], seam, x[xf:]])
        x = out
    x = x[:need]

    x /= np.max(np.abs(x)) + 1e-9
    x *= 0.5
    fi, fo = int(min(0.6, need / SR * 0.015) * SR), int(min(4.0, need / SR * 0.09) * SR)
    x[:fi] *= np.linspace(0, 1, fi)[:, None]
    x[-fo:] *= np.linspace(1, 0, fo)[:, None]
    return x


def build_audio(cues, total_s, path):
    """cues: [(scene_id, start_seconds)]. Lays the narration onto a timeline,
    generates a music bed of the right length, and ducks it under the speech."""
    n = int(total_s * SR) + SR
    voice = np.zeros(n, dtype=np.float32)
    for scene, start in cues:
        clip = os.path.join(NARR, scene + ".wav")
        if not os.path.exists(clip):
            continue
        c = read_wav(clip)[:, 0]
        s = int(start * SR)
        voice[s:s + c.size] += c[: max(0, n - s)]

    if os.path.exists(MUSIC_TRACK):
        raw = os.path.join(OUT, ".bed-src.wav")
        write_wav(raw, load_track(MUSIC_TRACK, n))
    else:
        subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "make_music_bed.py"),
                        "%.2f" % (total_s + 1)], check=True, capture_output=True)
        raw = os.path.join(OUT, "music-bed.wav")

    # A bed's own quiet passages fall away under the voice - the synth pad
    # swells, a real track has verses. Level it first, then one gain sets
    # where it sits.
    lev = os.path.join(OUT, ".music-levelled.wav")
    subprocess.run(["ffmpeg", "-y", "-i", raw, "-af", "dynaudnorm=f=250:g=15:p=0.65",
                    "-ar", str(SR), lev, "-loglevel", "error"], check=True)
    music = read_wav(lev)
    os.remove(lev)
    if raw.endswith(".bed-src.wav"):
        os.remove(raw)
    if music.shape[0] < n:
        music = np.pad(music, ((0, n - music.shape[0]), (0, 0)))
    music = music[:n]

    # Envelope-follow the voice, then pull the bed down wherever it speaks.
    # Symmetric smoothing kept the bed suppressed through every short gap, so
    # this is a proper follower: instant attack, gradual release.
    blk = 256
    pad = (-voice.size) % blk
    peaks = np.abs(np.pad(voice, (0, pad))).reshape(-1, blk).max(axis=1)
    coef = np.exp(-blk / (DUCK_RELEASE * SR))
    held = np.empty_like(peaks)
    acc = 0.0
    for i, p in enumerate(peaks):
        acc = p if p > acc else acc * coef
        held[i] = acc
    env = np.repeat(held, blk)[: voice.size]
    win = max(1, int(DUCK_ATTACK * SR))
    env = np.convolve(env, np.ones(win) / win, mode="same")
    env /= np.max(env) + 1e-9
    gain = 1.0 - DUCK * np.clip(env * 2.2, 0, 1)

    mix = music * (MUSIC_LEVEL * gain)[:, None]
    mix += (voice * 0.97)[:, None]
    peak = np.max(np.abs(mix))
    if peak > 0.97:
        mix *= 0.97 / peak
    write_wav(path, mix)


def build(wide, silent=False, short=False):
    lay = Layout(wide)
    tag = "wide" if wide else "vertical"
    if short:
        tag = "short-" + tag
    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, "kehila-demo-%s.mp4" % tag)
    tmp = os.path.join(OUT, ".silent-%s.mp4" % tag)
    lead, tail = (SHORT_LEAD, SHORT_TAIL) if short else (LEAD, TAIL)

    clips = {} if silent else load_manifest()

    def hold_for(sid, default):
        """A scene lasts as long as its line needs; without narration it keeps
        the fixed timing."""
        if sid in clips:
            return max(MIN_HOLD, lead + clips[sid]["dur"] + tail)
        return default

    screens, steps, ids = {}, [], []
    chrome = None
    for sc in SCENES:
        if sc[0] == "chapter":
            sid = "ch%d" % sc[1]
            chrome = lay.chrome(sc[2])
            steps.append(("card", lay.card("%s %d" % (CHAPTER_KICKER, sc[1]), sc[2], sc[3])[0],
                          hold_for(sid, CHAPTER_HOLD)))
            ids.append(sid)
        else:
            _, name, title, body = sc
            img = Image.open(shot(name)).convert("RGB") \
                       .resize((lay.SW, lay.SH), Image.LANCZOS)
            screens[name] = img
            rest = lay.bg.copy()
            rest.paste(img, (lay.sx, lay.sy), lay.mask)
            rest.paste(lay.bezel, (lay.sx - lay.bez, lay.sy - lay.bez), lay.bezel)
            rest.paste(chrome, (0, 0), chrome)
            cap = lay.caption(title, body)
            full = rest.copy()
            full.paste(cap, (0, 0), cap)
            steps.append(("screen", name, rest, cap, full, chrome,
                          hold_for(name, SCREEN_HOLD)))
            ids.append(name)

    steps.insert(0, ("card", lay.title_card(), hold_for("title", TITLE_HOLD)))
    ids.insert(0, "title")
    for hid, text in reversed(HOOKS):
        steps.insert(0, ("card", lay.question_card(text), hold_for(hid, 2.6)))
        ids.insert(0, hid)
    steps.append(("card", lay.end_card(), hold_for("end", END_HOLD)))
    ids.append("end")

    if short:
        keep = {sid: i for i, sid in enumerate(SHORT_REEL)}
        picked = sorted((i for i, sid in enumerate(ids) if sid in keep),
                        key=lambda i: keep[ids[i]])
        missing = [s for s in SHORT_REEL if s not in ids]
        if missing:
            raise SystemExit("short reel references unknown scenes: %s"
                             % ", ".join(missing))
        steps = [steps[i] for i in picked]
        ids = [ids[i] for i in picked]

    tf = round(TRANS * FPS)
    tfc = round(TRANS_CARD * FPS)

    def is_push(i):
        return i > 0 and steps[i][0] == "screen" and steps[i - 1][0] == "screen"

    total = (sum(round(s[-1] * FPS) for s in steps)
             + sum(tf if is_push(i) else tfc for i in range(1, len(steps))))

    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", "%dx%d" % (lay.W, lay.H), "-r", str(FPS), "-i", "-",
         "-c:v", "libx264", "-preset", "medium", "-crf", "20",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", tmp],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    n = [0]
    cues = []
    bar_x, bar_w, bar_y = 90, lay.W - 180, lay.H - 34

    def emit(frame):
        f = frame.copy()
        d = ImageDraw.Draw(f)
        d.rounded_rectangle([bar_x, bar_y, bar_x + bar_w, bar_y + 5], radius=3, fill=(46, 62, 90))
        p = min(1.0, n[0] / max(1, total - 1))
        # RTL: the bar fills from the right edge
        d.rounded_rectangle([bar_x + bar_w - int(bar_w * p), bar_y, bar_x + bar_w, bar_y + 5],
                            radius=3, fill=GOLD)
        proc.stdin.write(f.tobytes())
        n[0] += 1

    def rest_of(step):
        return step[1] if step[0] == "card" else step[4]

    for i, step in enumerate(steps):
        if i > 0:
            prev = steps[i - 1]
            if is_push(i):
                # Push navigation: in an RTL app the incoming screen enters from the left.
                head = step[5]
                for k in range(tf):
                    t = ease((k + 1) / tf)
                    off = int(lay.SW * t)
                    layer = Image.new("RGB", (lay.SW, lay.SH), NAVY_DEEP)
                    layer.paste(screens[prev[1]], (off, 0))
                    layer.paste(screens[step[1]], (off - lay.SW, 0))
                    base = lay.bg.copy()
                    base.paste(layer, (lay.sx, lay.sy), lay.mask)
                    base.paste(lay.bezel, (lay.sx - lay.bez, lay.sy - lay.bez), lay.bezel)
                    base.paste(head, (0, 0), head)
                    cf = step[3].copy()
                    cf.putalpha(cf.getchannel("A").point(lambda a, t=t: int(a * t)))
                    base.paste(cf, (0, 0), cf)
                    emit(base)
            else:
                # Dip through the flat background rather than cross-dissolving two
                # busy plates on top of each other.
                a, b = rest_of(prev), rest_of(step)
                out_n = tfc // 2
                in_n = tfc - out_n
                for k in range(out_n):
                    emit(Image.blend(a, lay.plain, (k + 1) / out_n))
                for k in range(in_n):
                    emit(Image.blend(lay.plain, b, ease((k + 1) / in_n)))
        cues.append((ids[i], n[0] / FPS + lead))
        plate = rest_of(step)
        for _ in range(round(step[-1] * FPS)):
            emit(plate)

    proc.stdin.close()
    proc.wait()
    secs = n[0] / FPS

    if silent:
        os.replace(tmp, out)
        print("%s  %d frames  %.1fs  (no audio)" % (out, n[0], secs))
        return

    wav = os.path.join(OUT, "mix-%s.wav" % tag)
    build_audio(cues, secs, wav)
    # loudnorm lands it near the -16 LUFS that social platforms expect, and
    # caps true peak so the AAC encode cannot clip.
    subprocess.run(["ffmpeg", "-y", "-i", tmp, "-i", wav, "-c:v", "copy",
                    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-c:a", "aac", "-b:a", "192k", "-shortest",
                    "-movflags", "+faststart", out, "-loglevel", "error"], check=True)
    os.remove(tmp)
    os.remove(wav)
    print("%s  %d frames  %.1fs  (narration + music)" % (out, n[0], secs))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--wide", action="store_true")
    ap.add_argument("--silent", action="store_true",
                    help="skip narration and music; keep the fixed scene timing")
    ap.add_argument("--short", action="store_true",
                    help="the ~45s cut: SHORT_REEL only, no chapter cards")
    ap.add_argument("--music", metavar="PATH",
                    help="install a licensed track as the bed and use it from "
                         "now on, in place of the synthesised one")
    a = ap.parse_args()
    if a.music:
        import shutil
        shutil.copyfile(a.music, MUSIC_TRACK)
        print("music bed installed: %s" % MUSIC_TRACK)
    build(a.wide, a.silent, a.short)
