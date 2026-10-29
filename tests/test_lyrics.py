"""The lyrics pipeline: LRC parsing, word timing, title cleanup, the cache and learned word times."""
import pytest

from lyric_constellation import lyrics, read_json, write_json
from lyric_constellation.lyrics import cache_key, clean, fetch_lyrics, match_heard, parse_lrc, word_times, words_for


def test_parse_lrc_and_word_times():
    lines = parse_lrc("[00:12.00]We don't talk anymore\n[00:15.50][01:00.00]Like we used to do\n[00:20.00]")
    assert lines[0] == (12.0, "We don't talk anymore") and lines[-1][0] == 60.0
    w = word_times(lines)
    assert [x["w"] for x in w[:4]] == ["We", "don't", "talk", "anymore"]
    assert w[0]["t"] == 12.0 and all(a["t"] < b["t"] for a, b in zip(w[:4], w[1:4])) and w[3]["t"] < 15.5
    assert w[4] == {"t": 15.5, "w": "Like"} and len(w) == 14  # repeated [01:00] line counted twice
    assert [x["w"] for x in w if x.get("end")] == ["anymore", "do", "do"]  # line-end words drawn big


def test_enhanced_lrc_keeps_its_word_times():
    assert word_times([(5.0, "<00:05.00>hey <00:05.80>there")]) \
        == [{"t": 5.0, "w": "hey"}, {"t": 5.8, "w": "there", "end": True}]


@pytest.mark.parametrize("title, artist, browser, want", [
    ("Charlie Puth - We Don't Talk Anymore (feat. Selena Gomez) [Official Video]", "Charlie Puth", True,
     ("Charlie Puth", "We Don't Talk Anymore")),
    ("We Don't Talk Anymore (feat. Selena Gomez)", "Charlie Puth, Selena Gomez", False,
     ("Charlie Puth", "We Don't Talk Anymore")),
    ("Shape of You - Remastered 2017", "Ed Sheeran", False, ("Ed Sheeran", "Shape of You")),
    ("Believer", "Imagine Dragons - Topic", True, ("Imagine Dragons", "Believer")),
    ("Jhol - Acoustic", "Maanu", True, ("Maanu", "Jhol")),  # a version, not "Artist - Song"
    # messy YouTube titles
    ("The Weeknd - Blinding Lights (Official Audio)", "TheWeekndVEVO", True, ("The Weeknd", "Blinding Lights")),
    ("Maroon 5 – Maps (Lyric Video) | HD", "Maroon 5", True, ("Maroon 5", "Maps")),
    ("Closer ft. Halsey", "The Chainsmokers & Halsey", False, ("The Chainsmokers", "Closer")),
])
def test_clean(title, artist, browser, want):
    assert clean(title, artist, browser) == want


def test_cache_key():
    assert cache_key("Charlie Puth", "We Don't Talk Anymore") == "charlie puth we don t talk anymore"


def test_cached_version_is_used_without_network(tmp_path, monkeypatch):
    monkeypatch.setattr(lyrics, "CACHE", tmp_path)
    monkeypatch.setattr(lyrics, "http_json", lambda url: pytest.fail("should not ask LRCLIB"))
    write_json(tmp_path / "a b.json", {"artist": "A", "title": "B", "lrc": "x", "duration": 200})
    assert fetch_lyrics("A", "B", 202)["lrc"] == "x" and fetch_lyrics("A", "B")["lrc"] == "x"


def test_damaged_json_reads_as_default(tmp_path):
    (tmp_path / "bad.json").write_text('{"half": ', "utf-8")
    assert read_json(tmp_path / "bad.json", {}) == {} and read_json(tmp_path / "missing.json") is None


def test_learned_word_times():
    """Heard words move, unheard ones keep their spacing, the repeated line borrows them."""
    lrc = "[00:10.00]I miss the taste of a sweet life\n[00:14.00]Hello there\n[00:20.00]I miss the taste of a sweet life\n[00:24.00]"
    heard = [(10.02, "I"), (11.1, "miss"), (11.4, "the"), (11.9, "taste"), (12.5, "of"), (13.0, "sweet"), (25.0, "noise")]
    got = match_heard(parse_lrc(lrc), heard, 9.5, 14)
    assert got == {0: 10.02, 1: 11.1, 2: 11.4, 3: 11.9, 4: 12.5}  # "sweet" alone (no run of 2) is not trusted
    w = words_for({"lrc": lrc, "learned": {str(i): t for i, t in got.items()}})
    assert [x["t"] for x in w[:5]] == [10.0, 11.1, 11.4, 11.9, 12.5] and 12.5 < w[5]["t"] < w[6]["t"] < 14
    assert [round(x["t"] - 20, 2) for x in w[10:15]] == [0, 1.1, 1.4, 1.9, 2.5]  # the chorus repeat, from 20 s
    assert words_for({"lrc": lrc})[1]["t"] < 11  # nothing learned: the guess
