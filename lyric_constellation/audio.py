"""Records what the speakers play, and measures it for the bars around the album cover.

Several parts of the app want to hear the music (word timing, mood, beat, the bars). Instead of each one
opening the sound device, one `Speakers` object records it and passes the sound on to each of them.

"Loopback" recording means capturing what goes OUT of the speakers, not what comes in through a microphone.
The sound arrives as a numpy array of numbers between -1 and 1 ("samples"), RATE of them per second.
"""
import logging
import time

import numpy as np

log = logging.getLogger(__name__)

RATE = 16000   # samples per second we record at (enough for speech and music analysis, and cheap)
STEP = 0.1     # seconds of sound read from the device at a time; listeners get whole multiples of this


class Speakers:
    """Records the speakers on one thread and gives each listener the sound in the block size it asked for.

    A listener runs on this recording thread, so it must be quick. Slow work (like speech recognition)
    belongs on a thread of its own, or recording would fall behind.
    """

    def __init__(self):
        self.listeners = []

    def listen(self, seconds, fn):
        """Register a listener: fn(samples) is called with every `seconds` of sound, right after it was played."""
        blocks_needed = round(seconds / STEP)
        self.listeners.append({"size": blocks_needed, "fn": fn, "buf": []})

    def feed(self, block):
        """One new STEP of sound: add it to each listener's pile, and call the listener when its pile is full."""
        for listener in self.listeners:
            listener["buf"].append(block)
            if len(listener["buf"]) >= listener["size"]:
                samples = np.concatenate(listener["buf"])
                listener["buf"] = []
                try:
                    listener["fn"](samples)
                except Exception:  # a bug in one listener must never stop the others
                    log.exception("speaker listener")

    def run(self):
        """Record forever (runs on its own thread)."""
        import ctypes
        import soundcard as sc

        ctypes.windll.ole32.CoInitializeEx(None, 0)  # Windows' sound system needs this once per thread
        while True:
            # If the output device changes (headphones plugged in) or disappears, recording fails:
            # wait 5 seconds and open whatever the default speaker is now.
            try:
                speaker = sc.default_speaker()
                mic = sc.get_microphone(str(speaker.name), include_loopback=True)
                with mic.recorder(samplerate=RATE) as recorder:
                    while True:
                        stereo = recorder.record(numframes=round(RATE * STEP))
                        mono = stereo.mean(axis=1)  # left and right averaged into one channel
                        self.feed(mono)
            except Exception:
                log.exception("speakers")
                time.sleep(5)


# ---------- levels: how loud each part of the sound is right now, for the bars around the cover ----------
#
# The sound is split into BANDS frequency ranges, from deep bass (45 Hz) to high treble (7500 Hz), using an
# FFT (Fast Fourier Transform: it turns a stretch of sound into "how much of each pitch is in it").
# The ranges are spaced evenly to the ear (each one a fixed musical interval wider than the last).

BANDS = 24
FRAME = 2048   # FFT size. Each 50 ms of sound is padded with silence to this length, so even the narrow
               # bass bands get at least one FFT bin of their own.
RANGE = 30     # decibels between "silent" and "full bar"

_freqs = np.fft.rfftfreq(FRAME, 1 / RATE)                                 # the pitch (Hz) of each FFT bin
_edges = np.searchsorted(_freqs, np.geomspace(45, 7500, BANDS + 1))       # which bin each band starts at
_lo = _edges[:-1]                                                         # first bin of each band
_hi = np.maximum(_edges[1:], _edges[:-1] + 1)                             # one past its last bin (at least 1 bin)


def bands(x):
    """Mono samples -> the loudness of each of the BANDS frequency ranges, in decibels."""
    x = np.asarray(x, np.float32)
    power = np.abs(np.fft.rfft(x * np.hanning(len(x)), FRAME)) ** 2   # energy at each pitch
    # A running total lets us get the sum over any range of bins with one subtraction.
    running_total = np.concatenate([[0.0], np.cumsum(power)])
    average_power = (running_total[_hi] - running_total[_lo]) / (_hi - _lo)
    return 10 * np.log10(average_power + 1e-12)   # to decibels; the tiny number avoids log(0)


class Levels:
    """Turns each 0.1 s of sound into two frames of 24 bar heights (0 to 1), stored in player.levels.

    Each band is compared with its own recent loudest moment, so the treble bars move as much as the bass
    bars, and the bars look the same at any volume.
    """

    def __init__(self, player):
        self.player = player
        self.peak = None   # the recent loudest level of each band (slowly forgotten)
        self.count = 0     # how many blocks so far; the page uses it to tell new levels from ones it already has

    def hear(self, block):
        frames = []
        for half in np.array_split(block, 2):   # two 50 ms halves, so the bars update 20 times a second
            is_silent = np.sqrt((half ** 2).mean()) < 1e-4
            if not self.player.playing or is_silent:
                frames.append([0.0] * BANDS)
                continue

            db = bands(half)
            if self.peak is None:
                self.peak = db
            else:
                # Keep the louder of "now" and "the old peak minus a little". 0.1 dB per 50 ms = it forgets 2 dB a second.
                self.peak = np.maximum(db, self.peak - 0.1)
            # A band that is almost silent shouldn't be stretched to full height just because it's at its own peak:
            # no band's reference may be more than 18 dB below the loudest band's.
            reference = np.maximum(self.peak, self.peak.max() - 18)
            heights = np.clip((db - reference + RANGE) / RANGE, 0, 1)
            frames.append(np.round(heights, 2).tolist())

        self.count += 1
        self.player.levels = {"n": self.count, "bands": frames}
