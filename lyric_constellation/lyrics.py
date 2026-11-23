"""Everything about lyrics: downloading them, reading their time stamps, and working out when each word is sung.

Lyrics come from LRCLIB (lrclib.net, free, no account) in the "LRC" format, where each line starts with the
time it is sung:
    [00:12.50] I've been reading books of old
    [00:16.10] The legends and the myths
Some LRC files also time each word, like  <00:12.50> I've <00:12.90> been  ("enhanced LRC").

The main steps, in the order the app uses them:
  clean()          tidy the title the music player reports ("Song (Official Video)" -> "Song")
  fetch_lyrics()   get the LRC text, from the cache folder or from LRCLIB
  words_for()      turn it into a list of words, each with the second it is sung
  cover_url()      find large album art on iTunes
"""
import difflib
import json
import re
import urllib.error
import urllib.parse
import urllib.request

from . import DATA, __version__, read_json, write_json

CACHE = DATA / "cache"   # one JSON file per song, so a song's lyrics are downloaded only once
# Polite APIs ask clients to say who they are.
UA = {"User-Agent": f"LyricConstellation/{__version__} (https://github.com/1Dhairyak/Spotify-YouTube-music-visualizer-software)"}
WORD_PACE = 0.07   # seconds per "weight unit" of a word (its length + 2): how fast we assume a line is sung

# ---------- reading the LRC format ----------

LINE_TAG = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\]")              # [mm:ss.xx] at the start of a line
WORD_TAG = re.compile(r"<(\d+):(\d+(?:\.\d+)?)>\s*([^<]*)")      # <mm:ss.xx> word  (enhanced LRC only)


def parse_lrc(text):
    """LRC text -> a sorted list of (seconds, line text).
    One line can have several time tags (a chorus written once but sung 3 times): it is listed once per tag."""
    out = []
    for raw in text.splitlines():
        body = LINE_TAG.sub("", raw).strip()
        for minutes, seconds in LINE_TAG.findall(raw):
            out.append((int(minutes) * 60 + float(seconds), body))
    return sorted(out)


def word_times(lines):
    """[(seconds, line)] -> [{"t": seconds, "w": word}], one entry per sung word.
    The last word of each line also gets "end": True (the looks draw those bigger)."""
    words = []
    for i, (start, body) in enumerate(lines):
        tagged = WORD_TAG.findall(body)
        if tagged:
            # Enhanced LRC: every word already has its own time.
            line = [{"t": int(m) * 60 + float(s), "w": w.strip()} for m, s, w in tagged if w.strip()]
        else:
            # ponytail: plain LRC only times the line, so we spread its words out by their length
            # (long words take longer to sing). Learner later replaces these guesses with what it hears.
            line_words = body.split()
            if i + 1 < len(lines):
                gap = lines[i + 1][0] - start   # time until the next line
            else:
                gap = 4.0
            weights = [len(w) + 2 for w in line_words]
            total = sum(weights)
            # Sing at WORD_PACE, but always finish before the next line starts.
            span = min(gap * 0.9, total * WORD_PACE)
            line = []
            for k, word in enumerate(line_words):
                # this word starts after the words before it: their share of the line's total weight
                line.append({"t": round(start + span * sum(weights[:k]) / total, 3), "w": word})
        if line:
            line[-1]["end"] = True
        words += line
    return words


def line_spans(lines):
    """[(seconds, line)] -> for each line: (its start, the next line's start, index of its first word, its word count).
    The word indexes match the list word_times() returns."""
    out = []
    first_word = 0
    for k, (start, body) in enumerate(lines):
        n_words = len(body.split())
        if k + 1 < len(lines):
            next_start = lines[k + 1][0]
        else:
            next_start = start + 4.0
        out.append((start, next_start, first_word, n_words))
        first_word += n_words
    return out


def words_for(lyrics):
    """Lyrics from fetch_lyrics -> the word list for the screen, using the times Learner heard where it has them.

    Line starts always stay as LRCLIB has them. A line that is sung again (a chorus) borrows the word times
    heard for its twin, measured from the line's start. Words that were not heard keep the spacing of the
    guess, stretched to fit between the nearest words that were heard."""
    lines = parse_lrc(lyrics["lrc"])
    words = word_times(lines)
    learned = lyrics.get("learned")   # {"word index": seconds}, saved by Learner
    if not learned or WORD_TAG.search(lyrics["lrc"]):
        return words

    spans = list(zip(line_spans(lines), (body.lower() for _, body in lines)))

    # 1. For every line text, collect the heard offsets (seconds after the line starts) of its words.
    twin = {}   # line text -> {word number in line: seconds after the line starts}
    for (start, _, first, count), text in spans:
        for k in range(1, count):
            if str(first + k) in learned:
                twin.setdefault(text, {})[k] = learned[str(first + k)] - start

    # 2. Re-time each line: its own heard words first, then what its twins heard.
    for (start, next_start, first, count), text in spans:
        got = {k: start + offset for k, offset in twin.get(text, {}).items()}
        got.update({k: learned[str(first + k)] for k in range(1, count) if str(first + k) in learned})
        if not got:
            continue

        guess = [words[first + k]["t"] for k in range(count)]
        anchors = sorted({0: start, **got}.items())   # (word number, time) for every word we know for sure
        for k in range(1, count):
            if k in got:
                new = got[k]
            else:
                # Not heard: place it between the nearest known words before (a) and after (b),
                # keeping the guess's spacing, stretched to fit.
                a = max(x for x in anchors if x[0] < k)
                b = next((x for x in anchors if x[0] > k), None)
                if b:
                    guess_gap = (guess[b[0]] - guess[a[0]]) or 1
                    stretch = (b[1] - a[1]) / guess_gap
                else:
                    stretch = 1
                new = a[1] + (guess[k] - guess[a[0]]) * stretch
            # Never before the previous word, never after the next line starts.
            earliest = words[first + k - 1]["t"] + 0.05
            latest = next_start - 0.05
            words[first + k]["t"] = round(min(max(new, earliest), latest), 3)
    return words


def match_heard(lines, heard, start, end):
    """Whisper's words [(song seconds, word)] heard between start and end -> {word index: seconds}
    for the lyric words it clearly heard.

    "Clearly" means: in a run of 2 or more words in the same order as the lyrics (a lone "you" or "the"
    could match anywhere), and each heard inside its own line's time."""
    def norm(w):   # compare words without capitals or punctuation: "Don't," -> "dont"
        return re.sub(r"[^a-z0-9]", "", w.lower())

    # The lyric words near this stretch of the song: (word, word index, line start, next line start)
    lyric = []
    for (t, t_next, first, _), (_, body) in zip(line_spans(lines), lines):
        if t_next > start - 1 and t < end + 1:
            lyric += [(norm(w), first + k, t, t_next) for k, w in enumerate(body.split())]
    heard = [(t, norm(w)) for t, w in heard if norm(w)]

    # difflib finds the longest runs of words the two lists share, in order (like a "diff" of two texts).
    matcher = difflib.SequenceMatcher(None, [x[0] for x in lyric], [w for _, w in heard], autojunk=False)
    out = {}
    last = -1.0
    for block in matcher.get_matching_blocks():
        if block.size < 2:   # a lone word matches anywhere: ignore it
            continue
        lyric_run = lyric[block.a:block.a + block.size]
        heard_run = heard[block.b:block.b + block.size]
        for (_, index, t, t_next), (heard_at, _) in zip(lyric_run, heard_run):
            if t - 0.3 <= heard_at < t_next and heard_at > last:
                out[index] = round(heard_at, 3)
                last = heard_at
    return out


# ---------- cleaning up titles ----------

# "(Official Video)", "[Lyrics]", "(HD)" ... : never part of the song's name
JUNK = re.compile(r"[(\[][^)\]]*\b(official|lyrics?|video|audio|visuali[sz]er|hd|4k|mv|remaster(ed)?)\b[^)\]]*[)\]]", re.I)
# "Song - Acoustic", "Song - Live": the part after " - " names a version, not the artist
VERSION = re.compile(r"\b(acoustic|live|remix|remaster(ed)?|version|edit|mix|unplugged|lo-?fi|slowed|reverb|"
                     r"sped up|instrumental|reprise|cover)\b", re.I)
# "feat. Someone", "(ft. Someone)"
FEAT = re.compile(r"\s*[(\[]?\s*\b(ft|feat|featuring)\b\.?[^)\]]*[)\]]?", re.I)


def clean(title, artist, browser=False):
    """The title and artist a player reports -> (artist, title) clean enough to look up lyrics.
    `browser`: it came from a web browser (YouTube), where the video title is usually "Artist - Song"."""
    title = (title or "").replace("–", "-").replace("—", "-")   # all kinds of dashes -> "-"
    title = JUNK.sub("", title).split("|")[0]
    artist = re.sub(r"\s*-\s*Topic$|VEVO$", "", artist or "").strip()   # YouTube channel names: "Artist - Topic"

    if " - " in title:
        left, right = title.split(" - ", 1)
        if browser and not VERSION.search(right):
            artist, title = left, right          # "Artist - Song"
        else:
            title = left                         # "Jhol - Acoustic", "Song - Remastered 2011", "Song - Live"

    # Only the first artist: "A, B & C" -> "A"
    artist = re.split(r",|&|;| x | feat\.? | ft\.? ", FEAT.sub("", artist), maxsplit=1, flags=re.I)[0]
    return artist.strip(), FEAT.sub("", title).strip(" -")


def cache_key(artist, title):
    """Artist + title -> a simple file name: lowercase letters, digits and spaces only."""
    return re.sub(r"[\W_]+", " ", f"{artist} {title}".lower()).strip()


# ---------- downloading ----------

def http_json(url):
    """Download a URL and read it as JSON (waits at most 10 seconds)."""
    request = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def fetch_lyrics(artist, title, duration=None):
    """Time-stamped lyrics, from the cache or LRCLIB -> {"artist", "title", "lrc", "duration", "learned"?, "file"}.
    Returns None if no synced lyrics exist.

    `duration` (seconds) helps pick the right version. A cached copy whose length is off by more than 3 s
    (a music video with an intro, an extended mix) is looked up again."""
    f = CACHE / f"{cache_key(artist, title)}.json"
    cached = read_json(f)
    if cached:
        cached["file"] = str(f)   # Learner saves what it hears into this file
        cached_length = cached.get("duration") or 0
        wrong_version = duration and abs(cached_length - duration) > 3
        if not wrong_version:
            return cached

    query = {"artist_name": artist, "track_name": title}
    if duration:
        query["duration"] = round(duration)
    try:
        # First try an exact match...
        try:
            hit = http_json("https://lrclib.net/api/get?" + urllib.parse.urlencode(query))
        except urllib.error.HTTPError as e:
            if e.code != 404:   # 404 just means "not found"; any other error is a real problem
                raise
            hit = None
        # ...then a search, taking the result whose length is closest to the song's.
        if not (hit and hit.get("syncedLyrics")):
            found = http_json("https://lrclib.net/api/search?" + urllib.parse.urlencode({"q": f"{artist} {title}"}))
            found = [r for r in found if r.get("syncedLyrics")]
            if duration:
                found.sort(key=lambda r: abs((r.get("duration") or 0) - duration))
            hit = found[0] if found else None
    except OSError:   # offline: a copy of another version still beats no lyrics at all
        return cached

    if not hit:
        return cached
    data = {"artist": hit["artistName"], "title": hit["trackName"], "lrc": hit["syncedLyrics"], "duration": hit.get("duration")}
    write_json(f, data)
    return {**data, "file": str(f)}


def itunes_song(artist, title, country="US"):
    """The iTunes catalogue's entry for a song (album art, 30 s preview, genre), or None.
    Only trusts a result by the same artist, so an unknown song isn't mistaken for another song with its name."""
    query = urllib.parse.urlencode({"term": f"{artist} {title}", "entity": "song", "limit": 5, "country": country})
    results = http_json("https://itunes.apple.com/search?" + query)["results"]
    a = artist.lower()
    for r in results:
        b = r["artistName"].lower()
        if a and (a in b or b in a):
            return r
    return None


def cover_url(artist, title):
    """Large (1200 px) album art from iTunes. Players only give Windows a small blurry thumbnail."""
    hit = itunes_song(artist, title)
    if not hit:
        return None
    return hit["artworkUrl100"].replace("100x100", "1200x1200")
