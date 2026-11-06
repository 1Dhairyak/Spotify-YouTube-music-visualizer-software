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
