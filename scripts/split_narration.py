# -*- coding: utf-8 -*-
"""
Cuts one long narration recording back into per-scene clips.

For the workflow where the whole script is generated in a single ElevenLabs
pass: paste the block from assets/promo/elevenlabs-prompt.md, download the one
file it produces, then:

    python scripts/split_narration.py ~/Downloads/kehila.mp3

It splits on the silences between lines, names the pieces after the scenes in
make_narration.py, and writes the manifest make_demo_video.py needs.

If the count comes out wrong it says so and changes nothing - retune with
--threshold (quieter room = more negative) or --min-silence, or fall back to
generating one clip per scene.
"""
import argparse
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NARR = os.path.join(ROOT, "assets", "promo", "narration")
SR = 44100


def script():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "narr", os.path.join(ROOT, "scripts", "make_narration.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m.SCRIPT


def run(cmd, check=False):
    """ffmpeg echoes the input path, so its output is not decodable with the
    Windows locale codec once a filename has Hebrew in it."""
    return subprocess.run(cmd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", check=check)


def duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                      "-of", "default=nw=1:nk=1", path], check=True).stdout.strip())


def choose_boundaries(gaps, texts, total):
    """Pick which gaps are line breaks.

    A duration threshold alone is not enough: Eleven v3 ignores <break> tags,
    so the pauses between lines end up the same length as the pauses inside a
    sentence - sometimes shorter. But the lines have known text, so their
    relative lengths are known too. Try every way of choosing len(texts)-1
    gaps and keep the one whose segment proportions best match the script.
    """
    import itertools

    need = len(texts) - 1
    if need == 0:
        return []
    if len(gaps) < need:
        return None

    weights = [max(1, len(t)) for t in texts]
    wsum = float(sum(weights))
    want = [w / wsum for w in weights]

    # Keep the search bounded; real breaks are rarely the shortest pauses.
    pool = sorted(gaps, key=lambda g: g[1] - g[0], reverse=True)[:need + 6]
    pool = sorted(pool)

    best, best_score = None, None
    for combo in itertools.combinations(pool, need):
        cuts = [(s + e) / 2 for s, e in combo]
        edges = [0.0] + cuts + [total]
        segs = [edges[i + 1] - edges[i] for i in range(len(texts))]
        if min(segs) < 0.35:
            continue
        got = [s / total for s in segs]
        score = sum(abs(a - b) for a, b in zip(got, want))
        if best_score is None or score < best_score:
            best, best_score = combo, score
    return best


def silences(path, thresh, min_sil):
    out = run(["ffmpeg", "-i", path, "-af",
               "silencedetect=noise=%ddB:d=%.2f" % (thresh, min_sil),
               "-f", "null", "-"]).stderr or ""
    starts = [float(m) for m in re.findall(r"silence_start: ([\d.]+)", out)]
    ends = [float(m) for m in re.findall(r"silence_end: ([\d.]+)", out)]
    return list(zip(starts, ends))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio", help="the single file containing the whole script")
    ap.add_argument("--threshold", type=int, default=-35,
                    help="dB below which it counts as silence (default -35)")
    ap.add_argument("--min-silence", type=float, default=0.25,
                    help="shortest pause that counts as a candidate break "
                         "(default 0.25). Which candidates are real breaks is "
                         "decided by matching segment lengths to the script, "
                         "not by this value.")
    ap.add_argument("--pad", type=float, default=0.12,
                    help="seconds of air kept around each cut")
    ap.add_argument("--scenes",
                    help="comma-separated scene ids in this file, when it holds "
                         "one batch rather than the whole script")
    args = ap.parse_args()

    if not os.path.exists(args.audio):
        sys.exit("no such file: %s" % args.audio)

    scenes = script()
    if args.scenes:
        want_ids = [s.strip() for s in args.scenes.split(",") if s.strip()]
        index = {sid: (sid, heb, text) for sid, heb, text in scenes}
        bad = [s for s in want_ids if s not in index]
        if bad:
            sys.exit("unknown scene id(s): %s" % ", ".join(bad))
        scenes = [index[s] for s in want_ids]
    total = duration(args.audio)
    gaps = [(s, e) for s, e in silences(args.audio, args.threshold, args.min_silence)
            if s > 0.2 and e < total - 0.2]

    need = len(scenes) - 1
    print("found %d candidate gaps, need %d cuts (%d scenes) in %.1fs"
          % (len(gaps), need, len(scenes), total))

    chosen = choose_boundaries(gaps, [t for _, _, t in scenes], total)
    if chosen is None:
        print("\nnot splitting - only %d gaps for %d cuts." % (len(gaps), need))
        print("the pauses between lines are too quiet or too short to detect.")
        print("try --threshold -30 (catch quieter pauses) or "
              "--min-silence 0.15 (catch shorter ones).")
        if gaps:
            print("gaps found (start, length):")
            for s, e in gaps:
                print("   %6.1fs  %.2fs" % (s, e - s))
        sys.exit(1)

    bounds = [0.0] + [(s + e) / 2 for s, e in chosen] + [total]

    os.makedirs(NARR, exist_ok=True)
    # Merge, so splitting one batch does not discard the others.
    mpath = os.path.join(NARR, "manifest.json")
    manifest = {}
    if os.path.exists(mpath):
        with open(mpath, encoding="utf-8") as f:
            manifest = json.load(f).get("clips", {})
    for i, (sid, _, text) in enumerate(scenes):
        start = max(0.0, bounds[i] - args.pad)
        end = min(total, bounds[i + 1] + args.pad)
        dst = os.path.join(NARR, sid + ".wav")
        subprocess.run(["ffmpeg", "-y", "-ss", "%.3f" % start, "-to", "%.3f" % end,
                        "-i", args.audio, "-ar", str(SR), "-ac", "1",
                        "-af", "silenceremove=start_periods=1:start_threshold=-40dB:"
                               "start_silence=0.05,areverse,"
                               "silenceremove=start_periods=1:start_threshold=-40dB:"
                               "start_silence=0.05,areverse",
                        dst, "-loglevel", "error"], check=True)
        d = duration(dst)
        manifest[sid] = {"text": text, "dur": round(d, 3)}
        print("%2d  %-30s %5.2fs" % (i + 1, sid, d))

    with open(mpath, "w", encoding="utf-8") as f:
        json.dump({"voice": "split:" + os.path.basename(args.audio),
                   "clips": manifest}, f, ensure_ascii=False, indent=2)
    print("\n%d of %d scenes now have audio, %.1fs of speech"
          % (len(manifest), len(script()), sum(v["dur"] for v in manifest.values())))


if __name__ == "__main__":
    main()
