# -*- coding: utf-8 -*-
"""
Generates the underscore for the promo reel: a slow, warm pad that sits well
under speech. Synthesised from scratch with numpy, so it carries no licence.

    python scripts/make_music_bed.py 110      # seconds

Writes assets/promo/music-bed.wav (44.1 kHz stereo).
"""
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "promo", "music-bed.wav")
SR = 44100

# i - VI - III - VII in D minor: warm, unresolved, no strong emotional pull
# that would fight the narration.
PROGRESSION = [
    (146.83, [1.0, 1.5, 2.0, 3.0]),      # Dm
    (116.54, [1.0, 1.5, 2.0, 2.5]),      # Bb
    (174.61, [1.0, 1.5, 2.0, 3.0]),      # F
    (130.81, [1.0, 1.5, 2.0, 2.5]),      # C
]
BAR = 7.5          # seconds per chord
PENTATONIC = [587.33, 659.25, 783.99, 880.00, 1174.66]   # D E G A D, for the bells


def one_pole(x, cutoff):
    """Low-pass so the pad stays behind a voice instead of over it. Applied as a
    one-pole magnitude response in the frequency domain - a per-sample Python
    loop over a couple of million samples is far too slow."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(x.size, 1 / SR)
    return np.fft.irfft(spec / (1 + 1j * f / cutoff), n=x.size)


def fft_convolve(x, ir):
    n = 1 << int(np.ceil(np.log2(x.size + ir.size - 1)))
    y = np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)
    return y[: x.size]


def reverb(x, decay=2.2, mix=0.34):
    """Convolution with decaying noise - a cheap but convincing hall."""
    n = int(SR * decay)
    ir = np.random.default_rng(7).standard_normal(n) * np.exp(-np.linspace(0, 6.5, n))
    ir[0] = 1.0
    wet = fft_convolve(x, ir)
    wet /= np.max(np.abs(wet)) + 1e-9
    return (1 - mix) * x + mix * wet


def pad(total):
    t = np.arange(int(SR * total)) / SR
    out = np.zeros_like(t)
    for i in range(int(np.ceil(total / BAR))):
        root, ratios = PROGRESSION[i % len(PROGRESSION)]
        s, e = int(i * BAR * SR), min(int((i + 1) * BAR * SR) + SR, t.size)
        if s >= t.size:
            break
        seg_t = np.arange(e - s) / SR
        # long attack and release so chords bleed into one another
        env = np.minimum(seg_t / 2.2, 1.0) * np.minimum((BAR + 1.0 - seg_t) / 2.2, 1.0)
        env = np.clip(env, 0, 1)
        seg = np.zeros(e - s)
        for j, r in enumerate(ratios):
            f = root * r
            for det in (-0.12, 0.12):          # slight detune = chorus/width
                seg += np.sin(2 * np.pi * (f + det) * seg_t) / (j + 1.6)
            seg += 0.12 * np.sin(2 * np.pi * f * 2 * seg_t) / (j + 2.0)
        out[s:e] += seg * env
    return out


def bells(total):
    """Sparse high notes so the bed does not feel static over 90+ seconds."""
    rng = np.random.default_rng(19)
    out = np.zeros(int(SR * total))
    tick = 3.75
    for i in range(int(total / tick)):
        if rng.random() < 0.45:
            continue
        f = PENTATONIC[rng.integers(len(PENTATONIC))]
        s = int((i * tick + rng.random() * 0.4) * SR)
        n = int(2.6 * SR)
        if s + n > out.size:
            break
        et = np.arange(n) / SR
        env = np.exp(-et * 1.9) * np.minimum(et / 0.02, 1.0)
        out[s:s + n] += (np.sin(2 * np.pi * f * et)
                         + 0.3 * np.sin(2 * np.pi * f * 2 * et)) * env * 0.5
    return out


def main():
    total = float(sys.argv[1]) if len(sys.argv) > 1 else 110.0
    x = 0.85 * pad(total) + 0.34 * bells(total)
    x = one_pole(x, 2600)
    x = reverb(x)
    x /= np.max(np.abs(x)) + 1e-9

    # Fade the whole bed in and out. Proportional, so a 45s cut does not spend
    # its first three seconds dry.
    n = x.size
    fi = int(min(0.6, total * 0.015) * SR)
    fo = int(min(4.0, total * 0.09) * SR)
    x[:fi] *= np.linspace(0, 1, fi)
    x[-fo:] *= np.linspace(1, 0, fo)

    # gentle stereo spread via a few ms of delay on the right
    d = int(0.011 * SR)
    right = np.concatenate([np.zeros(d), x[:-d]])
    stereo = np.stack([x, right], axis=1) * 0.5

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    import wave
    with wave.open(OUT, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(stereo, -1, 1) * 32767).astype("<i2").tobytes())
    print("%s  %.1fs" % (OUT, total))


if __name__ == "__main__":
    main()
