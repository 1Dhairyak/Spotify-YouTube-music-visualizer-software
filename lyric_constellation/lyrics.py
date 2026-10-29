"""Synced lyrics: LRC parsing, per-word timing, title cleanup and the LRCLIB / iTunes lookups."""
import difflib, json, re, urllib.error, urllib.parse, urllib.request

from . import DATA, __version__, read_json, write_json

CACHE = DATA / "cache"
UA = {"User-Agent": f"LyricConstellation/{__version__} (https://github.com/1Dhairyak/Spotify-YouTube-music-visualizer-software)"}
WORD_PACE = 0.07  # seconds per weight unit (len(word) + 2): how fast a line is sung when the gap is long

# ---------- lyrics ----------

LINE_TAG = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\]")
WORD_TAG = re.compile(r"<(\d+):(\d+(?:\.\d+)?)>\s*([^<]*)")


def parse_lrc(text):
    """LRC text -> sorted [(seconds, line)]. A line may carry several [mm:ss] tags."""
    out = []
    for raw in text.splitlines():
        body = LINE_TAG.sub("", raw).strip()
        out += [(int(m) * 60 + float(s), body) for m, s in LINE_TAG.findall(raw)]
    return sorted(out)


def word_times(lines):
    """[(seconds, line)] -> [{"t": seconds, "w": word}], one entry per sung word.
    The last word of each line also gets "end": True (the UI draws those big)."""
    words = []
    for i, (t, body) in enumerate(lines):
        tagged = WORD_TAG.findall(body)
        if tagged:  # enhanced LRC carries its own word times
            line = [{"t": int(m) * 60 + float(s), "w": w.strip()} for m, s, w in tagged if w.strip()]
        else:
            # ponytail: line-synced LRC only, so words are spread by length; real word sync needs enhanced LRC
            ws = body.split()
            gap = lines[i + 1][0] - t if i + 1 < len(lines) else 4.0
            weights = [len(w) + 2 for w in ws]
            span = min(gap * 0.9, sum(weights) * WORD_PACE)
            line = [{"t": round(t + span * sum(weights[:k]) / sum(weights), 3), "w": w} for k, w in enumerate(ws)]
        if line:
            line[-1]["end"] = True
        words += line
    return words


def line_spans(lines):
    """[(seconds, line)] -> [(start, next line's start, index of its first word, word count)], in word_times' order."""
    out, i = [], 0
    for k, (t, body) in enumerate(lines):
        n = len(body.split())
        out.append((t, lines[k + 1][0] if k + 1 < len(lines) else t + 4.0, i, n))
        i += n
    return out


def words_for(lyrics):
    """Lyrics from fetch_lyrics -> words, with the times Learner heard laid over the guesses.
    Line starts stay as LRCLIB has them; a line sung again (a chorus) borrows what was heard for its twin."""
    lines = parse_lrc(lyrics["lrc"])
    words, learned = word_times(lines), lyrics.get("learned")
    if not learned or WORD_TAG.search(lyrics["lrc"]):
        return words
    spans = list(zip(line_spans(lines), (body.lower() for _, body in lines)))
    twin = {}  # line text -> {word number: seconds after the line starts}
    for (t, _, i, n), text in spans:
        for k in range(1, n):
            if str(i + k) in learned:
                twin.setdefault(text, {})[k] = learned[str(i + k)] - t
    for (t, t_next, i, n), text in spans:
        got = {k: t + v for k, v in twin.get(text, {}).items()}
        got.update({k: learned[str(i + k)] for k in range(1, n) if str(i + k) in learned})
        if not got:
            continue
        guess = [words[i + k]["t"] for k in range(n)]
        anchors = sorted({0: t, **got}.items())
        for k in range(1, n):
            if k in got:
                new = got[k]
            else:  # not heard: keep the guess's spacing between the nearest heard words
                a = max(x for x in anchors if x[0] < k)
                b = next((x for x in anchors if x[0] > k), None)
                new = a[1] + (guess[k] - guess[a[0]]) * ((b[1] - a[1]) / ((guess[b[0]] - guess[a[0]]) or 1) if b else 1)
            words[i + k]["t"] = round(min(max(new, words[i + k - 1]["t"] + 0.05), t_next - 0.05), 3)
    return words


def match_heard(lines, heard, start, end):
    """Whisper's words [(song seconds, word)] from start..end -> {word index: seconds} for the lyric words it
    clearly heard: runs of 2+ words in lyric order, each inside its own line's time."""
    norm = lambda w: re.sub(r"[^a-z0-9]", "", w.lower())
    lyr = []  # (token, word index, line start, next line start)
    for (t, t_next, i, n), (_, body) in zip(line_spans(lines), lines):
        if t_next > start - 1 and t < end + 1:
            lyr += [(norm(w), i + k, t, t_next) for k, w in enumerate(body.split())]
    heard = [(t, norm(w)) for t, w in heard if norm(w)]
    blocks = difflib.SequenceMatcher(None, [x[0] for x in lyr], [w for _, w in heard], autojunk=False).get_matching_blocks()
    out, last = {}, -1.0
    for blk in blocks:
        if blk.size < 2:  # a lone "you" or "the" matches anywhere
            continue
        for (tok, i, t, t_next), (tw, _) in zip(lyr[blk.a:blk.a + blk.size], heard[blk.b:blk.b + blk.size]):
            if t - 0.3 <= tw < t_next and tw > last:
                out[i], last = round(tw, 3), tw
    return out


JUNK = re.compile(r"[(\[][^)\]]*\b(official|lyrics?|video|audio|visuali[sz]er|hd|4k|mv|remaster(ed)?)\b[^)\]]*[)\]]", re.I)
VERSION = re.compile(r"\b(acoustic|live|remix|remaster(ed)?|version|edit|mix|unplugged|lo-?fi|slowed|reverb|"
                     r"sped up|instrumental|reprise|cover)\b", re.I)
FEAT = re.compile(r"\s*[(\[]?\s*\b(ft|feat|featuring)\b\.?[^)\]]*[)\]]?", re.I)


def clean(title, artist, browser=False):
    """Player-reported title/artist -> (artist, title) fit for a lyrics lookup."""
    title = JUNK.sub("", (title or "").replace("–", "-").replace("—", "-")).split("|")[0]
    artist = re.sub(r"\s*-\s*Topic$|VEVO$", "", artist or "").strip()
    if " - " in title:
        left, right = title.split(" - ", 1)
        if browser and not VERSION.search(right):  # YouTube videos are usually "Artist - Song"
            artist, title = left, right
        else:  # versions: "Jhol - Acoustic", "Song - Remastered 2011", "Song - Live"
            title = left
    artist = re.split(r",|&|;| x | feat\.? | ft\.? ", FEAT.sub("", artist), maxsplit=1, flags=re.I)[0]
    return artist.strip(), FEAT.sub("", title).strip(" -")


def cache_key(artist, title):
    return re.sub(r"[\W_]+", " ", f"{artist} {title}".lower()).strip()


def http_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=10) as r:
        return json.load(r)


def fetch_lyrics(artist, title, duration=None):
    """Synced lyrics from cache/ or LRCLIB -> {"artist", "title", "lrc", "duration", "learned"?, "file"} or None.
    A cached copy timed for another version of the song (music video intro, extended mix) is fetched again."""
    f = CACHE / f"{cache_key(artist, title)}.json"
    cached = read_json(f)
    if cached:
        cached["file"] = str(f)  # where Learner saves what it hears
    if cached and not (duration and abs((cached.get("duration") or 0) - duration) > 3):
        return cached
    q = {"artist_name": artist, "track_name": title}
    if duration:
        q["duration"] = round(duration)
    try:
        try:
            hit = http_json("https://lrclib.net/api/get?" + urllib.parse.urlencode(q))
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
            hit = None
        if not (hit and hit.get("syncedLyrics")):
            found = http_json("https://lrclib.net/api/search?" + urllib.parse.urlencode({"q": f"{artist} {title}"}))
            found = [r for r in found if r.get("syncedLyrics")]
            if duration:
                found.sort(key=lambda r: abs((r.get("duration") or 0) - duration))
            hit = found[0] if found else None
    except OSError:  # offline: an off-version copy still beats no lyrics
        return cached
    if not hit:
        return cached
    data = {"artist": hit["artistName"], "title": hit["trackName"], "lrc": hit["syncedLyrics"], "duration": hit.get("duration")}
    write_json(f, data)
    return {**data, "file": str(f)}


def cover_url(artist, title):
    """1200 px album art from the iTunes search API (players only hand Windows a small thumbnail).
    Only trusts a result by the same artist, so an unknown song keeps its own thumbnail."""
    res = http_json("https://itunes.apple.com/search?" + urllib.parse.urlencode(
        {"term": f"{artist} {title}", "entity": "song", "limit": 5}))["results"]
    a = artist.lower()
    hit = next((r for r in res if a and (a in r["artistName"].lower() or r["artistName"].lower() in a)), None)
    return hit["artworkUrl100"].replace("100x100", "1200x1200") if hit else None
