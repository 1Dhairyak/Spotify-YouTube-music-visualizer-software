"""Learns real word times by listening: loopback audio -> Whisper -> aligned to the lyrics -> saved in the cache."""
import logging, queue, threading, time
from pathlib import Path

from . import read_json, write_json
from .lyrics import WORD_TAG, match_heard, parse_lrc, words_for

log = logging.getLogger(__name__)


class Learner:
    """LRCLIB times lines, not words. While a song with lyrics plays, this records what the speakers play; every
    ~30 s Whisper (faster-whisper, optional) writes down the words it hears, and those that match the lyrics are
    saved into the lyrics cache with their real times. Replays, and choruses later in the same play, then follow
    the singing word for word. English only: Whisper's small.en model, about 5x faster than real time on the CPU."""
    RATE, BLOCK, CHUNK = 16000, 0.5, 30

    def __init__(self, player):
        self.player, self.jobs = player, queue.Queue(maxsize=3)

    def start(self):
        try:
            import faster_whisper  # noqa: F401
        except ImportError:
            log.info("faster-whisper is not installed: words inside a line stay estimated")
            return
        threading.Thread(target=self.record, daemon=True).start()
        threading.Thread(target=self.work, daemon=True).start()

    def wanted(self):
        """The lyrics worth listening for right now, or None."""
        p, ly = self.player, self.player.lyrics
        if p.playing and p.timed and ly and ly.get("file") and ly["lrc"].isascii() and not WORD_TAG.search(ly["lrc"]):
            return ly
        return None

    def record(self):
        import ctypes
        import numpy as np
        import soundcard as sc
        ctypes.windll.ole32.CoInitializeEx(None, 0)  # soundcard needs COM on this thread
        n = int(self.RATE * self.BLOCK)
        while True:
            try:  # reopened if the output device changes or goes away
                mic = sc.get_microphone(str(sc.default_speaker().name), include_loopback=True)
                with mic.recorder(samplerate=self.RATE) as rec:
                    buf, t0, ly = [], 0.0, None
                    while True:
                        block = rec.record(numframes=n).mean(axis=1)
                        now, cur = self.player.now(), self.wanted()  # song time at the end of this block
                        joined = bool(buf) and cur is ly and abs(now - (t0 + (len(buf) + 1) * self.BLOCK)) < 0.3
                        if buf and (not joined or len(buf) * self.BLOCK >= self.CHUNK):  # paused, seeked, new song or full
                            if len(buf) * self.BLOCK >= 8:
                                try:
                                    self.jobs.put_nowait((ly, t0, np.concatenate(buf).astype("float32")))
                                except queue.Full:  # Whisper is behind: skip this stretch, the next play fills it in
                                    pass
                            keep = buf[-4:] if joined else []  # 2 s overlap, so a word cut in half isn't lost
                            t0, buf = t0 + (len(buf) - len(keep)) * self.BLOCK, keep
                        if cur:
                            if not buf:
                                t0, ly = now - self.BLOCK, cur
                            buf.append(block)
            except Exception:
                log.exception("learner")
                time.sleep(5)

    def work(self):
        from faster_whisper import WhisperModel
        model = None
        while True:
            ly, t0, audio = self.jobs.get()
            try:
                if model is None:  # loaded on first use; the very first run downloads it (~480 MB)
                    model = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=4)
                segs, _ = model.transcribe(audio, language="en", word_timestamps=True, vad_filter=False,
                                           condition_on_previous_text=False)
                heard = [(t0 + w.start, w.word) for s in segs for w in s.words]
                got = match_heard(parse_lrc(ly["lrc"]), heard, t0, t0 + len(audio) / self.RATE)
                if got:
                    self.save(ly, got)
            except Exception:
                log.exception("learner")

    def save(self, ly, got):
        learned = ly.setdefault("learned", {})
        learned.update({str(i): t for i, t in got.items()})
        f = Path(ly["file"])
        data = read_json(f, {})
        write_json(f, {**data, "learned": learned})
        log.info("learned %d word times for %s - %s (%d so far)", len(got), ly["artist"], ly["title"], len(learned))
        if self.player.lyrics is ly:
            self.player.retime(words_for(ly))

