"""The mood model: volume-independent sound features, the shipped weights, fusion and the per-song state."""
import numpy as np

from lyric_constellation import mood
from lyric_constellation import window
from lyric_constellation.media import Player

R = 16000


def pad_and_beat():
    t = np.arange(R * 12) / R
    pad = (0.3 * np.sin(2 * np.pi * 220 * t) + 0.2 * np.sin(2 * np.pi * 330 * t)) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.2 * t))
    beat, g = 0.1 * np.sin(2 * np.pi * 440 * t), np.random.default_rng(0)
    for k in np.arange(0, 12, 0.5):   # kick and hi-hat at 120 bpm
        i, j = int(k * R), int((k + 0.25) * R)
        beat[i:i + 2000] += np.sin(2 * np.pi * 60 * np.arange(2000) / R) * np.exp(-np.arange(2000) / 400)
        beat[j:j + 600] += g.normal(0, 0.3, 600) * np.exp(-np.arange(600) / 100)
    return pad, beat


def test_sound_features_ignore_volume_and_tell_pads_from_beats():
    pad, beat = pad_and_beat()
    fp, fb = mood.mean_features(mood.windows(pad)), mood.mean_features(mood.windows(beat))
    assert np.allclose(fp, mood.mean_features(mood.windows(pad * 0.1)), rtol=1e-3, atol=1e-5)
    assert np.allclose(fb, mood.mean_features(mood.windows(beat * 0.05)), rtol=1e-3, atol=1e-5)
    f = dict(zip(mood.AUDIO_FEATURES, zip(fp, fb)))
    assert f["onsets"][0] < 0.5 < 2 < f["onsets"][1]   # a sustained pad has no hits; the beat about 4 a second
    assert f["flux"][0] < f["flux"][1] and f["beat"][0] < f["beat"][1]
    assert mood.audio_features(np.zeros(R * 3)) is None   # silence


SAD = "\n".join(f"[00:{10 + 6 * i:02d}.00]{line}" for i, line in enumerate([
    "I cry alone tonight", "tears fall since you left me", "my heart is broken I miss you", "the empty room still holds your goodbye",
    "I wait for you in the rain", "lonely nights remember your love"]))
PARTY = "\n".join(f"[00:{10 + 2 * i:02d}.00]{line}" for i, line in enumerate([
    "put your hands up everybody dance with me tonight", "turn the music up the party just started baby",
    "shake it on the floor we gonna do it all night long", "the DJ play my song come on let me see you move",
    "shots up let's go we celebrate tonight", "jump jump everybody in the club put your hands up"]))


def test_shipped_model_reads_lyrics_the_right_way():
    assert mood.MODEL, "mood_model.json is missing: run python tools/train_mood.py train"
    zs, zp = mood.lyric_logit(SAD), mood.lyric_logit(PARTY)
    assert zs > 0 > zp and mood.sigmoid(zs) > 0.6 > 0.4 > mood.sigmoid(zp)
    assert mood.lyric_logit("") is None and mood.lyric_logit("[00:01.00]hi") is None   # too little to judge


def test_fusion_starts_on_lyrics_and_trusts_the_sound_once_heard():
    assert mood.fuse(None, None, 0) is None
    assert mood.fuse(2.0, None, 0) == mood.sigmoid(2.0)
    assert mood.fuse(None, -1.0, 5) == mood.sigmoid(-1.0)
    assert mood.fuse(2.0, -3.0, 0) == mood.sigmoid(2.0)   # nothing heard yet: lyrics only
    early, late = mood.fuse(2.0, -3.0, 6), mood.fuse(2.0, -3.0, 60)
    assert 0 < late < early < mood.sigmoid(2.0) < 1


def test_player_keeps_one_mood_per_song():
    p = Player()
    p.tid = 1
    p.publish("Song", "Artist", None, [], "Finding lyrics…")
    first = p.mood
    first.add(dict.fromkeys(mood.AUDIO_FEATURES, 0.1), 10)
    p.publish("Song", "Artist", None, [], "", {"lrc": SAD})   # lyrics arrive later: same song, sound kept
    assert p.mood is first and first.heard == 10 and first.zl is not None
    p.tid = 2
    p.publish("Other", "Artist", None, [], "")
    assert p.mood is not first and p.mood.heard == 0 and p.mood.value() is None


def test_calm_or_lively_lasts_for_one_song(tmp_path, monkeypatch):
    monkeypatch.setattr(window, "SETTINGS", tmp_path / "settings.json")
    p = Player()
    api = window.Api(p)
    assert api.state()["mood"] == "auto"
    api.set_mood("calm")   # no song yet: nothing to apply it to
    assert api.state()["mood"] == "auto"
    p.tid = 1
    p.publish("Song", "Artist", None, [], "")
    api.set_mood("calm")
    assert api.state()["mood"] == "calm"
    p.publish("Song", "Artist", None, [], "", {"lrc": SAD})   # lyrics arrive for the same song: the choice stays
    assert api.state()["mood"] == "calm"
    api.set_mood("nonsense")
    assert api.state()["mood"] == "calm"
    p.tid = 2
    p.publish("Other", "Artist", None, [], "")
    assert api.state()["mood"] == "auto"
