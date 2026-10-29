"""What Windows is playing (media sessions), recognition by sound, and the Player the UI reads."""
import asyncio, base64, io, logging, time, wave
from datetime import datetime, timezone

from .lyrics import JUNK, clean, cover_url, fetch_lyrics, words_for

log = logging.getLogger(__name__)
BROWSERS = ("chrome", "msedge", "firefox", "brave", "opera", "vivaldi")
PLAYING = 4  # GlobalSystemMediaTransportControlsSessionPlaybackStatus.PLAYING
IDLE = "Play something on Spotify, YouTube or YouTube Music"


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
        self.timed = False  # the position comes from the player itself (exact), not from counting or Shazam
        self.lyrics = None  # fetch_lyrics' result for the track shown, for Learner
        self.last_heard = -999.0

    def set_clock(self, pos, playing):
        self.pos, self.at, self.playing = pos, time.monotonic(), playing

    def now(self):
        return self.pos + (time.monotonic() - self.at if self.playing else 0)

    def publish(self, title, artist, art, words, status, lyrics=None):
        self.rev += 1
        self.track = {"id": self.tid, "title": title, "artist": artist, "art": art, "words": words}
        self.status, self.lyrics = status, lyrics

    def retime(self, words):
        """Same words, better times (Learner heard them): the UI moves them without laying the screen out again."""
        self.track = {**self.track, "words": words}
        self.rev += 1


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
        player.publish(lyrics["title"], lyrics["artist"], art, words_for(lyrics), "", lyrics)
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
        log.exception("media watcher")
        heard = None
    if not heard:
        if not lyrics:
            player.status = "No synced lyrics found for this song"
        return
    h_artist, h_title, cover, pos = heard
    player.set_clock(pos, True)  # used only when Windows gives no position
    if not lyrics:
        lyrics = await lookup(fetch_lyrics, h_artist, h_title, None)
        words = words_for(lyrics) if lyrics else []
        player.publish(h_title, h_artist, art or cover, words, "" if lyrics else "No synced lyrics found for this song", lyrics)


async def from_sound(player, key):
    """No player reports anything: identify by listening. Returns the key of what's now shown."""
    player.last_heard = time.monotonic()
    if not key:
        player.status = "Listening to identify the song…"
    try:
        heard = await recognize()
    except Exception:
        log.exception("media watcher")
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
        words = words_for(lyrics) if lyrics else []
        player.publish(h_title, h_artist, cover, words, "" if lyrics else "No synced lyrics found for this song", lyrics)
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
        player.timed = bool(cur and cur["pos"] is not None)
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
        log.exception("media watcher")
        player.status = "Media watcher crashed, see the console"

