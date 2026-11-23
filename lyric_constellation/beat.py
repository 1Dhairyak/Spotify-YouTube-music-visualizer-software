"""Finds the beat of what the speakers play (its tempo, and when the last beat was) so the screen can pulse with it.

How it works, in short:
 1. Cut the last 8 seconds of sound into short overlapping frames and find how much NEW sound starts in each one
    (a drum hit = a sudden jump in loudness, especially in the bass). This is called the "onset strength".
 2. A beat repeats, so that signal looks like itself when shifted by one beat. Try every shift between
    60 and 180 beats per minute and keep the one that matches best ("autocorrelation"). That gives the tempo.
 3. Slide a comb with that spacing over the signal; where its teeth hit the most sound is where the beats are.
"""
import logging
import time

import numpy as np

from .audio import RATE

log = logging.getLogger(__name__)

FRAME = 1024     # samples per analysis frame (64 ms)
HOP = 512        # samples between the starts of two frames (they overlap by half)
SECONDS = 8      # how much recent sound each estimate uses
LAG = 0.03       # seconds the sound takes to reach your ears after being captured; raise it if the pulse lands early


def analyze(x, rate=RATE):
    """Mono samples -> {"bpm": tempo, "ago": seconds from the end of x back to the last beat, "conf": 0..1 confidence}.
    Returns None if the sound is (almost) silent or too short."""
    x = np.asarray(x, np.float32)
    n_frames = (len(x) - FRAME) // HOP + 1
    if n_frames < 64 or np.sqrt((x ** 2).mean()) < 1e-4:
        return None

    # Step 1: onset strength. `frames` is a 2-D table: one row per frame, each row FRAME samples long.
    starts = HOP * np.arange(n_frames)[:, None]
    frames = x[np.arange(FRAME)[None, :] + starts] * np.hanning(FRAME).astype(np.float32)
    magnitude = np.abs(np.fft.rfft(frames, axis=1)) + 1e-9
    log_mag = np.log1p(magnitude / magnitude.mean())
    gain = np.where(np.fft.rfftfreq(FRAME, 1 / rate) < 200, 3.0, 1.0)     # kicks and bass carry the beat: count them 3x
    increase = np.maximum(0, np.diff(log_mag, axis=0))                    # only sound getting louder counts
    onset = (increase * gain).sum(1)                                      # how much new sound starts in each frame
    onset = onset - onset.mean()

    # Step 2: tempo, by autocorrelation (how well the signal matches itself shifted by `lag` frames).
    ac = np.correlate(onset, onset, "full")[len(onset) - 1:]
    if ac[0] <= 0:
        return None
    ac = ac / ac[0]
    frames_per_second = rate / HOP
    lags = np.arange(int(frames_per_second / 3), min(int(frames_per_second) + 1, len(ac) - 1))   # 60-180 beats a minute
    # A tempo and its double fit almost equally well; gently prefer the one nearer 120 BPM.
    prefer = np.exp(-0.5 * np.log2(lags / frames_per_second / 0.5) ** 2)
    k = lags[np.argmax(ac[lags] * prefer)]
    # The true beat length is usually between two whole frames: fit a parabola through the 3 points around the best.
    a, b, c = ac[k - 1], ac[k], ac[k + 1]
    curve = a - 2 * b + c
    period = k + (0.5 * (a - c) / curve if curve < 0 else 0.0)

    # Step 3: phase. For each possible offset from the end, add up the onset strength where a comb of beats lands.
    last = len(onset) - 1
    beats = np.arange(0, last / period).astype(float) * period
    score = []
    for offset in range(int(period) + 1):
        positions = np.rint(last - offset - beats[beats <= last - offset]).astype(int)
        score.append(onset[positions].sum())
    best = last - int(np.argmax(score))                                   # the frame of the most recent beat
    at = (best + 1) * HOP + FRAME / 2                                     # the sample where that frame's sound starts

    return {"bpm": 60 * frames_per_second / period,
            "ago": max(0.0, (len(x) - at) / rate),
            "conf": float(np.clip(b, 0, 1))}


class BeatListener:
    """Re-estimates the beat once a second while a song plays and keeps the latest result in player.beat."""

    def __init__(self, player):
        self.player = player
        self.buf = np.zeros(0, np.float32)   # the last SECONDS of sound
        self.track_id = None                 # the song the sound in buf belongs to
        self.peak = 0.0                      # this song's loudest moment so far, to measure energy against
        self.count = 0                       # how many estimates so far (the page uses it to spot a new one)
        self.logged = None                   # the song whose tempo we already wrote to the log

    def hear(self, block):
        p = self.player

        # A new song or a pause: the old beat means nothing now, start over.
        if p.track_id != self.track_id or not p.playing:
            self.buf = np.zeros(0, np.float32)
            self.track_id = p.track_id
            self.peak = 0.0
            p.beat = None
            if not p.playing:
                return

        self.buf = np.concatenate([self.buf, block])[-SECONDS * RATE:]   # keep only the last 8 s
        if len(self.buf) < 4 * RATE:   # wait for at least 4 s of sound
            return

        got = analyze(self.buf)
        if not got:
            p.beat = None
            return

        # Energy: how loud the last 2 s are compared with this song's loudest, so the volume knob doesn't matter.
        rms = float(np.sqrt((self.buf[-2 * RATE:] ** 2).mean()))
        self.peak = max(rms, self.peak * 0.995)
        self.count += 1

        if len(self.buf) == SECONDS * RATE and self.logged != p.track_id:   # log once per song, from a full 8 s
            self.logged = p.track_id
            log.info("beat: %.0f BPM, confidence %.2f (no pulse below 0.3)", got["bpm"], got["conf"])

        p.beat = {"bpm": round(got["bpm"], 2),
                  "conf": round(got["conf"], 3),
                  "energy": round(rms / self.peak, 3),
                  "n": self.count,
                  "at": time.monotonic() - got["ago"] + LAG}   # the moment of the last beat, on Python's clock


def for_ui(beat):
    """player.beat -> what the page gets. The page and Python don't share a clock, so instead of the moment
    of the last beat ("at") the page gets how long ago it was ("ago")."""
    if not beat:
        return beat
    result = {key: value for key, value in beat.items() if key != "at"}
    result["ago"] = time.monotonic() - beat["at"]
    return result
