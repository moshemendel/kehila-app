# -*- coding: utf-8 -*-
"""
Adopts voiceover recorded outside this project (ElevenLabs, a studio, a phone,
anything) and rebuilds the manifest make_demo_video.py times the reel from.

Drop one audio file per scene into assets/promo/narration/, named after the
scene id - 01_home.mp3, ch2.wav, title.m4a - then:

    python scripts/import_narration.py
    python scripts/make_demo_video.py

Anything ffmpeg can read is accepted and converted to 44.1 kHz mono WAV.
Scenes you do not replace keep whatever clip is already there, so you can
swap a few lines without redoing all 31. Scene ids and the script itself are
in make_narration.py (run it with --export for a readable copy).

    --trim   drop leading/trailing silence below -40 dBFS
    --gain   normalise each clip to a -3 dBFS peak
"""
import argparse
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NARR = os.path.join(ROOT, "assets", "promo", "narration")

AUDIO = (".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma", ".aiff")
SR = 44100


def script():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "narr", os.path.join(ROOT, "scripts", "make_narration.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m.SCRIPT, m.FILE_NAME


def resolve(stem, order, by_ascii, by_heb):
    """Map a dropped-in filename onto a scene. Accepts the ASCII scene id
    (01_home), the Hebrew name (06-מסך-הבית), the Hebrew name without its
    number, or just the leading sequence number - downloads often arrive as
    '06.mp3' or 'ElevenLabs_..._06-מסך-הבית.mp3'."""
    s = stem.strip()
    if s in by_ascii:
        return s
    if s in by_heb:
        return by_heb[s]
    # tolerate a prefix/suffix the download added around a known name
    for name, sid in by_heb.items():
        if name and name in s:
            return sid
    for sid in by_ascii:
        if sid in s:
            return sid
    digits = "".join(c for c in s.split("-")[0].split("_")[0] if c.isdigit())
    if digits and 1 <= int(digits) <= len(order):
        return order[int(digits) - 1]
    return None


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", path],
        capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


def convert(src, dst, trim, gain):
    filters = []
    if trim:
        filters += ["silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.05",
                    "areverse",
                    "silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.05",
                    "areverse"]
    if gain:
        filters.append("dynaudnorm=p=0.9:s=5")
        filters.append("alimiter=limit=0.708")     # -3 dBFS
    cmd = ["ffmpeg", "-y", "-i", src, "-ar", str(SR), "-ac", "1"]
    if filters:
        cmd += ["-af", ",".join(filters)]
    cmd += [dst, "-loglevel", "error"]
    subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--trim", action="store_true", help="strip silence at both ends")
    ap.add_argument("--gain", action="store_true", help="even out level, peak at -3 dBFS")
    args = ap.parse_args()

    if not os.path.isdir(NARR):
        sys.exit("no %s - nothing to import" % NARR)

    lines, file_name = script()
    texts = {sid: text for sid, _, text in lines}
    order = [sid for sid, _, _ in lines]
    by_heb = {}
    for sid, _, _ in lines:
        by_heb[file_name[sid]] = sid                       # 06-מסך-הבית
        by_heb[file_name[sid].split("-", 1)[1]] = sid      # מסך-הבית

    found, unmatched = {}, []
    for f in sorted(os.listdir(NARR)):
        stem, ext = os.path.splitext(f)
        if ext.lower() not in AUDIO:
            continue
        sid = resolve(stem, order, texts, by_heb)
        if sid is None:
            unmatched.append(f)
            continue
        # A scene with several files (01_home.wav + 06-מסך-הבית.mp3) is
        # ambiguous; prefer the non-wav, since that is what was just added.
        if sid not in found or ext.lower() != ".wav":
            found[sid] = f

    missing = [s for s in order if s not in found]
    if not found:
        sys.exit("no audio in %s matched a scene (try the names in "
                 "assets/promo/narration-script.md)" % NARR)
    if unmatched:
        print("ignored (no scene matched): %s\n" % ", ".join(unmatched))

    manifest, imported = {}, 0
    for scene in order:                          # keep reel order
        text = texts[scene]
        if scene not in found:
            continue
        src = os.path.join(NARR, found[scene])
        dst = os.path.join(NARR, scene + ".wav")
        if os.path.abspath(src) == os.path.abspath(dst):
            tmp = os.path.join(NARR, "." + scene + ".tmp.wav")
            convert(src, tmp, args.trim, args.gain)
            os.replace(tmp, dst)
        else:
            convert(src, dst, args.trim, args.gain)
            os.remove(src)
            imported += 1
        d = duration(dst)
        manifest[scene] = {"text": text, "dur": round(d, 3)}
        print("%-30s %5.2fs  %s" % (scene, d, found[scene]))

    with open(os.path.join(NARR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"voice": "imported", "clips": manifest}, f,
                  ensure_ascii=False, indent=2)

    total = sum(v["dur"] for v in manifest.values())
    print("\n%d clips (%d newly imported), %.1fs of speech"
          % (len(manifest), imported, total))
    if missing:
        print("still missing %d: %s" % (len(missing), ", ".join(missing)))
        print("those scenes fall back to their fixed timing until you add them.")


if __name__ == "__main__":
    main()
