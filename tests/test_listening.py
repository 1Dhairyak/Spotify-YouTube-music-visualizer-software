"""The shared speaker recorder, the beat finder, the word learner fed by it, and seeking."""
import asyncio, sys, threading, types

import numpy as np
import pytest

from lyric_constellation import audio, beat
from lyric_constellation.audio import RATE, Speakers
from lyric_constellation.learner import Learner
from lyric_constellation.media import Player
from lyric_constellation.mood import MoodListener


def clicks(bpm, secs=8, start=0.2, noise=0.002):
    x = np.random.default_rng(1).normal(0, noise, RATE * secs).astype(np.float32)
    at = np.arange(start, secs, 60 / bpm)
    for t in at:
        i = int(t * RATE)
        x[i:i + 800] += (np.sin(2 * np.pi * 80 * np.arange(800) / RATE) * np.exp(-np.arange(800) / 150))[:len(x[i:i + 800])]
    return x, at


def test_speakers_gives_each_listener_its_block_size_and_survives_a_bad_one():
    s, a, b = Speakers(), [], []
    s.listen(0.5, a.append)
    s.listen(1, b.append)
    s.listen(0.1, lambda _: 1 / 0)
    for _ in range(10):
        s.feed(np.zeros(1600))
    assert [len(x) for x in a] == [8000, 8000] and [len(x) for x in b] == [16000]


def test_speakers_reopens_when_the_device_goes_away(monkeypatch):
    opened, got = [], []

    class Rec:
        def __enter__(self):
            opened.append(1)
            return self

        def __exit__(self, *a):
            if len(opened) == 1:
                raise RuntimeError("Error 0x100000001")   # what soundcard really did when the device vanished

        def record(self, numframes):
            if len(opened) == 1:
                raise RuntimeError("Error 0x88890004")
            if got:
                raise SystemExit   # ends the test: run() only stops for this
            return np.zeros((numframes, 2))

    mic = types.SimpleNamespace(recorder=lambda samplerate: Rec())
    monkeypatch.setitem(sys.modules, "soundcard", types.SimpleNamespace(
        default_speaker=lambda: types.SimpleNamespace(name="x"), get_microphone=lambda *a, **k: mic))
    monkeypatch.setattr(audio.time, "sleep", lambda s: None)
    s = Speakers()
    s.listen(0.1, got.append)
    with pytest.raises(SystemExit):
        s.run()
    assert len(opened) == 2 and len(got) == 1


@pytest.mark.parametrize("bpm", [75, 90, 120, 140, 170])
def test_beat_finds_tempo_and_phase(bpm):
    x, at = clicks(bpm)
    got = beat.analyze(x)
    assert abs(got["bpm"] - bpm) < 3 and got["conf"] > 0.3
    last = len(x) / RATE - got["ago"]
    assert np.abs(at - last).min() < 0.05, "the last beat should land on a click"


def test_beat_stays_quiet_without_a_beat():
    assert beat.analyze(np.zeros(RATE * 8)) is None
    assert beat.analyze(np.zeros(RATE)) is None   # too short
    noise = np.random.default_rng(2).normal(0, 0.2, RATE * 8).astype(np.float32)
    assert beat.analyze(noise)["conf"] < 0.3
    x, _ = clicks(120)
    a, b = beat.analyze(x), beat.analyze(x * 0.05)   # the volume changes nothing
    assert abs(a["bpm"] - b["bpm"]) < 0.5 and abs(a["ago"] - b["ago"]) < 0.04


def test_beat_listener_follows_the_song_and_pauses():
    p = Player()
    p.tid, p.playing = 1, True
    L = beat.BeatListener(p)
    x, _ = clicks(120, secs=6)
    for i in range(6):
        L.hear(x[i * RATE:(i + 1) * RATE])
    assert p.beat and abs(p.beat["bpm"] - 120) < 3 and 0 < p.beat["energy"] <= 1
    ui = beat.for_ui(p.beat)
    assert "at" not in ui and ui["ago"] >= -beat.LAG
    n = p.beat["n"]
    p.tid = 2                              # a new song: the old beat is forgotten at once
    L.hear(x[:RATE])
    assert p.beat is None and len(L.buf) == RATE
    p.playing = False
    L.hear(x[:RATE])
    assert p.beat is None and len(L.buf) == 0 and n >= 1
    assert beat.for_ui(None) is None


def test_learner_sends_whisper_chunks_of_what_it_hears():
    p = Player()
    p.playing, p.timed = True, True
    p.lyrics = {"file": "x.json", "lrc": "[00:01.00]hello there", "artist": "A", "title": "T"}
    p.set_clock(0, True)
    L = Learner(p)
    t = {"now": 0.0}
    p.now = lambda: t["now"]
    for _ in range(62):                    # 31 s of half-second blocks
        t["now"] += L.BLOCK
        L.hear(np.zeros(RATE // 2))
    ly, t0, sound = L.jobs.get_nowait()
    assert ly is p.lyrics and t0 == 0.0 and len(sound) == 30 * RATE
    assert len(L.buf) < 10                 # the chunk left the buffer, a 2 s overlap stayed


def test_mood_listener_measures_ten_second_windows():
    p = Player()
    p.tid, p.playing = 1, True
    p.publish("Song", "Artist", None, [], "")
    L = MoodListener(p)
    t = np.arange(RATE * 2) / RATE
    tone = 0.3 * np.sin(2 * np.pi * 220 * t)
    for _ in range(6):                     # the first block only notices the new song
        L.hear(tone)
    assert p.mood.heard == 10 and len(p.mood.ws) == 1


def test_seek_goes_to_the_player_and_stays_in_range():
    asked = []

    class Session:
        async def try_change_playback_position_async(self, ticks):
            asked.append(ticks)

    loop = asyncio.new_event_loop()
    th = threading.Thread(target=loop.run_forever, daemon=True)
    th.start()
    p = Player()
    p.seek(30)                             # no player yet: nothing happens, nothing breaks
    assert not asked and p.now() < 1
    p.session, p.loop, p.dur, p.can_seek = Session(), loop, 200.0, True
    p.seek(42.5)
    p.seek(9999)
    p.seek(-5)
    p.can_seek = False
    p.seek(7)
    asyncio.run_coroutine_threadsafe(asyncio.sleep(0), loop).result(2)
    loop.call_soon_threadsafe(loop.stop)
    th.join(2)
    assert sorted(asked) == [0, 425_000_000, 2_000_000_000]
    assert p.pos == 0.0 and p.seeking_until > 0
