"""Decides how emotional (calm) a song is, from its lyrics and from how it sounds, so the screen can calm down for ballads.

It uses two small machine-learning models ("logistic regressions"), trained by tools/train_mood.py on a few
hundred labelled songs. Their learned weights are in mood_model.json next to this file.
  - lyrics model: which words the song uses (English and romanized Hindi/Punjabi alike), and how densely they are sung;
  - sound model:  brightness, drums, how regular the beat is, and how much the loudness swells, measured on what the
                  speakers play. None of these change with the volume knob.
A third small step joins the two scores; the more of the song has been heard, the more the sound counts.

Every score here is a "logit" (log-odds): 0 means 50/50, positive means emotional, negative means lively.
sigmoid() turns it into a probability from 0 (lively) to 1 (emotional).
"""
import logging
import math
import re

import numpy as np

from . import ROOT, read_json
from .lyrics import parse_lrc

log = logging.getLogger(__name__)

MODEL = read_json(ROOT / "lyric_constellation" / "mood_model.json")   # None if the file is missing
RATE = 16000
FRAME = 1024   # samples per analysis frame
HOP = 512      # samples between frame starts
WINDOW = 10    # seconds of sound per measurement; a song's sound score uses the average over all its windows
TRUST = 20     # seconds of sound after which the sound counts fully
AUDIO_FEATURES = ["centroid", "flatness", "bass", "treble", "onsets", "flux", "beat", "dynamics"]
TOKEN = re.compile(r"(?:[^\W\d_]|[ऀ-෿])+")   # a word: letters (Hindi/Punjabi vowel signs stay inside their word)


# ---------- lyrics ----------

def tokens(lrc):
    """The different words of a song, lowercase, apostrophes dropped ("don't" -> "dont")."""
    text = re.sub(r"\[[^\]]*\]|<[^>]*>|'", "", lrc)   # remove time tags and apostrophes
    return set(TOKEN.findall(text.lower()))


def density(lrc):
    """[words per second while singing, words per line, share of lines that repeat an earlier line].
    Ballads are sparse; party songs are dense and built on a repeated hook. None if there are too few lines."""
    lines = [(t, body) for t, body in parse_lrc(lrc) if body.strip()]
    if len(lines) < 4:
        return None

    # Time spent singing: the gaps between lines, but a gap over 8 s is an instrumental part, so it counts as 8.
    sung = sum(min(8.0, t2 - t1) for (t1, _), (t2, _) in zip(lines, lines[1:]))
    words = sum(len(body.split()) for _, body in lines[:-1])
    simple = [" ".join(TOKEN.findall(body.lower())) for _, body in lines]
    repeats = sum(1 for i, line in enumerate(simple) if line and line in simple[:i])
    return [words / max(sung, 1.0), words / (len(lines) - 1), repeats / len(lines)]


def lyric_logit(lrc):
    """The lyrics model's score (log-odds that the song is emotional), or None without enough lyrics."""
    M = MODEL and MODEL.get("lyrics")
    d = lrc and density(lrc)
    if not (M and d):
        return None
    # Each known word adds its weight (e.g. "heart" pushes up, "party" pushes down)...
    z = M["b"] + sum(M["vocab"].get(word, 0.0) for word in tokens(lrc))
    # ...and the density numbers add theirs, after being scaled like the training data was.
    return z + sum(w * (x - mean) / std for w, x, mean, std in zip(M["w"], d, M["mean"], M["std"]))


# ---------- sound ----------

def audio_features(x, rate=RATE):
    """A stretch of mono music -> {feature name: value}, or None if it is (almost) silent.
    Every feature is a ratio or a shape, so the playback volume doesn't change it."""
    x = np.asarray(x, np.float32)
    n_frames = (len(x) - FRAME) // HOP + 1
    if n_frames < 16:
        return None

    # Cut the sound into overlapping frames (one row each) and skip the near-silent ones.
    frames = x[np.arange(FRAME)[None, :] + HOP * np.arange(n_frames)[:, None]] * np.hanning(FRAME).astype(np.float32)
    rms = np.sqrt((frames ** 2).mean(1))                   # loudness of each frame
    loud = rms > max(rms.max() * 0.03, 1e-5)
    if loud.sum() < 16:
        return None

    mag = np.abs(np.fft.rfft(frames[loud], axis=1)) + 1e-9   # how much of each pitch is in each frame
    freqs = np.fft.rfftfreq(FRAME, 1 / rate)
    power = mag ** 2
    total = power.sum(1)
    log_mag = np.log1p(mag / mag.mean())                   # log spectrum relative to its own level
    flux = np.maximum(0, np.diff(log_mag, axis=0)).sum(1)  # how much new sound starts each frame
    level = log_mag.sum(1).mean() + 1e-9
    flux_rel = flux / level                                # new sound per frame, relative to how much is playing
    flux_norm = flux / (flux.mean() + 1e-9)
    # Real hits only: a local peak in flux that is well above average.
    middle = flux_norm[1:-1]
    peaks = (middle > 1.6) & (flux_rel[1:-1] > 0.06) & (middle >= flux_norm[:-2]) & (middle > flux_norm[2:])
    percussive = min(1.0, float(flux_rel.mean()) / 0.1)    # a soft sustained pad has no beat to be regular about

    # Beat regularity: how well the flux matches itself shifted by one beat (60-200 beats a minute).
    f = flux - flux.mean()
    ac = np.correlate(f, f, "full")[len(f) - 1:]
    lo, hi = int(0.3 * rate / HOP), int(1.0 * rate / HOP)
    seconds = loud.sum() * HOP / rate

    return {
        "centroid": float(np.median((power * freqs).sum(1) / total) / (rate / 2)),   # brightness
        "flatness": float(np.mean(np.exp(np.log(mag).mean(1)) / mag.mean(1))),      # noisy/drummy vs tonal
        "bass": float(np.mean(power[:, freqs < 250].sum(1) / total)),                # share of energy below 250 Hz
        "treble": float(np.mean(power[:, freqs > 4000].sum(1) / total)),            # share above 4 kHz
        "onsets": float(peaks.sum() / seconds),                                       # hits per second
        "flux": float(flux_rel.mean()),                                               # how percussive overall
        "beat": percussive * float(ac[lo:hi].max() / (ac[0] + 1e-9)) if len(ac) > hi else 0.0,   # how regular the beat is
        "dynamics": float(rms[loud].std() / (rms[loud].mean() + 1e-9)),              # swells and drops
    }


def windows(x, rate=RATE):
    """A long recording -> a feature dict for each WINDOW-second stretch of it (silent stretches left out)."""
    step = WINDOW * rate
    out = []
    for i in range(0, max(1, len(x) - step // 2), step):
        feats = audio_features(x[i:i + step], rate)
        if feats:
            out.append(feats)
    return out


def mean_features(ws):
    """Several feature dicts -> the average of each feature, as a list in AUDIO_FEATURES order (None if empty)."""
    if not ws:
        return None
    return [float(np.mean([w[name] for w in ws])) for name in AUDIO_FEATURES]


def audio_logit(feats):
    """The sound model's score (log-odds that the song is emotional), from mean_features, or None."""
    M = MODEL and MODEL.get("audio")
    if not (M and feats):
        return None
    return M["b"] + sum(w * (x - mean) / std for w, x, mean, std in zip(M["w"], feats, M["mean"], M["std"]))


def sigmoid(z):
    """Score -> probability between 0 and 1. (Clamped to +-30 so math.exp can't overflow.)"""
    return 1 / (1 + math.exp(-max(-30.0, min(30.0, z))))


def fuse(lyrics_score, sound_score, heard):
    """Probability the song is emotional. At first only the lyrics decide; as `heard` seconds of sound come in,
    the joined (lyrics + sound) model takes over, fully after TRUST seconds."""
    if sound_score is None:
        return None if lyrics_score is None else sigmoid(lyrics_score)
    if lyrics_score is None:
        return sigmoid(sound_score)
    F = MODEL["fuse"]
    joined = F["wl"] * lyrics_score + F["wa"] * sound_score + F["b"]
    trust = min(1.0, heard / TRUST)
    return sigmoid((1 - trust) * lyrics_score + trust * joined)


class SongMood:
    """The mood of the song on screen: its lyrics' score and the sound heard of it so far."""

    def __init__(self, track_id, name=""):
        self.track_id = track_id
        self.name = name                 # "Artist - Title", for the log
        self.lyrics_score = None         # lyric_logit of its lyrics
        self.sound_windows = []          # audio_features of each 10 s heard
        self.heard = 0.0                 # seconds of sound heard
        self.logged = -1                 # the last stage written to the log
        self.choice = "auto"             # the notch's Auto / Calm / Lively; every new song starts on Auto

    def set_lyrics(self, lrc):
        self.lyrics_score = lyric_logit(lrc)

    def add(self, feats, secs):
        self.sound_windows.append(feats)
        self.heard += secs

    def value(self):
        """How calm the song is, 0..1 (or None when there's nothing to go on yet)."""
        sound_score = audio_logit(mean_features(self.sound_windows))
        p = fuse(self.lyrics_score, sound_score, self.heard)
        # Write to the log once when the lyrics are scored, and again once the sound is trusted.
        stage = int(self.heard >= TRUST) + int(self.lyrics_score is not None)
        if p is not None and stage != self.logged:
            self.logged = stage
            lyrics_text = "-" if self.lyrics_score is None else f"{sigmoid(self.lyrics_score):.2f}"
            sound_text = "-" if sound_score is None else f"{sigmoid(sound_score):.2f}"
            log.info("mood: %s lyrics %s sound %s (%d s) -> calm %.2f", self.name, lyrics_text, sound_text, self.heard, p)
        return p


class MoodListener:
    """Measures every WINDOW seconds of what the speakers play and adds it to player.mood while a song plays."""

    def __init__(self, player):
        self.player = player
        self.buf = []      # 2-second blocks collected so far
        self.mood = None   # the SongMood they belong to

    def start(self, speakers):
        if MODEL:
            speakers.listen(2, self.hear)
        else:
            log.info("mood model missing: every song gets the lively look")

    def hear(self, block):
        current = self.player.mood
        if current is not self.mood or not self.player.playing:   # new song or paused: start a fresh window
            self.buf = []
            self.mood = current
            return
        self.buf.append(block)
        if len(self.buf) * 2 >= WINDOW:
            feats = audio_features(np.concatenate(self.buf))
            if feats and self.mood:
                self.mood.add(feats, len(self.buf) * 2)
            self.buf = []
