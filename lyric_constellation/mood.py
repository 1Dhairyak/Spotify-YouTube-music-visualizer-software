"""How emotional a song is, from its lyrics and from how it sounds, so the UI can calm down for ballads.

Two logistic regressions trained by tools/train_mood.py (weights in mood_model.json next to this file):
- lyrics: which words it uses (English and romanized Hindi/Punjabi alike) and how densely they are sung;
- sound: brightness, percussion, beat regularity and dynamics of what the speakers play, all independent of volume.
A fusion layer joins them; the sound counts more as more of the song is heard. 1 = emotional, 0 = lively.
"""
import logging, math, re, threading, time

import numpy as np

from . import ROOT, read_json
from .lyrics import parse_lrc

log = logging.getLogger(__name__)
MODEL = read_json(ROOT / "lyric_constellation" / "mood_model.json")
RATE, FRAME, HOP = 16000, 1024, 512
WINDOW = 10   # seconds of sound per feature measurement; a song's sound features are the mean over its windows
TRUST = 20    # seconds of sound after which the sound counts fully
AUDIO_FEATURES = ["centroid", "flatness", "bass", "treble", "onsets", "flux", "beat", "dynamics"]
TOKEN = re.compile(r"(?:[^\W\d_]|[ऀ-෿])+")   # letters; Indic vowel signs and viramas stay inside their word


# ---------- lyrics ----------

def tokens(lrc):
    """The distinct words of a song, lowercased, apostrophes dropped ("don't" -> "dont")."""
    return set(TOKEN.findall(re.sub(r"\[[^\]]*\]|<[^>]*>|'", "", lrc).lower()))


def density(lrc):
    """[words per second while singing, words per line, share of lines that repeat an earlier one]: ballads are
    sparse, party songs dense and built on a repeated hook. None for too few lines."""
    lines = [(t, b) for t, b in parse_lrc(lrc) if b.strip()]
    if len(lines) < 4:
        return None
    sung = sum(min(8.0, b_t - a_t) for (a_t, _), (b_t, _) in zip(lines, lines[1:]))   # long gaps are instrumentals
    words = sum(len(b.split()) for _, b in lines[:-1])
    norm = [" ".join(TOKEN.findall(b.lower())) for _, b in lines]
    repeat = sum(1 for i, s in enumerate(norm) if s and s in norm[:i]) / len(lines)
    return [words / max(sung, 1.0), words / (len(lines) - 1), repeat]


def lyric_logit(lrc):
    """The lyrics model's log-odds that a song is emotional, or None without (enough) lyrics."""
    M = MODEL and MODEL.get("lyrics")
    d = lrc and density(lrc)
    if not (M and d):
        return None
    z = M["b"] + sum(M["vocab"].get(w, 0.0) for w in tokens(lrc))
    return z + sum(w * (x - m) / s for w, x, m, s in zip(M["w"], d, M["mean"], M["std"]))


# ---------- sound ----------

def audio_features(x, rate=RATE):
    """Mono samples -> {feature: value} for this stretch of music, or None if it is (nearly) silent.
    Every feature is a ratio or a normalized shape, so the playback volume doesn't change it."""
    x = np.asarray(x, np.float32)
    n = (len(x) - FRAME) // HOP + 1
    if n < 16:
        return None
    frames = x[np.arange(FRAME)[None, :] + HOP * np.arange(n)[:, None]] * np.hanning(FRAME).astype(np.float32)
    rms = np.sqrt((frames ** 2).mean(1))
    loud = rms > max(rms.max() * 0.03, 1e-5)
    if loud.sum() < 16:
        return None
    mag = np.abs(np.fft.rfft(frames[loud], axis=1)) + 1e-9
    freqs = np.fft.rfftfreq(FRAME, 1 / rate)
    p = mag ** 2
    tot = p.sum(1)
    lm = np.log1p(mag / mag.mean())                        # log spectrum relative to its own level
    flux = np.maximum(0, np.diff(lm, axis=0)).sum(1)       # how much new sound starts each frame
    level = lm.sum(1).mean() + 1e-9
    fr = flux / level                                      # new sound per frame, relative to how much is playing
    fn = flux / (flux.mean() + 1e-9)
    peaks = (fn[1:-1] > 1.6) & (fr[1:-1] > 0.06) & (fn[1:-1] >= fn[:-2]) & (fn[1:-1] > fn[2:])   # real hits only
    perc = min(1.0, float(fr.mean()) / 0.1)                # a sustained pad has no beat to be regular about
    f = flux - flux.mean()
    ac = np.correlate(f, f, "full")[len(f) - 1:]
    lo, hi = int(0.3 * rate / HOP), int(1.0 * rate / HOP)  # beats 60-200 per minute
    secs = loud.sum() * HOP / rate
    return {
        "centroid": float(np.median((p * freqs).sum(1) / tot) / (rate / 2)),   # brightness
        "flatness": float(np.mean(np.exp(np.log(mag).mean(1)) / mag.mean(1))),  # noisy/percussive vs tonal
        "bass": float(np.mean(p[:, freqs < 250].sum(1) / tot)),
        "treble": float(np.mean(p[:, freqs > 4000].sum(1) / tot)),
        "onsets": float(peaks.sum() / secs),                                      # hits per second
        "flux": float(fr.mean()),                                                 # percussiveness
        "beat": perc * float(ac[lo:hi].max() / (ac[0] + 1e-9)) if len(ac) > hi else 0.0,  # how regular the beat is
        "dynamics": float(rms[loud].std() / (rms[loud].mean() + 1e-9)),          # swells and drops
    }


def windows(x, rate=RATE):
    """A long recording -> feature dicts for each WINDOW-second stretch of it (silent ones dropped)."""
    step = WINDOW * rate
    return [w for w in (audio_features(x[i:i + step], rate) for i in range(0, max(1, len(x) - step // 2), step)) if w]


def mean_features(ws):
    return [float(np.mean([w[k] for w in ws])) for k in AUDIO_FEATURES] if ws else None


def audio_logit(feats):
    """The sound model's log-odds that a song is emotional, from mean_features, or None."""
    M = MODEL and MODEL.get("audio")
    if not (M and feats):
        return None
    return M["b"] + sum(w * (x - m) / s for w, x, m, s in zip(M["w"], feats, M["mean"], M["std"]))


def sigmoid(z):
    return 1 / (1 + math.exp(-max(-30.0, min(30.0, z))))


def fuse(zl, za, heard):
    """Probability the song is emotional: lyrics alone at first, the fused model once TRUST s of sound are in."""
    if za is None:
        return None if zl is None else sigmoid(zl)
    if zl is None:
        return sigmoid(za)
    F = MODEL["fuse"]
    f = min(1.0, heard / TRUST)
    return sigmoid((1 - f) * zl + f * (F["wl"] * zl + F["wa"] * za + F["b"]))


class SongMood:
    """The mood of the track on screen: its lyrics' score and the sound heard of it so far."""

    def __init__(self, tid, name=""):
        self.tid, self.name, self.zl, self.ws, self.heard, self.logged = tid, name, None, [], 0.0, -1
        self.choice = "auto"  # the notch's Calm / Lively; a new song starts over on Auto

    def set_lyrics(self, lrc):
        self.zl = lyric_logit(lrc)

    def add(self, feats, secs):
        self.ws.append(feats)
        self.heard += secs

    def value(self):
        za = audio_logit(mean_features(self.ws))
        p = fuse(self.zl, za, self.heard)
        stage = int(self.heard >= TRUST) + int(self.zl is not None)
        if p is not None and stage != self.logged:   # once with the lyrics, again once the sound is trusted
            self.logged = stage
            log.info("mood: %s lyrics %s sound %s (%d s) -> calm %.2f", self.name,
                     "-" if self.zl is None else f"{sigmoid(self.zl):.2f}", "-" if za is None else f"{sigmoid(za):.2f}",
                     self.heard, p)
        return p


class MoodListener:
    """Listens to the speakers while a song plays and feeds WINDOW-second measurements into player.mood."""

    def __init__(self, player):
        self.player = player

    def start(self):
        if MODEL:
            threading.Thread(target=self.record, daemon=True).start()
        else:
            log.info("mood model missing: every song gets the lively look")

    def record(self):
        import ctypes
        import soundcard as sc
        ctypes.windll.ole32.CoInitializeEx(None, 0)  # soundcard needs COM on this thread
        n = RATE * 2
        while True:
            try:  # reopened if the output device changes or goes away
                mic = sc.get_microphone(str(sc.default_speaker().name), include_loopback=True)
                with mic.recorder(samplerate=RATE) as rec:
                    buf, mood = [], None
                    while True:
                        block = rec.record(numframes=n).mean(axis=1)
                        cur = self.player.mood
                        if cur is not mood or not self.player.playing:   # new song or paused: start a fresh window
                            buf, mood = [], cur
                            continue
                        buf.append(block)
                        if len(buf) * 2 >= WINDOW:
                            feats = audio_features(np.concatenate(buf))
                            if feats and mood:
                                mood.add(feats, len(buf) * 2)
                            buf = []
            except Exception:
                log.exception("mood listener")
                time.sleep(5)
