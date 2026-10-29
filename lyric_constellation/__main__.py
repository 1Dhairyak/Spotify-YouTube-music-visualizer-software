"""Lyric Constellation: kinetic-typography lyrics for whatever Windows is playing.

  python app.py             live: follows Spotify / YouTube / YouTube Music via Windows media controls
  python app.py --demo [s]  plays the first songs.txt entry against a fake clock, starting at s seconds
  python app.py --preload   fetches lyrics for every songs.txt entry into the cache
  python app.py --probe     prints what Windows reports for every media session, once a second
  python app.py --version   prints the version
"""
import asyncio, logging, logging.handlers, os, sys, threading, warnings

from . import DATA, ROOT, __version__, migrate_old_data
from .learner import Learner
from .lyrics import clean, cover_url, fetch_lyrics, words_for
from .media import Player, read_session, run_watch
from .window import show

log = logging.getLogger("lyric_constellation")



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
    player.publish(lyrics["title"], lyrics["artist"], art, words_for(lyrics), "")
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



def setup_logging():
    """Log to DATA/lyric-constellation.log (rotated at 1 MB) and, when there is a console, to it too."""
    DATA.mkdir(parents=True, exist_ok=True)
    console = sys.stdout is not None  # pythonw (the hotkey / tray launch) has no console
    if not console:
        sys.stdout = sys.stderr = open(os.devnull, "w")  # stray prints from libraries go nowhere
    handlers = [logging.handlers.RotatingFileHandler(DATA / "lyric-constellation.log", maxBytes=1 << 20,
                                                     backupCount=2, encoding="utf-8")]
    if console:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        handlers.append(logging.StreamHandler(sys.stdout))
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", handlers=handlers)
    sys.excepthook = lambda *e: log.critical("uncaught", exc_info=e)
    threading.excepthook = lambda a: log.critical("uncaught in %s", a.thread, exc_info=(a.exc_type, a.exc_value, a.exc_traceback))
    # soundcard warns on every tiny gap in loopback recording; harmless and very noisy. It installs an "always" filter
    # when imported, so import it first and put ours in front.
    import soundcard  # noqa: F401
    warnings.filterwarnings("ignore", message="data discontinuity in recording")


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
    else:
        player = Player()
        if arg == "--demo":
            demo(player, float(sys.argv[2]) if len(sys.argv) > 2 else 0)
        show(player, None if arg == "--demo" else lambda: (Learner(player).start(), run_watch(player)))


if __name__ == "__main__":
    main()
