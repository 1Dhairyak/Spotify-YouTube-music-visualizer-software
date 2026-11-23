"""Learns the real moment each word is sung, by listening.

The lyrics site (LRCLIB) only tells us when each LINE starts, not each word, so at first the app guesses
the word times. While an English song plays, this file:
 1. collects ~30 seconds of what the speakers play,
 2. gives it to Whisper (a speech-recognition model, run on the CPU by the faster-whisper library),
    which writes down the words it hears and when,
 3. matches those words against the lyrics (lyrics.match_heard),
 4. saves the matched times in the lyrics cache file.
The next time the song plays (or the chorus comes round again), the words follow the singing exactly.

faster-whisper is optional: without it, nothing here runs and the word times stay estimated.
"""
import logging
import queue
import threading
from pathlib import Path

import numpy as np

from . import read_json, write_json
from .audio import RATE
from .lyrics import WORD_TAG, match_heard, parse_lrc, words_for

log = logging.getLogger(__name__)


class Learner:
    """Records stretches of a song and has Whisper (small.en model, ~5x faster than real time) find its word times."""

    BLOCK = 0.5   # seconds of sound per piece we get from Speakers
    CHUNK = 30    # seconds of sound per Whisper job

    def __init__(self, player):
        self.player = player
        self.jobs = queue.Queue(maxsize=3)   # recordings waiting for Whisper (at most 3, so memory stays small)
        self.buf = []                        # the pieces of the recording in progress
        self.buffer_start = 0.0              # the song time (seconds) where that recording starts
        self.lyrics = None                   # the lyrics of the song being recorded

    def start(self, speakers):
        """Start listening, but only if faster-whisper is installed."""
        try:
            import faster_whisper  # noqa: F401
        except ImportError:
            log.info("faster-whisper is not installed: words inside a line stay estimated")
            return
        speakers.listen(self.BLOCK, self.hear)
        threading.Thread(target=self.work, daemon=True).start()   # Whisper is slow: it gets its own thread

    def wanted(self):
        """The lyrics worth listening for right now, or None.
        Only when: the music plays, we know the exact position, the lyrics are cached, they are English
        (plain ASCII letters), and they don't already come with word times."""
        p = self.player
        lyrics = p.lyrics
        if not (p.playing and p.timed and lyrics and lyrics.get("file")):
            return None
        if not lyrics["lrc"].isascii() or WORD_TAG.search(lyrics["lrc"]):
            return None
        return lyrics

    def hear(self, block):
        """Called with every half second of sound. Adds it to the recording, and sends the recording to Whisper
        when it is full, or when it must stop (pause, jump in the song, or a new song)."""
        now = self.player.now()   # song time at the end of this block
        current = self.wanted()
        buf = self.buf

        # Does this block carry straight on from the recording we have? (same song, and no jump in time)
        expected_now = self.buffer_start + (len(buf) + 1) * self.BLOCK
        continues = bool(buf) and current is self.lyrics and abs(now - expected_now) < 0.3
        is_full = len(buf) * self.BLOCK >= self.CHUNK

        if buf and (not continues or is_full):
            if len(buf) * self.BLOCK >= 8:   # under 8 s is too short for Whisper to be useful
                audio = np.concatenate(buf).astype("float32")
                try:
                    self.jobs.put_nowait((self.lyrics, self.buffer_start, audio))
                except queue.Full:   # Whisper is behind: skip this stretch, a later play will fill it in
                    pass
            # Keep the last 2 s when carrying on, so a word cut in half at the edge is heard whole next time.
            keep = buf[-4:] if continues else []
            self.buffer_start = self.buffer_start + (len(buf) - len(keep)) * self.BLOCK
            self.buf = keep

        if current:
            if not self.buf:   # a new recording starts with this block
                self.buffer_start = now - self.BLOCK
                self.lyrics = current
            self.buf.append(block)

    def work(self):
        """The Whisper thread: takes recordings from the queue, one at a time, forever."""
        from faster_whisper import WhisperModel

        model = None
        while True:
            lyrics, start, audio = self.jobs.get()
            try:
                if model is None:   # loaded on first use; the very first time it downloads (~480 MB)
                    model = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=4)
                segments, _ = model.transcribe(audio, language="en", word_timestamps=True, vad_filter=False,
                                               condition_on_previous_text=False)
                # Each heard word with its time in the song (Whisper's times count from the recording's start).
                heard = [(start + word.start, word.word) for segment in segments for word in segment.words]
                end = start + len(audio) / RATE
                got = match_heard(parse_lrc(lyrics["lrc"]), heard, start, end)
                if got:
                    self.save(lyrics, got)
            except Exception:
                log.exception("learner")

    def save(self, lyrics, got):
        """Add the newly learned word times to the song's cache file, and update the screen if it's still playing."""
        learned = lyrics.setdefault("learned", {})
        learned.update({str(index): seconds for index, seconds in got.items()})   # JSON keys must be text

        f = Path(lyrics["file"])
        data = read_json(f, {})
        write_json(f, {**data, "learned": learned})
        log.info("learned %d word times for %s - %s (%d so far)", len(got), lyrics["artist"], lyrics["title"], len(learned))

        if self.player.lyrics is lyrics:
            self.player.retime(words_for(lyrics))
