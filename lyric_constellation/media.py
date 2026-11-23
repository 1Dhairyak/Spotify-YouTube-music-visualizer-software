"""Finds out what Windows is playing, and keeps it in the `Player` object that the screen reads.

Windows has a built-in "media controls" system: the box with the song title that pops up when you change the
volume. Spotify, YouTube Music and browsers report the song (title, artist, position, cover) to it. We read it
through `winrt`, a Python library for Windows' own programming interface. No login to any music service.

If no player reports anything (some browsers don't), we record 6 seconds of what the speakers play and ask
Shazam what song it is.

The main loop is watch(): 4 times a second it asks Windows what's playing. When the song changes it starts
load_track() for the new song; otherwise it just keeps the clock in step with the player's position.

Sections below: 1. Player (the shared state) · 2. the main loop · 3. a new song · 4. asking Windows and Shazam.
"""
import asyncio
import base64
import io
import logging
import time
import wave
from datetime import datetime, timezone

from .lyrics import JUNK, clean, cover_url, fetch_lyrics, words_for
from .mood import SongMood

log = logging.getLogger(__name__)

BROWSERS = ("chrome", "msedge", "firefox", "brave", "opera", "vivaldi")
PLAYING = 4   # Windows' code for "playing" (GlobalSystemMediaTransportControlsSessionPlaybackStatus.PLAYING)
IDLE = "Play something on Spotify, YouTube or YouTube Music"
NO_LYRICS = "No synced lyrics found for this song"
LISTENING = "Listening to identify the song…"


# ---------- 1. Player: the current song and its clock (everything else writes here; the page reads it) ----------

class Player:
    """The current song and where we are in it. The watcher below writes it; the page reads it 4 times a second.

    The clock: we store a position and the moment we stored it. Song time "now" = that position plus the time
    since (when playing). So the words move smoothly between the player's updates."""

    def __init__(self):
        self.track_id = 0     # goes up by one for every new song
        self.rev = 0          # goes up whenever `track` changes, so the page knows to fetch it again
        self.track = {"id": 0, "title": "", "artist": "", "art": None, "words": []}   # what the page draws
        self.status = IDLE    # a message for the screen ("Finding lyrics…"), or "" when all is well

        self.pos = 0.0                         # song position (seconds) at the moment below
        self.clock_set_at = time.monotonic()   # when `pos` was set
        self.playing = False
        self.timed = False    # True when the position comes from the player itself (exact), not counting or Shazam

        self.lyrics = None    # fetch_lyrics' result for the song shown (Learner uses it)
        self.last_heard = -999.0   # when we last asked Shazam (so we don't ask too often)
        self.mood = None      # SongMood of the song shown: how emotional it is (mood.py)
        self.beat = None      # the latest tempo and beat of what's playing (beat.py)
        self.levels = None    # the latest band levels for the bars around the cover (audio.Levels)

        # The player we follow, so the seek bar can ask it to jump.
        self.session = None
        self.dur = None
        self.can_seek = False
        self.loop = None             # the watcher's event loop, to send the seek request on
        self.seeking_until = 0.0     # ignore the player's own position until then (it lags after a seek)

    def seek(self, sec):
        """Ask the player to jump to `sec` seconds. Its reported position lags behind, so watch() ignores it
        for 1.5 seconds."""
        session = self.session
        loop = self.loop
        if not (session and loop and self.can_seek and self.dur):
            return
        sec = max(0.0, min(float(sec), self.dur))

        async def ask():
            await session.try_change_playback_position_async(int(sec * 10_000_000))   # Windows counts in 100 ns units
        asyncio.run_coroutine_threadsafe(ask(), loop)

        self.set_clock(sec, self.playing)
        self.seeking_until = time.monotonic() + 1.5

    def set_clock(self, pos, playing):
        self.pos = pos
        self.clock_set_at = time.monotonic()
        self.playing = playing

    def now(self):
        """The song position right now, in seconds."""
        if self.playing:
            return self.pos + (time.monotonic() - self.clock_set_at)
        return self.pos

    def publish(self, title, artist, art, words, status, lyrics=None):
        """Put a song (or a new version of it: better cover, lyrics found) on screen."""
        self.rev += 1
        self.track = {"id": self.track_id, "title": title, "artist": artist, "art": art, "words": words}
        self.status = status
        self.lyrics = lyrics

        # A new song gets a fresh mood; publishing the same song again keeps what was heard of it.
        if not self.mood or self.mood.track_id != self.track_id:
            self.mood = SongMood(self.track_id)
        self.mood.name = f"{artist} - {title}"
        if lyrics and self.mood.lyrics_score is None:
            self.mood.set_lyrics(lyrics["lrc"])

    def retime(self, words):
        """Same words, better times (Learner heard them). The page moves them without laying the screen out again."""
        self.track = {**self.track, "words": words}
        self.rev += 1


# ---------- 2. the main loop: watch what Windows is playing ----------

def run_watch(player):
    """Run watch() until the app closes. If it crashes, say so on screen (details in the log)."""
    try:
        asyncio.run(watch(player))
    except Exception:
        log.exception("media watcher")
        player.status = "Media watcher crashed, see the console"


async def watch(player):
    """The main loop: 4 times a second, see what Windows is playing and keep `player` up to date. Runs forever."""
    from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as Manager

    manager = await Manager.request_async()
    key = None        # (app, title, artist) of the song on screen, or ("sound", artist, title) if Shazam found it
    loader = None     # the load_track task for the current song
    listener = None   # the from_sound task, while we're identifying by listening
    player.loop = asyncio.get_running_loop()

    while True:
        await asyncio.sleep(0.25)
        try:
            infos = [await read_session(s) for s in manager.get_sessions()]
        except OSError:   # a player closed while we were reading it
            continue

        # Follow the player that is playing; if none is, the first one.
        cur = next((i for i in infos if i["playing"]), infos[0] if infos else None)
        player.timed = bool(cur and cur["pos"] is not None)
        if cur:
            player.session, player.dur, player.can_seek = cur["session"], cur["dur"], cur["can_seek"]
        else:
            player.session, player.dur, player.can_seek = None, None, False

        if not cur or not (cur["title"] or cur["playing"]):
            # No player reports anything (e.g. Chrome with media-key handling off): identify by sound instead.
            if key and key[0] != "sound":   # a player's song was on screen: clear it
                key = None
                if loader:
                    loader.cancel()
                player.track_id += 1
                player.publish("", "", None, [], IDLE)
                player.set_clock(0, False)
            if listener and listener.done():
                key = listener.result()
                listener = None
            # ponytail: listens again every 20 s to catch song changes and pauses; a pause shows up to 20 s late
            if not listener and time.monotonic() - player.last_heard >= 20:
                listener = asyncio.create_task(from_sound(player, key))
            continue

        # A player reports a song: stop listening for one.
        if listener:
            listener.cancel()
            listener = None

        new_key = (cur["app"], cur["title"], cur["artist"])
        if new_key != key:
            # A new song: start loading it (and stop loading the old one, if it was still going).
            key = new_key
            if loader:
                loader.cancel()
            player.track_id += 1
            player.set_clock(cur["pos"] or 0, cur["playing"])
            loader = asyncio.create_task(load_track(player, cur))
        elif time.monotonic() < player.seeking_until:
            pass   # we just jumped: the player hasn't caught up yet, so don't trust its position
        elif cur["pos"] is not None:
            player.set_clock(cur["pos"], cur["playing"])   # same song: follow the player's position
        else:
            # This player gives no position: keep counting from the song's start (or Shazam's position).
            player.set_clock(player.now(), cur["playing"])


# ---------- 3. a new song: find its lyrics, cover and position ----------

async def load_track(player, cur):
    """A new song started: show its title at once, then find its lyrics and a sharp cover, and if Windows
    gives no position (some browsers), ask Shazam where in the song we are."""
    from_browser = any(name in cur["app"].lower() for name in BROWSERS)
    artist, title = clean(cur["title"], cur["artist"], from_browser)

    # 1. Show the title and the player's own thumbnail straight away.
    try:
        art = await read_thumb(cur["thumb"])
    except OSError:
        art = None
    player.publish(title, artist, art, [], "Finding lyrics…")

    # 2. Lyrics and a sharp cover (the full, uncleaned title finds the right version of the cover).
    lyrics = None
    if title:
        lyrics = await lookup(fetch_lyrics, artist, title, cur["dur"])
        art = await lookup(cover_url, artist, JUNK.sub("", cur["title"])) or art
        if not lyrics:
            player.publish(title, artist, art, [], player.status)
    if lyrics:
        player.publish(lyrics["title"], lyrics["artist"], art, words_for(lyrics), "", lyrics)
        if cur["pos"] is not None:
            return   # we know the song and the position: nothing left to find out

    # 3. Ask Shazam: for the song (no lyrics found under this title) or for the position (no timeline).
    # ponytail: one Shazam try per song, at most every 30 s; add retries if songs get missed
    if time.monotonic() - player.last_heard < 30:
        if not player.status:
            player.status = "" if lyrics else NO_LYRICS
        return
    while not player.playing:   # wait until it's actually playing, or Shazam would hear silence
        await asyncio.sleep(0.5)
    if not lyrics:
        player.status = LISTENING
    player.last_heard = time.monotonic()
    try:
        heard = await recognize()
    except Exception:   # recognition is a nice extra; it must never stop the watcher
        log.exception("media watcher")
        heard = None
    if not heard:
        if not lyrics:
            player.status = NO_LYRICS
        return

    heard_artist, heard_title, cover, pos = heard
    player.set_clock(pos, True)   # only used when Windows gives no position (watch() overwrites it otherwise)
    if not lyrics:
        lyrics = await lookup(fetch_lyrics, heard_artist, heard_title, None)
        words = words_for(lyrics) if lyrics else []
        status = "" if lyrics else NO_LYRICS
        player.publish(heard_title, heard_artist, art or cover, words, status, lyrics)


async def from_sound(player, key):
    """No player reports anything: identify the song by listening.
    `key` is what's on screen now; returns the key of what's on screen afterwards."""
    player.last_heard = time.monotonic()
    if not key:
        player.status = LISTENING
    try:
        heard = await recognize()
    except Exception:
        log.exception("media watcher")
        heard = None

    if not heard:   # silence or an unknown song: freeze the words until we hear something again
        player.set_clock(player.now(), False)
        if not key:
            player.status = IDLE
        return key

    heard_artist, heard_title, cover, pos = heard
    player.set_clock(pos, True)
    new_key = ("sound", heard_artist, heard_title)
    if new_key != key:   # a different song from last time
        player.track_id += 1
        player.publish(heard_title, heard_artist, cover, [], "Finding lyrics…")
        cover = await lookup(cover_url, heard_artist, heard_title) or cover
        lyrics = await lookup(fetch_lyrics, *clean(heard_title, heard_artist), None)
        words = words_for(lyrics) if lyrics else []
        status = "" if lyrics else NO_LYRICS
        player.publish(heard_title, heard_artist, cover, words, status, lyrics)
    return new_key


# ---------- 4. asking Windows and Shazam ----------

async def read_session(session):
    """One media player ("session") -> a dict of what it's playing:
    app name, title, artist, playing or not, position and length in seconds, thumbnail, and whether it can seek."""
    props = await session.try_get_media_properties_async()
    timeline = session.get_timeline_properties()
    info = session.get_playback_info()
    playing = info.playback_status == PLAYING

    duration = timeline.end_time.total_seconds()
    position = None
    if duration > 0:   # some browsers report no timeline at all
        position = timeline.position.total_seconds()
        if playing:
            # The player only updates its position every few seconds. Add the time since its last update.
            position += (datetime.now(timezone.utc) - timeline.last_updated_time).total_seconds()
        position = min(position, duration)

    return {"app": session.source_app_user_model_id or "",
            "title": props.title,
            "artist": props.artist,
            "playing": playing,
            "pos": position,
            "dur": duration or None,
            "thumb": props.thumbnail,
            "session": session,
            "can_seek": info.controls.is_playback_position_enabled}


async def read_thumb(ref):
    """The player's small cover picture -> a "data:" URL the page can show directly (or None)."""
    if not ref:
        return None
    from winrt.windows.storage.streams import Buffer, InputStreamOptions

    stream = await ref.open_read_async()
    buf = Buffer(stream.size)
    await stream.read_async(buf, buf.capacity, InputStreamOptions.READ_AHEAD)
    image_type = stream.content_type or "image/png"
    return f"data:{image_type};base64," + base64.b64encode(bytes(buf)).decode()


async def recognize():
    """Record ~6 s of what the speakers play and ask Shazam what it is.
    Returns (artist, title, cover url, position in the song) or None."""
    import ctypes
    import numpy as np
    import soundcard as sc
    from shazamio import Shazam

    rate = 44100

    def grab():
        ctypes.windll.ole32.CoInitializeEx(None, 0)   # Windows' sound system needs this once per thread
        mic = sc.get_microphone(str(sc.default_speaker().name), include_loopback=True)
        return mic.record(samplerate=rate, numframes=rate * 6)

    started = time.monotonic()
    data = await asyncio.to_thread(grab)
    if abs(data).max() < 0.005:   # silence: don't bother Shazam
        return None

    # Shazam wants a WAV file, so we pack the sound into one in memory (mono, 16-bit).
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        mono = np.clip(data.mean(axis=1), -1, 1)
        w.writeframes((mono * 32767).astype("<i2").tobytes())

    async with Shazam() as shazam:   # "async with" closes its connection afterwards
        result = await shazam.recognize(out.getvalue())
    track = result.get("track")
    if not track:
        return None
    # Shazam says where in the song our clip started; add the time that passed since we started recording.
    position = result["matches"][0].get("offset", 0) + time.monotonic() - started
    return track.get("subtitle", ""), track["title"], track.get("images", {}).get("coverart"), position


async def lookup(fn, *args):
    """Run a slow network function (like fetch_lyrics) in the background, so the loop keeps running meanwhile.
    Offline or not found -> None."""
    try:
        return await asyncio.to_thread(fn, *args)
    except (OSError, ValueError, KeyError):
        return None
