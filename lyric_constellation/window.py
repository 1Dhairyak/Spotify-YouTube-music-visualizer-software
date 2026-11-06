"""The pywebview window(s) and the API the page calls (pywebview.api)."""
import logging, os, threading, time

from . import DATA, ROOT, read_json, write_json
from .beat import for_ui

log = logging.getLogger(__name__)
SETTINGS = DATA / "settings.json"
PAGE = str(ROOT / "ui" / "index.html")


class Api:
    """Exposed to ui/index.html as pywebview.api (underscore names stay private).
    Each monitor that's switched on gets a window. Window 0 is the main one: it stays on the monitor it opened on and
    is hidden while that monitor is off. One monitor on shows everything; with more, one shows the lyrics, the next
    the cover and title, and a third the lyrics again."""

    def __init__(self, player):
        self._player, self._wins, self._open = player, {}, True
        self._lock = threading.Lock()
        self._main_id, self._main_shown, self._extras, self._next_win = None, True, {}, 1   # _extras: monitor -> window number
        self._ids, self._on, self._views = [], [], {0: "both"}   # monitors left to right, those switched on, window -> view
        # screens_on: the monitors chosen in the notch; look: counts songs, the UI shows look % number of looks
        self._cfg = {"screens_on": None, "stars_on": 0, "style": 0, "look": 0, "lock": -1, "color": -1}
        self._cfg.update(read_json(SETTINGS, {}))
        self._seen_tid, self._look_lock = 0, threading.Lock()

    def state(self):
        p = self._player
        with self._look_lock:  # both screens poll at once; advance only once per song
            if p.tid != self._seen_tid and p.track["id"] == p.tid and p.track["title"]:
                self._seen_tid = p.tid  # a new song started: the next look takes over
                self.next_look()
        return {"rev": p.rev, "pos": p.now(), "playing": p.playing, "status": p.status,
                "views": self._views, "monitors": [{"n": k + 1, "on": i in self._on} for k, i in enumerate(self._ids)],
                "style": self._cfg["style"],
                "look": self._cfg["lock"] if self._cfg["lock"] >= 0 else self._cfg["look"],
                "lock": self._cfg["lock"], "color": self._cfg["color"], "songs": self._cfg["look"],
                "calm": p.mood.value() if p.mood else None, "mood": p.mood.choice if p.mood else "auto",
                "beat": for_ui(p.beat), "dur": p.dur or (p.lyrics or {}).get("duration"), "can_seek": p.can_seek}

    def next_look(self):
        self._cfg["look"] += 1
        self._save()

    def set_lock(self, i):
        """From the notch: -1 = mix (looks take turns every few lines), else stay on look i."""
        i = int(i)
        if i < 0 <= self._cfg["lock"]:
            self._cfg["look"] = self._cfg["lock"]  # mixing carries on from the look on screen
        self._cfg["lock"] = i
        self._save()

    def set_mood(self, m):
        """From the notch, for the song playing: "auto" (the mood model decides), or "calm" / "lively"."""
        if m in ("auto", "calm", "lively") and self._player.mood:
            self._player.mood.choice = m

    def set_color(self, i):
        """From the notch: Constellation's color, -1 = cycle through all 15."""
        self._cfg["color"] = int(i)
        self._save()

    def track(self):
        return self._player.track

    def fullscreen(self, win=0):
        self._wins[win].toggle_fullscreen()

    def toggle_screen(self, n):
        """From the notch: switch monitor n (1 = leftmost) on or off. One always stays on."""
        i = self._ids[int(n) - 1]
        if i in self._on and len(self._on) == 1:
            return "One screen has to stay on"
        self._choose([x for x in self._ids if (x in self._on) != (x == i)])
        return f"Screen {n} {'on' if i in self._on else 'off'}"

    def toggle_dual(self):
        """The D key: every monitor, or back to one."""
        if len(self._on) > 1:
            self._choose([self._on[0]])
            return "One screen"
        self._choose(list(self._ids))
        return "All screens" if len(self._ids) > 1 else "Only one screen connected"

    def _choose(self, on):
        self._cfg["screens_on"] = on
        self._save()
        self._sync_screens()

    def play_pause(self):
        self._media_key(0xB3)

    def next_track(self):
        self._media_key(0xB0)

    def prev_track(self):
        self._media_key(0xB1)

    def seek(self, sec):
        self._player.seek(sec)

    def volume(self, change):
        """Windows' own volume, up or down a step; its popup shows the level."""
        self._media_key(0xAF if change > 0 else 0xAE)

    @staticmethod
    def _media_key(vk):
        import ctypes  # the keyboard's media keys: work for YouTube Music, Spotify, anything Windows can control
        ctypes.windll.user32.keybd_event(vk, 0, 0, 0)
        ctypes.windll.user32.keybd_event(vk, 0, 2, 0)

    def set_style(self, i):
        self._cfg["style"] = int(i)
        self._save()

    def swap(self):
        self._cfg["stars_on"] += 1
        self._save()
        return "Screens swapped"

    def _save(self):
        write_json(SETTINGS, self._cfg)

    def _sync_screens(self):
        """Match the windows to the monitors plugged in and the ones chosen in the notch."""
        import webview
        with self._lock:
            if not self._open:
                return
            screens = {f"{s.x},{s.y},{s.width},{s.height}": s for s in sorted(webview.screens, key=lambda s: (s.x, s.y))}
            ids = list(screens)
            if self._main_id not in screens:  # at startup, or its monitor was unplugged: Windows moves it to the primary
                self._main_id = next((i for i, s in screens.items() if s.x == 0 and s.y == 0), ids[0])
            on = [i for i in ids if i in (self._cfg["screens_on"] or [])] or [self._main_id]
            for i in on:
                if i != self._main_id and i not in self._extras:
                    self._extras[i], self._next_win = self._next_win, self._next_win + 1
                    w = webview.create_window(f"Music Sync (screen {ids.index(i) + 1})", f"{PAGE}?win={self._extras[i]}", js_api=self,
                                              screen=screens[i], fullscreen=True, background_color="#000000")
                    w.events.closed += self._closer(self._extras[i])
                    self._wins[self._extras[i]] = w
            if self._main_id in on and not self._main_shown:
                self._wins[0].show()
                self._main_shown = True
            self._ids, self._on = ids, on
            win = lambda i: 0 if i == self._main_id else self._extras[i]
            first = self._cfg["stars_on"] % len(on)
            cover = (first + 1) % len(on)
            self._views = {win(on[0]): "both"} if len(on) == 1 else \
                {win(i): "cover" if k == cover else "stars" for k, i in enumerate(on)}
            going = [(i, n) for i, n in self._extras.items() if i not in on]
            hide_main = self._main_id not in on and self._main_shown
            if going or hide_main:
                time.sleep(0.8)  # the page fades out first (a window with no view is "gone")
            for i, n in going:
                del self._extras[i]
                self._wins.pop(n).destroy()
            if hide_main:
                self._wins[0].hide()
                self._main_shown = False

    def _closer(self, n):
        """What happens when window n closes: if the user did it (Alt+F4), quit, even with the main window hidden.
        A window we close ourselves has already left _wins."""
        def closed():
            if n in self._wins:
                os._exit(0)
        return closed

    def _close(self):
        with self._lock:
            self._open = False
            for n, w in list(self._wins.items()):
                if n:
                    w.destroy()


def watch_screens(api):
    # ponytail: polls every 2 s for plugged/unplugged screens; a Windows display-change hook would be instant
    while api._open:
        try:
            api._sync_screens()
        except Exception:
            log.exception("screens")
        time.sleep(2)


def show(player, worker):
    import webview
    api = Api(player)
    api._wins[0] = webview.create_window("Music Sync", PAGE, js_api=api, width=1200, height=760,
                                         background_color="#000000", fullscreen=True)
    api._wins[0].events.closed += api._close

    def start():
        threading.Thread(target=watch_screens, args=(api,), daemon=True).start()
        worker and worker()

    webview.start(start)
    os._exit(0)  # window closed: don't let the lyric watcher thread keep a hidden process alive
