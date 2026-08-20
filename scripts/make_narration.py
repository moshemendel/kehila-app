# -*- coding: utf-8 -*-
"""
The narration script for the promo reel, and a synthesiser for a rough draft
of it using Microsoft Edge TTS.

    python scripts/make_narration.py              # draft voice via Edge TTS
    python scripts/make_narration.py --export     # write the script out, no TTS

--export produces narration-script.md, narration-script.txt and
elevenlabs-prompt.md, for recording the real voice elsewhere. Bring the audio
back with scripts/import_narration.py.

SCRIPT is the single source of truth: (scene_id, hebrew_name, text).
  scene_id   - matches make_demo_video.py; keep it ASCII, the pipeline uses it
  hebrew_name- what the audio file should be called; numbered on export
  text       - the spoken line

Numbers are spelled out in words - TTS reads digits inconsistently inside
Hebrew sentences.
"""
import argparse
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "promo", "narration")
PROMO = os.path.join(ROOT, "assets", "promo")

VOICE = "he-IL-AvriNeural"
RATE = "-4%"

SCRIPT = [
    # ── פתיחה ──────────────────────────────────────────────────────────
    ("hook1", "פתיחה-שאלה-1",
     "חיפשתם פעם מניין, ולא מצאתם?"),
    ("hook2", "פתיחה-שאלה-2",
     "רציתם לברר על הכשרות של מסעדה, ולא ידעתם את מי לשאול?"),
    ("hook3", "פתיחה-שאלה-3",
     "תהיתם אם העירוב תקין, מתי המקווה נפתח, או מאיפה משאילים מיטת תינוק?"),
    ("title", "פתיחה-קהילה",
     "מעכשיו, יש את קהילה. כל מה שתושב צריך לדעת על העיר שלו, במקום אחד."),

    ("ch1", "פרק-1-בית-וניווט", "נתחיל ממסך הבית."),
    ("01_home", "מסך-הבית",
     "האפליקציה נפתחת עם ברכה אישית, התאריך העברי, הפרשה, והתפילה הקרובה. ומשם, קיצור דרך לכל מודול."),
    ("13_search", "חיפוש",
     "חיפוש אחד מכסה את כל העיר: בתי כנסת, עסקים כשרים, אירועים וגמחים."),
    ("15b_tabbar_customize", "התאמת-הסרגל",
     "וכל תושב מסדר לעצמו את הסרגל התחתון."),

    ("ch2", "פרק-2-בתי-כנסת", "הלב של האפליקציה: בתי הכנסת."),
    ("03_synagogues", "רשימת-בתי-כנסת",
     "כל שישים ותשעה בתי הכנסת של מעלה אדומים, עם סינון לפי שכונה ונוסח, ומיון לפי מרחק."),
    ("04_synagogue_detail", "כרטיס-בית-כנסת",
     "בכל בית כנסת: תמונות, כתובת, נוסח, ופרטי הגבאי, עם ניווט בלחיצה אחת."),
    ("05_synagogue_detail_schedule", "לוח-זמנים",
     "לוח הזמנים המלא, כולל כמה מניינים לאותה תפילה, וזמנים שנגזרים מהנץ."),
    ("06_prayertimes", "מניינים-בעיר",
     "ומי שמחפש מניין עכשיו, רואה את כל המניינים בעיר לפי הזמן שנותר עד תחילתם."),
    ("07_zmanim", "זמני-היום",
     "זמני היום מחושבים לפי המיקום המדויק של העיר."),
    ("02_selichot", "סליחות",
     "ובעונה, מסך הסליחות נפתח מאליו, ומקבץ את המניינים לפי לילה."),

    ("ch3", "פרק-3-כשרות", "כשרות."),
    ("08_businesses", "עסקים-כשרים",
     "רשימת העסקים, עם רמת הכשרות והגורם המכשיר."),
    ("09_business_detail", "כרטיס-עסק",
     "ובכרטיס העסק, התעודה עצמה ותאריך התוקף שלה."),
    ("36_kashrut_updates", "עדכוני-כשרות",
     "וכל שינוי בכשרות נשלח כהתראה לכל תושבי העיר."),

    ("ch4", "פרק-4-מקוואות", "מקוואות."),
    ("10_mikveh", "רשימת-מקוואות",
     "שעות הפתיחה של היום, לנשים ולגברים."),
    ("12_appointment_booking", "קביעת-תור",
     "וקביעת תור אונליין, עם משבצות פנויות בזמן אמת."),

    ("ch5", "פרק-5-קהילה", "קהילה."),
    ("14_events", "אירועים",
     "הודעות הרבנות, שיעורים ואירועים."),
    ("16_eruv", "עירוב",
     "מצב העירוב לשבת הקרובה, עם מפת הגבולות המלאה."),
    ("17_gemach", "גמח",
     "וגמחי העיר, עם חיוג ישיר לאחראי."),

    ("ch6", "פרק-6-ניהול", "וכל זה מתוחזק בידי בעלי התפקידים עצמם."),
    ("20_manage_synagogue", "ניהול-בית-כנסת",
     "הגבאי מעדכן את זמני התפילות של בית הכנסת שלו."),
    ("34_manage_kosher_cert", "ניהול-תעודות",
     "מנהל הכשרות מעדכן את התעודות."),
    ("35_kashrut_publish_confirm", "פרסום-עדכון",
     "והמערכת מזהה לבד מה השתנה, ושואלת מה לפרסם."),
    ("27_manage_users", "תפקידים",
     "כל בעל תפקיד רואה רק את מה שבאחריותו."),

    ("ch7", "פרק-7-שבת", "ובשבת."),
    ("32_shabbat_closed", "סגירה-בשבת",
     "האפליקציה נועלת את עצמה, מהדלקת נרות ועד צאת השבת."),

    ("end", "סיום", "קהילה. אפליקציה אחת, שמוכנה לכל עיר."),
]

LINES = {sid: text for sid, _, text in SCRIPT}
FILE_NAME = {sid: "%02d-%s" % (i, heb) for i, (sid, heb, _) in enumerate(SCRIPT, 1)}


def on_screen_labels():
    """What is visible while each line plays, pulled from the reel itself."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "demo", os.path.join(ROOT, "scripts", "make_demo_video.py"))
    demo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(demo)
    labels = {"title": "כרטיס פתיחה — קהילה", "end": "כרטיס סיום"}
    for hid, text in demo.HOOKS:
        labels[hid] = "כרטיס שאלה — %s" % text
    for sc in demo.SCENES:
        if sc[0] == "chapter":
            labels["ch%d" % sc[1]] = "כרטיס פרק — %s" % sc[2]
        else:
            labels[sc[1]] = sc[2]
    return labels


def old_durations():
    p = os.path.join(OUT, "manifest.json")
    if not os.path.exists(p):
        return {}
    with open(p, encoding="utf-8") as f:
        return json.load(f)["clips"]


def export():
    labels = on_screen_labels()
    old = old_durations()
    os.makedirs(PROMO, exist_ok=True)

    md = os.path.join(PROMO, "narration-script.md")
    with open(md, "w", encoding="utf-8") as f:
        f.write("# תסריט הקריינות — סרטון קהילה\n\n")
        f.write("%d משפטים, לפי סדר הסרטון.\n\n" % len(SCRIPT))
        f.write("שמרו כל הקלטה בשם שבעמודה **קובץ** לתוך `assets/promo/narration/` "
                "(כל פורמט: mp3, wav, m4a), ואז הריצו:\n\n")
        f.write("```\npython scripts/import_narration.py --trim --gain\n"
                "python scripts/make_demo_video.py\n```\n\n")
        f.write("אורך כל סצנה בסרטון נקבע אוטומטית לפי אורך ההקלטה — "
                "אין צורך לעמוד באורך מסוים.\n\n")
        f.write("| # | קובץ | מה על המסך | טקסט | טיוטה נוכחית |\n")
        f.write("|---|------|------------|------|---------------|\n")
        for i, (sid, _, text) in enumerate(SCRIPT, 1):
            d = "%.2fs" % old[sid]["dur"] if sid in old else "—"
            f.write("| %d | `%s` | %s | %s | %s |\n"
                    % (i, FILE_NAME[sid], labels.get(sid, ""), text, d))
        f.write("\n\n## הטקסט ברצף\n\n")
        for _, _, text in SCRIPT:
            f.write(text + "\n")

    txt = os.path.join(PROMO, "narration-script.txt")
    with open(txt, "w", encoding="utf-8") as f:
        for sid, _, text in SCRIPT:
            f.write("%s\t%s\n" % (FILE_NAME[sid], text))

    write_elevenlabs_prompt(labels)

    words = sum(len(t.split()) for _, _, t in SCRIPT)
    print("\n".join([md, txt, os.path.join(PROMO, "elevenlabs-prompt.md"),
                     "%d lines, %d words" % (len(SCRIPT), words)]))


def write_elevenlabs_prompt(labels):
    """Two ready-to-paste workflows: one generation per line, or the whole
    script in a single pass that split_narration.py cuts back apart."""
    p = os.path.join(PROMO, "elevenlabs-prompt.md")
    joined = "\n\n".join(text for _, _, text in SCRIPT)

    with open(p, "w", encoding="utf-8") as f:
        f.write("# ElevenLabs — הפרומפט לסרטון קהילה\n\n")

        f.write("## הגדרות מומלצות\n\n")
        f.write("| הגדרה | ערך | למה |\n|---|---|---|\n")
        f.write("| Model | **Eleven v3** (`eleven_v3`) | תומך עברית ובתגיות "
                "הבימוי בסוגריים מרובעים |\n")
        f.write("| Stability | **Natural** | הכי קרוב לקול המקורי; "
                "Creative נוטה להזיות באמצע משפט |\n")
        f.write("| Speed | **1.0** | הסצנות נמתחות לפי ההקלטה, אז אין צורך למהר |\n")
        f.write("| Similarity | גבוה (~0.8) | שומר על עקביות בין 34 קטעים נפרדים |\n\n")
        f.write("> v3 **לא** תומך ב-`<break>`. הפסקות נעשות בשלוש נקודות `...`, "
                "והדגשה באותיות גדולות. אם תעדיפו `<break time=\"1.0s\" />`, "
                "צריך לעבור ל-`eleven_multilingual_v2` — הוא יציב מאוד לקטעים "
                "קצרים, אבל בלי תגיות הבימוי.\n\n")

        f.write("## אפשרות א׳ — קטע לכל סצנה (מומלץ)\n\n")
        f.write("הכי אמין: כל שורה היא הרצה נפרדת, ושומרים בשם שבכותרת. "
                "התגיות בסוגריים הן בימוי — אפשר למחוק אותן אם הקול "
                "מבטא אותן בקול רם.\n\n")
        for i, (sid, _, text) in enumerate(SCRIPT, 1):
            f.write("### %d. `%s`\n\n" % (i, FILE_NAME[sid]))
            f.write("*על המסך: %s*\n\n" % labels.get(sid, ""))
            f.write("```\n%s\n```\n\n" % tagged(sid, text))

        f.write("---\n\n## אפשרות ב׳ — הרצה אחת לכל פרק\n\n")
        f.write("%d הרצות במקום %d. כל הרצה היא פרק שלם, ואז חותכים אותה "
                "אוטומטית לקטעים.\n\n" % (len(batches()), len(SCRIPT)))
        f.write("> **חשוב:** התיעוד של ElevenLabs מזהיר ששימוש ביותר מדי "
                "`<break>` בהרצה אחת גורם לחוסר יציבות — לכן הפרדנו לפרקים "
                "של 3–7 שורות ולא לתסריט אחד ארוך. אם אתם על v3 (שאינו תומך "
                "ב-`<break>` בכלל), השאירו שורה ריקה בין השורות והוסיפו "
                "`...` בסופן, והריצו את החיתוך עם `--min-silence 0.8`.\n\n")
        f.write("ההפסקה של שתי שניות היא מה שמאפשר את החיתוך האוטומטי: "
                "הפסקה טבעית בתוך משפט נמשכת בערך שנייה, אז שתי שניות בין "
                "שורות מפרידות בבירור.\n\n")
        for bi, (label, ids) in enumerate(batches(), 1):
            block = "\n\n".join('%s <break time="2.0s" />' % dict(
                (s, t) for s, _, t in SCRIPT)[i] for i in ids)
            f.write("### מנה %d — %s\n\n" % (bi, label))
            f.write("```\n%s\n```\n\n" % block.rsplit(" <break", 1)[0])
            f.write("אחרי ההורדה:\n\n```\npython scripts/split_narration.py "
                    "<הקובץ> --scenes %s\n```\n\n" % ",".join(ids))
        f.write("סה\"כ %d תווים בכל התסריט.\n" % len(joined))


def batches():
    """The script grouped for recording: the cold open, then one per chapter."""
    groups, cur, label = [], [], "פתיחה"
    for sid, heb, _ in SCRIPT:
        if sid.startswith("ch") and sid[2:].isdigit() and cur:
            groups.append((label, cur))
            cur, label = [], heb
        elif sid.startswith("ch") and sid[2:].isdigit():
            label = heb
        cur.append(sid)
    groups.append((label, cur))
    return groups


# Delivery notes per scene. Everything else is read straight.
TAGS = {
    "hook1": "[curious]",
    "hook2": "[curious]",
    "hook3": "[curious]",
    "title": "[warm][confident]",
    "ch7": "[calm]",
    "32_shabbat_closed": "[calm]",
    "end": "[warm][confident]",
}


def tagged(sid, text):
    t = TAGS.get(sid)
    return "%s %s" % (t, text) if t else text


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", path],
        capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default=VOICE)
    ap.add_argument("--rate", default=RATE)
    ap.add_argument("--export", action="store_true",
                    help="write the script and the ElevenLabs prompt; no TTS call")
    args = ap.parse_args()

    if args.export:
        export()
        return

    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for i, (scene, _, text) in enumerate(SCRIPT, 1):
        mp3 = os.path.join(OUT, scene + ".mp3")
        wav = os.path.join(OUT, scene + ".wav")
        # --rate must be one token; a bare "-4%" reads as a flag.
        subprocess.run([sys.executable, "-m", "edge_tts", "--voice", args.voice,
                        "--rate=" + args.rate, "--text", text, "--write-media", mp3],
                       check=True, capture_output=True)
        subprocess.run(["ffmpeg", "-y", "-i", mp3, "-ar", "44100", "-ac", "1",
                        wav, "-loglevel", "error"], check=True)
        os.remove(mp3)
        d = duration(wav)
        manifest[scene] = {"text": text, "dur": round(d, 3)}
        print("%2d/%d  %-30s %5.2fs" % (i, len(SCRIPT), scene, d))

    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"voice": args.voice, "rate": args.rate, "clips": manifest},
                  f, ensure_ascii=False, indent=2)
    print("\n%d clips, %.1fs of speech -> %s"
          % (len(manifest), sum(v["dur"] for v in manifest.values()), OUT))


if __name__ == "__main__":
    main()
