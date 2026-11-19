"""The starting point of the app. `python app.py` runs main() at the bottom of this file.

How to run it:
  python app.py             live: follows Spotify / YouTube / YouTube Music through Windows' media controls
  python app.py --demo [s]  plays the first song in songs.txt on a pretend clock, starting at s seconds
  python app.py --preload   downloads lyrics for every song in songs.txt into the cache
  python app.py --probe     prints what Windows reports for every media player, once a second (for debugging)
  python app.py --version   prints the version

The big picture (each part is its own file in this folder):
  media.py    watches what Windows is playing and keeps the current song and its position in a `Player`
  lyrics.py   downloads time-stamped lyrics for that song and works out when each word is sung
  window.py   opens the full-screen window that shows ui/index.html; the page asks the Player what to draw
  audio.py    records what the speakers play and hands it to the "listeners" below:
    learner.py   hears the exact moment each word is sung (speech recognition) and saves it
    mood.py      decides whether a song is calm or lively
    beat.py      finds the beat, so the screen can pulse with the music
    audio.Levels measures bass-to-treble loudness for the bars around the album cover
"""
import asyncio
import logging
import logging.handlers
import os
import sys
import threading
import warnings

from . import DATA, ROOT, __version__, migrate_old_data
from .audio import Levels, Speakers
from .beat import BeatListener
from .learner import Learner
from .lyrics import clean, cover_url, fetch_lyrics, words_for
from .media import Player, read_session, run_watch
from .mood import MoodListener
from .window import show

log = logging.getLogger("lyric_constellation")


def songs():
    """The song list in songs.txt (one "Artist - Title" per line; lines starting with # are notes)."""
    lines = (ROOT / "songs.txt").read_text("utf-8").splitlines()
    return [line.strip() for line in lines if line.strip() and not line.startswith("#")]


def preload():
    """--preload: download the lyrics of every song in songs.txt, so they work offline later."""
    for line in songs():
        artist, title = clean(line, "", browser=True)
        data = fetch_lyrics(artist, title)
        if data:
            print(f"ok      {artist} - {title}")
        else:
            print(f"MISSING {artist} - {title}")


def demo(player, start):
    """--demo: show the first song in songs.txt as if it were playing, starting `start` seconds in.
    Handy for trying the looks without any music app open."""
    artist, title = clean(songs()[0], "", browser=True)
    lyrics = fetch_lyrics(artist, title)
    if not lyrics:
        sys.exit(f"No synced lyrics for {artist} - {title}")

    try:
        art = cover_url(lyrics["artist"], lyrics["title"])
    except OSError:  # no internet: show it without a cover
        art = None

    player.track_id += 1
    player.publish(lyrics["title"], lyrics["artist"], art, words_for(lyrics), "")
    player.set_clock(start, True)


async def probe():
    """--probe: print every media player Windows knows about, once a second. Useful when a player isn't picked up."""
    from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as Manager

    manager = await Manager.request_async()
    while True:
        for session in manager.get_sessions():
            info = await read_session(session)
            if info["pos"] is None:
                position = "no timeline"
            else:
                position = f"{info['pos']:6.1f}/{info['dur']:.0f}s"
            state = "PLAY " if info["playing"] else "pause"
            print(f"{info['app'][:38]:<38} {state} {position:<14} {info['artist']} | {info['title']}")
        print("-" * 72)
        await asyncio.sleep(1)


def setup_logging():
    """Write the log to %APPDATA%\\LyricConstellation\\lyric-constellation.log, and to the console when there is one.
    The log file starts over once it reaches 1 MB (the 2 previous ones are kept)."""
    DATA.mkdir(parents=True, exist_ok=True)

    # When started with pythonw (the hotkey, or the .exe) there is no console window to print to.
    has_console = sys.stdout is not None
    if not has_console:
        sys.stdout = sys.stderr = open(os.devnull, "w")  # stray prints from libraries go nowhere

    log_file = logging.handlers.RotatingFileHandler(DATA / "lyric-constellation.log", maxBytes=1 << 20,
                                                    backupCount=2, encoding="utf-8")
    handlers = [log_file]
    if has_console:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # song titles in any language print fine
        handlers.append(logging.StreamHandler(sys.stdout))
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", handlers=handlers)

    # Any crash that nobody catches still ends up in the log, so it can be read afterwards.
    sys.excepthook = lambda *error: log.critical("uncaught", exc_info=error)
    threading.excepthook = lambda a: log.critical("uncaught in %s", a.thread,
                                                  exc_info=(a.exc_type, a.exc_value, a.exc_traceback))

    # The soundcard library warns about every tiny gap while recording: harmless, and it would fill the log.
    # It switches its warnings on when it is imported, so we import it first and then switch that one off.
    import soundcard  # noqa: F401
    warnings.filterwarnings("ignore", message="data discontinuity in recording")


def listen_and_watch(player):
    """Live mode: start everything that listens to the speakers, then watch what Windows is playing (runs forever)."""
    speakers = Speakers()
    Learner(player).start(speakers)                     # word timing, every ~30 s of singing
    MoodListener(player).start(speakers)                # calm or lively, every 2 s
    speakers.listen(1, BeatListener(player).hear)       # the beat, every 1 s
    speakers.listen(0.1, Levels(player).hear)           # the bars around the cover, every 0.1 s
    threading.Thread(target=speakers.run, daemon=True).start()   # records on its own thread
    run_watch(player)


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else ""
    if arg == "--version":
        print(__version__)
        return

    setup_logging()
    migrate_old_data()
    log.info("Lyric Constellation %s, data in %s", __version__, DATA)

    if arg == "--probe":
        asyncio.run(probe())
    elif arg == "--preload":
        preload()
    elif arg == "--demo":
        player = Player()
        start = float(sys.argv[2]) if len(sys.argv) > 2 else 0
        demo(player, start)
        show(player, None)   # demo: nothing to watch, the pretend clock just runs
    else:
        player = Player()
        # show() opens the window and then runs listen_and_watch in the background
        show(player, lambda: listen_and_watch(player))


if __name__ == "__main__":
    main()
