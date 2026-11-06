"""Finds the beat of what the speakers play: its tempo and when the last beat was, for the UI's subtle pulse."""
import logging, time

import numpy as np

from .audio import RATE

log = logging.getLogger(__name__)
FRAME, HOP = 1024, 512
SECONDS = 8      # how much recent sound each estimate uses
LAG = 0.03       # seconds the sound takes to reach the ears after being captured; raise it if the pulse lands early


def analyze(x, rate=RATE):
    """Mono samples -> {"bpm", "ago": seconds from the end of x back to the last beat, "conf": 0..1}, or None if silent."""
    x = np.asarray(x, np.float32)
    n = (len(x) - FRAME) // HOP + 1
    if n < 64 or np.sqrt((x ** 2).mean()) < 1e-4:
        return None
    frames = x[np.arange(FRAME)[None, :] + HOP * np.arange(n)[:, None]] * np.hanning(FRAME).astype(np.float32)
    mag = np.abs(np.fft.rfft(frames, axis=1)) + 1e-9
    lm = np.log1p(mag / mag.mean())
    gain = np.where(np.fft.rfftfreq(FRAME, 1 / rate) < 200, 3.0, 1.0)     # kicks and bass carry the beat
    f = (np.maximum(0, np.diff(lm, axis=0)) * gain).sum(1)                # how much new sound starts in each frame
    f = f - f.mean()
    ac = np.correlate(f, f, "full")[len(f) - 1:]
    if ac[0] <= 0:
        return None
    ac = ac / ac[0]
    fps = rate / HOP
    lags = np.arange(int(fps / 3), min(int(fps) + 1, len(ac) - 1))        # 60-180 beats a minute
    prefer = np.exp(-0.5 * np.log2(lags / fps / 0.5) ** 2)                # a tempo and its double fit alike: take the one nearer 120
    k = lags[np.argmax(ac[lags] * prefer)]
    a, b, c = ac[k - 1], ac[k], ac[k + 1]
    period = k + (0.5 * (a - c) / (a - 2 * b + c) if a - 2 * b + c < 0 else 0.0)   # between frames, for an exact tempo
    # the phase: the offset from the end at which a comb of that period lands on the most sound
    hits = np.arange(0, (len(f) - 1) / period).astype(float) * period
    score = [f[np.rint(len(f) - 1 - off - hits[hits <= len(f) - 1 - off]).astype(int)].sum() for off in range(int(period) + 1)]
    best = len(f) - 1 - int(np.argmax(score))
    at = (best + 1) * HOP + FRAME / 2                                     # the sample where that frame's sound starts
    return {"bpm": 60 * fps / period, "ago": max(0.0, (len(x) - at) / rate), "conf": float(np.clip(b, 0, 1))}


class BeatListener:
    """Re-estimates the beat once a second while a song plays and keeps the latest in player.beat."""

    def __init__(self, player):
        self.player, self.buf, self.tid, self.peak, self.n, self.logged = player, np.zeros(0, np.float32), None, 0.0, 0, None

    def hear(self, block):
        p = self.player
        if p.tid != self.tid or not p.playing:   # a new song or a pause: the old beat means nothing now
            self.buf, self.tid, self.peak, p.beat = np.zeros(0, np.float32), p.tid, 0.0, None
            if not p.playing:
                return
        self.buf = np.concatenate([self.buf, block])[-SECONDS * RATE:]
        if len(self.buf) < 4 * RATE:
            return
        got = analyze(self.buf)
        if not got:
            p.beat = None
            return
        rms = float(np.sqrt((self.buf[-2 * RATE:] ** 2).mean()))
        self.peak = max(rms, self.peak * 0.995)   # loudness against this song's own loudest, so the volume doesn't matter
        self.n += 1
        if len(self.buf) == SECONDS * RATE and self.logged != p.tid:   # once a song, from a full 8 s
            self.logged = p.tid
            log.info("beat: %.0f BPM, confidence %.2f (no pulse below 0.3)", got["bpm"], got["conf"])
        p.beat = {"bpm": round(got["bpm"], 2), "conf": round(got["conf"], 3), "energy": round(rms / self.peak, 3), "n": self.n,
                  "at": time.monotonic() - got["ago"] + LAG}


def for_ui(beat):
    """player.beat -> what the UI gets: "ago" instead of "at", since the two sides don't share a clock."""
    return beat and {**{k: v for k, v in beat.items() if k != "at"}, "ago": time.monotonic() - beat["at"]}
