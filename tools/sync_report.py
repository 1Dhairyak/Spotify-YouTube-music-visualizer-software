"""How far off is the first guess of each word's time? Developer tool, not part of the app.

  python tools/sync_report.py

Lyrics sites only time each line, so the app first spreads a line's words out by their length (lyrics.word_times).
Later Whisper hears when each word is really sung and saves it in the song's cache file ("learned").
This compares the two for every learned word in the cache and prints the median and mean gap.
"""
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))   # so it runs from any folder
from lyric_constellation import read_json  # noqa: E402
from lyric_constellation.lyrics import CACHE, WORD_TAG, parse_lrc, word_times  # noqa: E402


def errors(song):
    """One cache file's data -> [seconds between the guessed and the heard time, for each learned word]."""
    learned = song.get("learned")
    if not learned or WORD_TAG.search(song["lrc"]):   # enhanced LRC already has real word times: nothing to guess
        return []
    guess = word_times(parse_lrc(song["lrc"]))
    return [abs(guess[int(i)]["t"] - heard) for i, heard in learned.items() if int(i) < len(guess)]


def main():
    per_song = [errors(read_json(f) or {}) for f in CACHE.glob("*.json")]
    per_song = [e for e in per_song if e]
    gaps = [g for e in per_song for g in e]
    if not gaps:
        print("No learned word times yet: play some English songs with the app first.")
        return
    print(f"{len(per_song)} songs, {len(gaps)} words learned by listening")
    print(f"guess was off by: median {statistics.median(gaps) * 1000:.0f} ms, mean {statistics.mean(gaps) * 1000:.0f} ms")


if __name__ == "__main__":
    main()
