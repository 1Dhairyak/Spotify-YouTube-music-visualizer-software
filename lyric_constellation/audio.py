"""One recorder of what the speakers play, shared by everything that listens (word timing, mood, beat)."""
import logging, time

import numpy as np

log = logging.getLogger(__name__)
RATE = 16000
STEP = 0.1   # seconds per read from the device; every listener gets whole multiples of it


class Speakers:
    """Records the speakers on one thread and hands each listener the audio in the block size it asked for.
    A listener runs on this thread, so it should be quick: slow work belongs on its own thread."""

    def __init__(self):
        self.listeners = []

    def listen(self, seconds, fn):
        """fn(samples) is called with mono float samples every `seconds` of sound, right after they were played."""
        self.listeners.append({"size": round(seconds / STEP), "fn": fn, "buf": []})

    def feed(self, block):
        for s in self.listeners:
            s["buf"].append(block)
            if len(s["buf"]) >= s["size"]:
                samples = np.concatenate(s["buf"])
                s["buf"] = []
                try:
                    s["fn"](samples)
                except Exception:  # one listener's bug never stops the others
                    log.exception("speaker listener")

    def run(self):
        import ctypes
        import soundcard as sc
        ctypes.windll.ole32.CoInitializeEx(None, 0)  # soundcard needs COM on this thread
        while True:
            try:  # reopened if the output device changes or goes away
                mic = sc.get_microphone(str(sc.default_speaker().name), include_loopback=True)
                with mic.recorder(samplerate=RATE) as rec:
                    while True:
                        self.feed(rec.record(numframes=round(RATE * STEP)).mean(axis=1))
            except Exception:
                log.exception("speakers")
                time.sleep(5)


# ---------- levels: how loud each part of the sound is right now, for the bars around the cover ----------
BANDS = 24
FRAME = 2048   # FFT size: each 50 ms half-block, zero-padded, so the bass bands get a bin of their own
_freqs = np.fft.rfftfreq(FRAME, 1 / RATE)
_edges = np.searchsorted(_freqs, np.geomspace(45, 7500, BANDS + 1))   # bass to treble, evenly spaced to the ear
_lo, _hi = _edges[:-1], np.maximum(_edges[1:], _edges[:-1] + 1)
RANGE = 30   # dB from silent to a full bar


def bands(x):
    """Mono samples -> each band's loudness in dB."""
    x = np.asarray(x, np.float32)
    p = np.abs(np.fft.rfft(x * np.hanning(len(x)), FRAME)) ** 2
    c = np.concatenate([[0.0], np.cumsum(p)])
    return 10 * np.log10((c[_hi] - c[_lo]) / (_hi - _lo) + 1e-12)


class Levels:
    """Two frames of 0..1 band levels per 0.1 s block, in player.levels. Each band is measured against its own recent
    loudest (with the loudest band setting a floor), so treble moves as much as bass and the volume doesn't matter."""

    def __init__(self, player):
        self.player, self.peak, self.n = player, None, 0

    def hear(self, block):
        frames = []
        for x in np.array_split(block, 2):
            if not self.player.playing or np.sqrt((x ** 2).mean()) < 1e-4:
                frames.append([0.0] * BANDS)
                continue
            db = bands(x)
            self.peak = db if self.peak is None else np.maximum(db, self.peak - 0.1)   # forgets 2 dB a second
            ref = np.maximum(self.peak, self.peak.max() - 18)   # a near-silent band isn't stretched to full height
            frames.append(np.round(np.clip((db - ref + RANGE) / RANGE, 0, 1), 2).tolist())
        self.n += 1
        self.player.levels = {"n": self.n, "bands": frames}
