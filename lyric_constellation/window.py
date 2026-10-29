"""The pywebview window(s) and the API the page calls (pywebview.api)."""
import logging, os, threading, time

from . import DATA, ROOT, read_json, write_json

log = logging.getLogger(__name__)
SETTINGS = DATA / "settings.json"
PAGE = str(ROOT / "ui" / "index.html")


class Api:
    """Exposed to ui/index.html as pywebview.api (underscore names stay private).
    Window 0 is the main window. With two screens, window 1 opens on the other screen;
    one window shows the cover and title, the other the constellation."""

    def __init__(self, player):
        self._player, self._wins, self._dual, self._open = player, [], False, True
        self._lock = threading.Lock()
        # mode: auto (two screens when available) | single; look: counts songs, the UI shows look % number of looks
        self._cfg = {"mode": "auto", "stars_on": 0, "style": 0, "look": 0, "lock": -1, "color": -1}
        self._cfg.update(read_json(SETTINGS, {}))
        self._seen_tid, self._look_lock = 0, threading.Lock()

    def state(self):
        p = self._player
        with self._look_lock:  # both screens poll at once; advance only once per song
            if p.tid != self._seen_tid and p.track["id"] == p.tid and p.track["title"]:
                self._seen_tid = p.tid  # a new song started: the next look takes over
                self.next_look()
        return {"rev": p.rev, "pos": p.now(), "playing": p.playing, "status": p.status,
                "dual": self._dual, "stars_on": self._cfg["stars_on"], "style": self._cfg["style"],
                "look": self._cfg["lock"] if self._cfg["lock"] >= 0 else self._cfg["look"],
                "lock": self._cfg["lock"], "color": self._cfg["color"]}

    def next_look(self):
        self._cfg["look"] += 1
        self._save()

    def set_lock(self, i):
        """From the notch: -1 = mix (a new look every song), else stay on look i."""
        i = int(i)
        if i < 0 <= self._cfg["lock"]:
            self._cfg["look"] = self._cfg["lock"]  # mixing carries on from the look on screen
        self._cfg["lock"] = i
        self._save()

    def set_color(self, i):
        """From the notch: Constellation's color, -1 = cycle through all 15."""
        self._cfg["color"] = int(i)
        self._save()

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
        write_json(SETTINGS, self._cfg)

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
            log.exception("screens")
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
