#!/usr/bin/env python3
"""
يولّد موسيقى الخلفية الأصلية لإعلان الشركة.

مقطوعة مؤسسية هادئة مؤلَّفة برمجياً — لا تخضع لأي ترخيص خارجي.
اضبط DURATION على مدة الفيديو، ولتغيير المزاج عدّل PROGRESSION أو BPM
ثم أعد التشغيل:

    python3 scripts/make-music.py

الناتج: public/audio/background.mp3
"""
import os
import subprocess
import wave

import numpy as np

SR = 44100
# المدة والمخرَج قابلان للتجاوز بمتغيّرَي بيئة — يستعملهما `promo-assemble.mjs`
# ليؤلّف فراشاً موسيقياً بطول الفيلم المجمَّع دون أن يمسّ موسيقى الإعلان نفسِه.
# الافتراضُ هو المطلوب للإعلان: يجب أن يساوي مدة الفيديو في src/Root.tsx.
DURATION = float(os.environ.get("MUSIC_DURATION", 54.0))
BPM = 84.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT

OUT_DIR = "public/audio"
WAV = "/tmp/background.wav"
MP3 = os.environ.get("MUSIC_OUT") or os.path.join(OUT_DIR, "background.mp3")

N = int(SR * DURATION)
t = np.arange(N) / SR
left = np.zeros(N)
right = np.zeros(N)


def note(name, octave):
    """يحوّل اسم النغمة إلى تردد"""
    semis = {"C": -9, "C#": -8, "D": -7, "D#": -6, "E": -5, "F": -4,
             "F#": -3, "G": -2, "G#": -1, "A": 0, "A#": 1, "B": 2}
    return 440.0 * 2 ** ((semis[name] + (octave - 4) * 12) / 12)


# تتابع الكوردات: D - A - Bm - G  (مؤسسي متفائل بلا مبالغة)
PROGRESSION = [
    ("D",  [("D", 3), ("F#", 3), ("A", 3)]),
    ("A",  [("A", 2), ("C#", 3), ("E", 3)]),
    ("Bm", [("B", 2), ("D", 3), ("F#", 3)]),
    ("G",  [("G", 2), ("B", 2), ("D", 3)]),
]


def add(buf, start, sig, pan=0.0):
    """يضيف إشارة إلى المسار مع توزيع يمين/يسار"""
    i = int(start * SR)
    if i >= N:
        return
    s = sig[: N - i]
    gl = np.sqrt((1.0 - pan) / 2.0)
    gr = np.sqrt((1.0 + pan) / 2.0)
    left[i : i + len(s)] += s * gl
    right[i : i + len(s)] += s * gr


def env(n, attack, release, sustain_level=1.0):
    """مغلّف صوتي بسيط"""
    e = np.full(n, sustain_level)
    a = min(int(attack * SR), n)
    r = min(int(release * SR), n - a) if n > a else 0
    if a > 0:
        e[:a] = np.linspace(0, sustain_level, a) ** 1.5
    if r > 0:
        e[n - r :] = np.linspace(sustain_level, 0, r) ** 2
    return e


def pad(freq, dur, amp):
    """طبقة هارمونية دافئة مع تنقيح خفيف"""
    n = int(dur * SR)
    tt = np.arange(n) / SR
    sig = np.zeros(n)
    # تفكيك طفيف بين نسختين يعطي اتساعاً
    for det in (-0.15, 0.15):
        f = freq * (1 + det / 100.0)
        sig += np.sin(2 * np.pi * f * tt)
        sig += 0.30 * np.sin(2 * np.pi * 2 * f * tt)
        sig += 0.12 * np.sin(2 * np.pi * 3 * f * tt)
    sig *= env(n, 0.75, 1.1) * amp
    # تموّج بطيء يمنع الجمود
    sig *= 1 + 0.05 * np.sin(2 * np.pi * 0.15 * tt)
    return sig


def pluck(freq, amp, decay=1.1):
    """نقرة ناعمة"""
    n = int(decay * SR)
    tt = np.arange(n) / SR
    d = np.exp(-tt * 3.4)
    sig = np.sin(2 * np.pi * freq * tt) * d
    sig += 0.34 * np.sin(2 * np.pi * 2 * freq * tt) * np.exp(-tt * 5.2)
    sig += 0.14 * np.sin(2 * np.pi * 3 * freq * tt) * np.exp(-tt * 7.0)
    sig[: int(0.006 * SR)] *= np.linspace(0, 1, int(0.006 * SR))
    return sig * amp


def bass(freq, dur, amp):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    sig = np.sin(2 * np.pi * freq * tt) + 0.18 * np.sin(2 * np.pi * 2 * freq * tt)
    return sig * env(n, 0.05, 0.35) * amp


def kick(amp):
    n = int(0.42 * SR)
    tt = np.arange(n) / SR
    f = 110 * np.exp(-tt * 26) + 44
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 8.5)
    return sig * amp


def hat(amp):
    n = int(0.07 * SR)
    rng = np.random.default_rng(7)
    sig = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 60)
    # ترشيح تمريرة عالية بدائي
    sig = np.diff(np.concatenate([[0], sig]))
    return sig * amp


# ── بناء المقطوعة ───────────────────────────────────────────────
bars = int(np.ceil(DURATION / BAR)) + 1

for b in range(bars):
    start = b * BAR
    if start >= DURATION:
        break
    name, chord = PROGRESSION[b % len(PROGRESSION)]
    freqs = [note(nm, oc) for nm, oc in chord]

    # الطبقة الهارمونية — حاضرة من البداية
    for k, f in enumerate(freqs):
        p = -0.4 + 0.4 * k
        add(None, start, pad(f, BAR * 1.05, 0.085), pan=p)

    # الباص — يدخل بعد المشهد الأول
    if start >= 3.0:
        add(None, start, bass(freqs[0] / 2, BAR * 0.92, 0.19))

    # نقرات الأربيجيو — تتكثّف تدريجياً
    if start >= 6.0:
        pattern = [0, 2, 1, 2] if start < 16 else [0, 2, 1, 2, 0, 1]
        for j, idx in enumerate(pattern):
            off = j * (BAR / len(pattern))
            if start + off < DURATION - 3.0:
                f = freqs[idx % len(freqs)] * 2
                add(None, start + off, pluck(f, 0.10), pan=0.35 if j % 2 else -0.35)

    # إيقاع خفيف في المتن، ينسحب قبل الخاتمة ليهدأ الإيقاع
    if 9.0 <= start < DURATION - 9.0:
        for beat_i in range(4):
            bt = start + beat_i * BEAT
            if bt >= DURATION - 4.0:
                break
            if beat_i in (0, 2):
                add(None, bt, kick(0.30))
            add(None, bt + BEAT / 2, hat(0.035), pan=0.25)

# نغمة ختامية تحل المقطوعة مع نهاية الفيديو
final = DURATION - 4.6
for k, (nm, oc) in enumerate([("D", 3), ("F#", 3), ("A", 3), ("D", 4)]):
    add(None, final, pad(note(nm, oc), 4.6, 0.10), pan=-0.3 + 0.2 * k)
add(None, final, bass(note("D", 2), 4.4, 0.20))

# ── صدى بسيط يعطي عمقاً ─────────────────────────────────────────
for delay_s, gain in ((0.28, 0.22), (0.55, 0.12)):
    d = int(delay_s * SR)
    left[d:] += left[:-d] * gain
    right[d:] += right[:-d] * gain * 0.9

# ── معالجة نهائية ───────────────────────────────────────────────
mix = np.stack([left, right])
mix /= max(np.abs(mix).max(), 1e-9)
mix = np.tanh(mix * 1.25) / np.tanh(1.25)   # تليين القمم

fade_in = int(1.6 * SR)
fade_out = int(3.4 * SR)
mix[:, :fade_in] *= np.linspace(0, 1, fade_in) ** 1.4
mix[:, -fade_out:] *= np.linspace(1, 0, fade_out) ** 1.6
mix *= 0.85

os.makedirs(OUT_DIR, exist_ok=True)
pcm = (np.clip(mix.T, -1, 1) * 32767).astype("<i2")
with wave.open(WAV, "w") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())

FFMPEG = os.environ.get("FFMPEG_BIN", "ffmpeg")
os.makedirs(os.path.dirname(MP3) or ".", exist_ok=True)
subprocess.run(
    [FFMPEG, "-y", "-loglevel", "error", "-i", WAV, "-codec:a", "libmp3lame",
     "-b:a", "160k", MP3],
    check=True,
)
print(f"تم إنشاء {MP3}  ({os.path.getsize(MP3)/1024:.0f} كيلوبايت، {DURATION:.0f} ثانية)")
