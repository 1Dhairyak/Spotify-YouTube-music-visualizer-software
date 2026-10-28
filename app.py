"""Music Sync: constellation lyrics for whatever Windows is playing.

  python app.py             live: follows Spotify / YouTube / YouTube Music via Windows media controls
  python app.py --demo [s]  plays the first songs.txt entry against a fake clock, starting at s seconds
  python app.py --preload   fetches lyrics for every songs.txt entry into cache/
  python app.py --probe     prints what Windows reports for every media session, once a second
  python app.py --selftest  checks the LRC parser, word timing and title cleanup
"""
import asyncio, base64, io, json, os, re, sys, threading, time, traceback, urllib.error, urllib.parse, urllib.request, wave
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "cache"
UA = {"User-Agent": "MusicSync/0.1 (personal lyrics visualizer)"}
BROWSERS = ("chrome", "msedge", "firefox", "brave", "opera", "vivaldi")
PLAYING = 4  # GlobalSystemMediaTransportControlsSessionPlaybackStatus.PLAYING
WORD_PACE = 0.07  # seconds per weight unit (len(word) + 2): how fast a line is sung when the gap is long
IDLE = "Play something on Spotify, YouTube or YouTube Music"

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
    """Synced lyrics from cache/ or LRCLIB -> {"artist", "title", "lrc"} or None."""
    f = CACHE / f"{cache_key(artist, title)}.json"
    if f.exists():
        return json.loads(f.read_text("utf-8"))
    q = {"artist_name": artist, "track_name": title}
    if duration:
        q["duration"] = round(duration)
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
    if not hit:
        return None
    data = {"artist": hit["artistName"], "title": hit["trackName"], "lrc": hit["syncedLyrics"]}
    CACHE.mkdir(exist_ok=True)
    f.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
    return data


def cover_url(artist, title):
    """1200 px album art from the iTunes search API (players only hand Windows a small thumbnail).
    Only trusts a result by the same artist, so an unknown song keeps its own thumbnail."""
    res = http_json("https://itunes.apple.com/search?" + urllib.parse.urlencode(
        {"term": f"{artist} {title}", "entity": "song", "limit": 5}))["results"]
    a = artist.lower()
    hit = next((r for r in res if a and (a in r["artistName"].lower() or r["artistName"].lower() in a)), None)
    return hit["artworkUrl100"].replace("100x100", "1200x1200") if hit else None


async def lookup(fn, *args):
    """Run a blocking network helper off the event loop; offline or not found -> None."""
    try:
        return await asyncio.to_thread(fn, *args)
    except (OSError, ValueError, KeyError):
        return None


# ---------- what Windows is playing ----------

async def read_session(s):
    p = await s.try_get_media_properties_async()
    tl = s.get_timeline_properties()
    playing = s.get_playback_info().playback_status == PLAYING
    dur = tl.end_time.total_seconds()
    pos = None
    if dur > 0:  # some browsers report no timeline at all
        pos = tl.position.total_seconds()
        if playing:
            pos += (datetime.now(timezone.utc) - tl.last_updated_time).total_seconds()
        pos = min(pos, dur)
    return {"app": s.source_app_user_model_id or "", "title": p.title, "artist": p.artist,
            "playing": playing, "pos": pos, "dur": dur or None, "thumb": p.thumbnail}


async def read_thumb(ref):
    if not ref:
        return None
    from winrt.windows.storage.streams import Buffer, InputStreamOptions
    stream = await ref.open_read_async()
    buf = Buffer(stream.size)
    await stream.read_async(buf, buf.capacity, InputStreamOptions.READ_AHEAD)
    return f"data:{stream.content_type or 'image/png'};base64," + base64.b64encode(bytes(buf)).decode()


async def recognize():
    """~6 s of whatever the speakers play -> (artist, title, cover_url, song_position) or None."""
    import ctypes
    import numpy as np
    import soundcard as sc
    from shazamio import Shazam
    rate = 44100

    def grab():
        ctypes.windll.ole32.CoInitializeEx(None, 0)  # soundcard needs COM on this thread
        mic = sc.get_microphone(str(sc.default_speaker().name), include_loopback=True)
        return mic.record(samplerate=rate, numframes=rate * 6)

    t0 = time.monotonic()
    data = await asyncio.to_thread(grab)
    if abs(data).max() < 0.005:  # silence: don't bother Shazam
        return None
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(rate)
        w.writeframes((np.clip(data.mean(axis=1), -1, 1) * 32767).astype("<i2").tobytes())
    res = await Shazam().recognize(out.getvalue())
    track = res.get("track")
    if not track:
        return None
    pos = res["matches"][0].get("offset", 0) + time.monotonic() - t0
    return track.get("subtitle", ""), track["title"], track.get("images", {}).get("coverart"), pos


class Player:
    """What the UI shows. Written by the watcher, read by the UI's poll."""

    def __init__(self):
        self.tid = self.rev = 0
        self.track = {"id": 0, "title": "", "artist": "", "art": None, "words": []}
        self.status = IDLE
        self.pos, self.at, self.playing = 0.0, time.monotonic(), False
        self.last_heard = -999.0

    def set_clock(self, pos, playing):
        self.pos, self.at, self.playing = pos, time.monotonic(), playing

    def now(self):
        return self.pos + (time.monotonic() - self.at if self.playing else 0)

    def publish(self, title, artist, art, words, status):
        self.rev += 1
        self.track = {"id": self.tid, "title": title, "artist": artist, "art": art, "words": words}
        self.status = status


async def load_track(player, cur):
    artist, title = clean(cur["title"], cur["artist"], any(b in cur["app"].lower() for b in BROWSERS))
    try:
        art = await read_thumb(cur["thumb"])
    except OSError:
        art = None
    player.publish(title, artist, art, [], "Finding lyrics…")
    lyrics = await lookup(fetch_lyrics, artist, title, cur["dur"]) if title else None
    if title:  # swap the blurry player thumbnail for sharp art; the full title finds the right version
        art = await lookup(cover_url, artist, JUNK.sub("", cur["title"])) or art
        if not lyrics:
            player.publish(title, artist, art, [], player.status)
    if lyrics:
        player.publish(lyrics["title"], lyrics["artist"], art, word_times(parse_lrc(lyrics["lrc"])), "")
        if cur["pos"] is not None:
            return  # title and position both known: no need to listen
    # ponytail: one Shazam try per track, at most every 30 s; add retries if songs get missed
    if time.monotonic() - player.last_heard < 30:
        player.status = player.status or ("" if lyrics else "No synced lyrics found for this song")
        return
    while not player.playing:
        await asyncio.sleep(0.5)
    if not lyrics:
        player.status = "Listening to identify the song…"
    player.last_heard = time.monotonic()
    try:
        heard = await recognize()
    except Exception:  # recognition is a best-effort extra; never let it kill the watcher
        traceback.print_exc()
        heard = None
    if not heard:
        if not lyrics:
            player.status = "No synced lyrics found for this song"
        return
    h_artist, h_title, cover, pos = heard
    player.set_clock(pos, True)  # used only when Windows gives no position
    if not lyrics:
        lyrics = await lookup(fetch_lyrics, h_artist, h_title, None)
        words = word_times(parse_lrc(lyrics["lrc"])) if lyrics else []
        player.publish(h_title, h_artist, art or cover, words, "" if lyrics else "No synced lyrics found for this song")


async def from_sound(player, key):
    """No player reports anything: identify by listening. Returns the key of what's now shown."""
    player.last_heard = time.monotonic()
    if not key:
        player.status = "Listening to identify the song…"
    try:
        heard = await recognize()
    except Exception:
        traceback.print_exc()
        heard = None
    if not heard:  # silence or unknown: freeze the words until we hear something again
        player.set_clock(player.now(), False)
        player.status = player.status if key else IDLE
        return key
    h_artist, h_title, cover, pos = heard
    player.set_clock(pos, True)
    k = ("sound", h_artist, h_title)
    if k != key:
        player.tid += 1
        player.publish(h_title, h_artist, cover, [], "Finding lyrics…")
        cover = await lookup(cover_url, h_artist, h_title) or cover
        lyrics = await lookup(fetch_lyrics, *clean(h_title, h_artist), None)
        words = word_times(parse_lrc(lyrics["lrc"])) if lyrics else []
        player.publish(h_title, h_artist, cover, words, "" if lyrics else "No synced lyrics found for this song")
    return k


async def watch(player):
    from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as Manager
    mgr = await Manager.request_async()
    key, loader, listener = None, None, None
    while True:
        await asyncio.sleep(0.25)
        try:
            infos = [await read_session(s) for s in mgr.get_sessions()]
        except OSError:  # a session closed mid-read
            continue
        cur = next((i for i in infos if i["playing"]), infos[0] if infos else None)
        if not cur or not (cur["title"] or cur["playing"]):
            # e.g. Chrome with media-key handling off reports nothing: identify by sound instead
            if key and key[0] != "sound":
                key = None
                loader and loader.cancel()
                player.tid += 1
                player.publish("", "", None, [], IDLE)
                player.set_clock(0, False)
            if listener and listener.done():
                key, listener = listener.result(), None
            # ponytail: re-listens every 20 s to catch song changes and pauses; pause shows up to 20 s late
            if not listener and time.monotonic() - player.last_heard >= 20:
                listener = asyncio.create_task(from_sound(player, key))
            continue
        if listener:
            listener.cancel()
            listener = None
        k = (cur["app"], cur["title"], cur["artist"])
        if k != key:
            key = k
            loader and loader.cancel()
            player.tid += 1
            player.set_clock(cur["pos"] or 0, cur["playing"])
            loader = asyncio.create_task(load_track(player, cur))
        elif cur["pos"] is not None:
            player.set_clock(cur["pos"], cur["playing"])
        else:  # no timeline from this player: keep counting from track start (or Shazam's position)
            player.set_clock(player.now(), cur["playing"])


def run_watch(player):
    try:
        asyncio.run(watch(player))
    except Exception:
        traceback.print_exc()
        player.status = "Media watcher crashed, see the console"


# ---------- window ----------

SETTINGS = ROOT / "settings.json"
PAGE = str(ROOT / "ui" / "index.html")


class Api:
    """Exposed to ui/index.html as pywebview.api (underscore names stay private).
    Window 0 is the main window. With two screens, window 1 opens on the other screen;
    one window shows the cover and title, the other the constellation."""

    def __init__(self, player):
        self._player, self._wins, self._dual, self._open = player, [], False, True
        self._lock = threading.Lock()
        self._cfg = {"mode": "auto", "stars_on": 0, "style": 0}  # mode: auto (two screens when available) | single
        if SETTINGS.exists():
            self._cfg.update(json.loads(SETTINGS.read_text("utf-8")))

    def state(self):
        p = self._player
        return {"rev": p.rev, "pos": p.now(), "playing": p.playing, "status": p.status,
                "dual": self._dual, "stars_on": self._cfg["stars_on"], "style": self._cfg["style"]}

    def track(self):
        return self._player.track

    def fullscreen(self, win=0):
        self._wins[win].toggle_fullscreen()

    def toggle_dual(self):
        self._cfg["mode"] = "single" if self._cfg["mode"] == "auto" else "auto"
        self._save()
        self._sync_screens()
        if self._cfg["mode"] == "single":
            return "One screen"
        return "Two screens" if self._dual else "Only one screen connected"

    def play_pause(self):
        import ctypes  # the keyboard's media key: works for YouTube Music, Spotify, anything Windows can control
        ctypes.windll.user32.keybd_event(0xB3, 0, 0, 0)
        ctypes.windll.user32.keybd_event(0xB3, 0, 2, 0)

    def set_style(self, i):
        self._cfg["style"] = int(i)
        self._save()

    def swap(self):
        self._cfg["stars_on"] ^= 1
        self._save()
        return "Screens swapped"

    def _save(self):
        SETTINGS.write_text(json.dumps(self._cfg), "utf-8")

    def _sync_screens(self):
        """Open or close the second window to match the screens plugged in and the chosen mode."""
        import webview
        with self._lock:
            if not self._open:
                return
            screens = webview.screens
            want = len(screens) >= 2 and self._cfg["mode"] != "single"
            if want and not self._dual:
                main = self._wins[0]
                other = next((s for s in screens if not (s.x <= main.x + 10 < s.x + s.width
                                                         and s.y <= main.y + 10 < s.y + s.height)), screens[1])
                self._wins.append(webview.create_window("Music Sync (screen 2)", PAGE + "?win=1", js_api=self,
                                                        screen=other, fullscreen=True, background_color="#000000"))
                self._dual = True  # window 0 slides into its dual view while window 1 fades in
            elif not want and self._dual:
                self._dual = False  # window 1 fades out, window 0 slides back to the one-screen layout
                time.sleep(0.8)
                self._wins.pop().destroy()

    def _close(self):
        with self._lock:
            self._open = False
            for w in self._wins[1:]:
                w.destroy()


def watch_screens(api):
    # ponytail: polls every 2 s for plugged/unplugged screens; a Windows display-change hook would be instant
    while api._open:
        try:
            api._sync_screens()
        except Exception:
            traceback.print_exc()
        time.sleep(2)


def show(player, worker):
    import webview
    api = Api(player)
    api._wins.append(webview.create_window("Music Sync", PAGE, js_api=api, width=1200, height=760,
                                           background_color="#000000", fullscreen=True))
    api._wins[0].events.closed += api._close

    def start():
        threading.Thread(target=watch_screens, args=(api,), daemon=True).start()
        worker and worker()

    webview.start(start)
    os._exit(0)  # window closed: don't let the lyric watcher thread keep a hidden process alive


# ---------- command-line tools ----------

def songs():
    lines = (ROOT / "songs.txt").read_text("utf-8").splitlines()
    return [l.strip() for l in lines if l.strip() and not l.startswith("#")]


def preload():
    for line in songs():
        artist, title = clean(line, "", browser=True)
        data = fetch_lyrics(artist, title)
        print(("ok      " if data else "MISSING ") + f"{artist} - {title}")


def demo(player, start):
    artist, title = clean(songs()[0], "", browser=True)
    lyrics = fetch_lyrics(artist, title)
    if not lyrics:
        sys.exit(f"No synced lyrics for {artist} - {title}")
    try:
        art = cover_url(lyrics["artist"], lyrics["title"])
    except OSError:
        art = None
    player.tid += 1
    player.publish(lyrics["title"], lyrics["artist"], art, word_times(parse_lrc(lyrics["lrc"])), "")
    player.set_clock(start, True)


async def probe():
    from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as Manager
    mgr = await Manager.request_async()
    while True:
        for s in mgr.get_sessions():
            i = await read_session(s)
            pos = "no timeline" if i["pos"] is None else f"{i['pos']:6.1f}/{i['dur']:.0f}s"
            print(f"{i['app'][:38]:<38} {'PLAY ' if i['playing'] else 'pause'} {pos:<14} {i['artist']} | {i['title']}")
        print("-" * 72)
        await asyncio.sleep(1)


def selftest():
    lines = parse_lrc("[00:12.00]We don't talk anymore\n[00:15.50][01:00.00]Like we used to do\n[00:20.00]")
    assert lines[0] == (12.0, "We don't talk anymore") and lines[-1][0] == 60.0
    w = word_times(lines)
    assert [x["w"] for x in w[:4]] == ["We", "don't", "talk", "anymore"]
    assert w[0]["t"] == 12.0 and all(a["t"] < b["t"] for a, b in zip(w[:4], w[1:4])) and w[3]["t"] < 15.5
    assert w[4] == {"t": 15.5, "w": "Like"} and len(w) == 14  # repeated [01:00] line counted twice
    assert [x["w"] for x in w if x.get("end")] == ["anymore", "do", "do"]  # line-end words drawn big
    assert word_times([(5.0, "<00:05.00>hey <00:05.80>there")]) \
        == [{"t": 5.0, "w": "hey"}, {"t": 5.8, "w": "there", "end": True}]
    assert clean("Charlie Puth - We Don't Talk Anymore (feat. Selena Gomez) [Official Video]", "Charlie Puth", True) \
        == ("Charlie Puth", "We Don't Talk Anymore")
    assert clean("We Don't Talk Anymore (feat. Selena Gomez)", "Charlie Puth, Selena Gomez") \
        == ("Charlie Puth", "We Don't Talk Anymore")
    assert clean("Shape of You - Remastered 2017", "Ed Sheeran") == ("Ed Sheeran", "Shape of You")
    assert clean("Believer", "Imagine Dragons - Topic", True) == ("Imagine Dragons", "Believer")
    assert clean("Jhol - Acoustic", "Maanu", True) == ("Maanu", "Jhol")  # a version, not "Artist - Song"
    assert cache_key("Charlie Puth", "We Don't Talk Anymore") == "charlie puth we don t talk anymore"
    print("selftest ok")


if __name__ == "__main__":
    if sys.stdout is None:  # started by hotkey.pyw with pythonw: no console, so log to a file
        sys.stdout = sys.stderr = open(ROOT / "music-sync.log", "a", encoding="utf-8", buffering=1)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    arg = sys.argv[1] if len(sys.argv) > 1 else ""
    if arg == "--selftest":
        selftest()
    elif arg == "--probe":
        asyncio.run(probe())
    elif arg == "--preload":
        preload()
    else:
        player = Player()
        if arg == "--demo":
            demo(player, float(sys.argv[2]) if len(sys.argv) > 2 else 0)
        show(player, None if arg == "--demo" else lambda: run_watch(player))
