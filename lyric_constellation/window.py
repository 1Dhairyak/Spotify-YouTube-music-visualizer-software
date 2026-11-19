"""The app's windows, and the functions the page (ui/index.html) can call in Python.

The screen is a web page (HTML + JavaScript) shown in a desktop window by `pywebview`, which uses the
Microsoft Edge WebView2 engine built into Windows. pywebview lets the page call the methods of the `Api`
class below as `pywebview.api.state()`, `pywebview.api.seek(42)` and so on. Methods whose name starts with
an underscore are private: the page can't call them.

The page asks for state() 4 times a second, and for track() whenever the song changes.

More than one monitor: each monitor that is switched on (in the notch) gets its own full-screen window.
With one monitor it shows everything; with two, one shows the lyrics and the other the cover and title;
with three, the third shows the lyrics again.
"""
import logging
import os
import threading
import time

from . import DATA, ROOT, read_json, write_json
from .beat import for_ui

log = logging.getLogger(__name__)
SETTINGS = DATA / "settings.json"
PAGE = str(ROOT / "ui" / "index.html")


class Api:
    """Everything the page can ask Python for. Window 0 is the main window: it stays on the monitor it opened on,
    and is hidden while that monitor is switched off."""

    def __init__(self, player):
        self._player = player
        self._wins = {}          # window number -> pywebview window
        self._open = True        # False once the app is closing
        self._lock = threading.Lock()
        self._main_id = None     # the monitor the main window is on
        self._main_shown = True
        self._extras = {}        # monitor -> window number, for the windows on other monitors
        self._next_win = 1       # the number the next extra window gets
        self._ids = []           # all monitors, left to right
        self._on = []            # the monitors switched on
        self._views = {0: "both"}   # window number -> what it shows: "both", "stars" (lyrics), "cover" or "gone"

        # Settings, remembered between runs in settings.json:
        #   screens_on: monitors chosen in the notch; stars_on: which screen shows the lyrics (the S key swaps)
        #   style: Constellation's sub-style; look: songs played so far (the page shows look number `look % 7`)
        #   lock: the look picked in the notch (-1 = Mix); color: Constellation's color (-1 = cycle)
        self._cfg = {"screens_on": None, "stars_on": 0, "style": 0, "look": 0, "lock": -1, "color": -1}
        self._cfg.update(read_json(SETTINGS, {}))

        self._seen_track_id = 0
        self._look_lock = threading.Lock()

    # ---------- what the page reads ----------

    def state(self):
        """Everything that changes all the time: position, play/pause, status, which look, mood, beat..."""
        p = self._player
        with self._look_lock:   # two windows poll at once; move to the next look only once per song
            new_song = p.track_id != self._seen_track_id and p.track["id"] == p.track_id and p.track["title"]
            if new_song:
                self._seen_track_id = p.track_id
                self.next_look()

        if self._cfg["lock"] >= 0:
            look = self._cfg["lock"]   # a look picked in the notch
        else:
            look = self._cfg["look"]   # take turns, one look per song

        return {"rev": p.rev,
                "pos": p.now(),
                "playing": p.playing,
                "status": p.status,
                "views": self._views,
                "monitors": [{"n": k + 1, "on": i in self._on} for k, i in enumerate(self._ids)],
                "style": self._cfg["style"],
                "look": look,
                "lock": self._cfg["lock"],
                "color": self._cfg["color"],
                "songs": self._cfg["look"],
                "calm": p.mood.value() if p.mood else None,
                "mood": p.mood.choice if p.mood else "auto",
                "beat": for_ui(p.beat),
                "dur": p.dur or (p.lyrics or {}).get("duration"),
                "can_seek": p.can_seek}

    def track(self):
        """The song: title, artist, cover and every word with its time. Fetched again when state()'s "rev" changes."""
        return self._player.track

    def levels(self):
        """Asked every 50 ms while the cover bars show: {"n": block number, "bands": two frames of 0..1 levels}."""
        return self._player.levels

    # ---------- buttons and keys on the page ----------

    def next_look(self):
        self._cfg["look"] += 1
        self._save()

    def set_lock(self, i):
        """From the notch: -1 = Mix (looks take turns every few lines), otherwise stay on look number i."""
        i = int(i)
        if i < 0 <= self._cfg["lock"]:
            self._cfg["look"] = self._cfg["lock"]   # going back to Mix carries on from the look on screen
        self._cfg["lock"] = i
        self._save()

    def set_mood(self, m):
        """From the notch, for the song playing: "auto" (the mood model decides), "calm" or "lively"."""
        if m in ("auto", "calm", "lively") and self._player.mood:
            self._player.mood.choice = m

    def set_color(self, i):
        """From the notch: Constellation's color, -1 = cycle through all 15."""
        self._cfg["color"] = int(i)
        self._save()

    def set_style(self, i):
        self._cfg["style"] = int(i)
        self._save()

    def fullscreen(self, win=0):
        self._wins[win].toggle_fullscreen()

    def toggle_screen(self, n):
        """From the notch: switch monitor n (1 = leftmost) on or off. One always stays on."""
        i = self._ids[int(n) - 1]
        if i in self._on and len(self._on) == 1:
            return "One screen has to stay on"
        # The new list: the same monitors, with monitor i flipped.
        self._choose([x for x in self._ids if (x in self._on) != (x == i)])
        return f"Screen {n} {'on' if i in self._on else 'off'}"

    def toggle_dual(self):
        """The D key: every monitor, or back to one."""
        if len(self._on) > 1:
            self._choose([self._on[0]])
            return "One screen"
        self._choose(list(self._ids))
        return "All screens" if len(self._ids) > 1 else "Only one screen connected"

    def swap(self):
        """The S key: move the lyrics to the next screen."""
        self._cfg["stars_on"] += 1
        self._save()
        return "Screens swapped"

    def seek(self, sec):
        self._player.seek(sec)

    # The music buttons press the keyboard's media keys, so they work with any player Windows can control.
    def play_pause(self):
        self._media_key(0xB3)

    def next_track(self):
        self._media_key(0xB0)

    def prev_track(self):
        self._media_key(0xB1)

    def volume(self, change):
        """Windows' own volume, one step up or down; Windows shows its volume popup."""
        self._media_key(0xAF if change > 0 else 0xAE)

    @staticmethod
    def _media_key(vk):
        """Press and release a key (vk = Windows' code for it), as if on the keyboard."""
        import ctypes
        ctypes.windll.user32.keybd_event(vk, 0, 0, 0)   # key down
        ctypes.windll.user32.keybd_event(vk, 0, 2, 0)   # key up

    # ---------- private ----------

    def _choose(self, on):
        self._cfg["screens_on"] = on
        self._save()
        self._sync_screens()

    def _save(self):
        write_json(SETTINGS, self._cfg)

    def _sync_screens(self):
        """Make the windows match the monitors plugged in and the ones switched on in the notch.
        Called every 2 seconds and after every change in the notch."""
        import webview
        with self._lock:
            if not self._open:
                return

            # Every monitor, left to right, named by its position and size ("x,y,width,height").
            screens = {}
            for s in sorted(webview.screens, key=lambda s: (s.x, s.y)):
                screens[f"{s.x},{s.y},{s.width},{s.height}"] = s
            ids = list(screens)
            if self._main_id not in screens:
                # At startup, or its monitor was unplugged (Windows moves the window to the main monitor).
                self._main_id = next((i for i, s in screens.items() if s.x == 0 and s.y == 0), ids[0])
            on = [i for i in ids if i in (self._cfg["screens_on"] or [])] or [self._main_id]

            # Open a window on each monitor that's on and doesn't have one yet.
            for i in on:
                if i != self._main_id and i not in self._extras:
                    n = self._next_win
                    self._extras[i] = n
                    self._next_win += 1
                    w = webview.create_window(f"Music Sync (screen {ids.index(i) + 1})", f"{PAGE}?win={n}", js_api=self,
                                              screen=screens[i], fullscreen=True, background_color="#000000")
                    w.events.closed += self._closer(n)
                    self._wins[n] = w
            if self._main_id in on and not self._main_shown:
                self._wins[0].show()
                self._main_shown = True
            self._ids = ids
            self._on = on

            # Decide what each window shows.
            def win(i):   # monitor -> its window number
                return 0 if i == self._main_id else self._extras[i]
            if len(on) == 1:
                self._views = {win(on[0]): "both"}
            else:
                lyrics_screen = self._cfg["stars_on"] % len(on)   # the S key moves this along
                cover = (lyrics_screen + 1) % len(on)              # the screen after it shows the cover
                self._views = {win(i): "cover" if k == cover else "stars" for k, i in enumerate(on)}

            # Close the windows on monitors that were switched off (and hide the main one if its monitor is off).
            going = [(i, n) for i, n in self._extras.items() if i not in on]
            hide_main = self._main_id not in on and self._main_shown
            if going or hide_main:
                time.sleep(0.8)   # let the page fade out first (a window with no view fades to black)
            for i, n in going:
                del self._extras[i]
                self._wins.pop(n).destroy()
            if hide_main:
                self._wins[0].hide()
                self._main_shown = False

    def _closer(self, n):
        """What happens when window n closes. If the user closed it (Alt+F4), quit the app, even with the main
        window hidden. A window we close ourselves has already been removed from _wins, so that doesn't quit."""
        def closed():
            if n in self._wins:
                os._exit(0)
        return closed

    def _close(self):
        """The main window closed: close the others too."""
        with self._lock:
            self._open = False
            for n, w in list(self._wins.items()):
                if n:
                    w.destroy()


def watch_screens(api):
    """Every 2 seconds, check for monitors being plugged in or out."""
    # ponytail: polling every 2 s; a Windows display-change hook would react instantly
    while api._open:
        try:
            api._sync_screens()
        except Exception:
            log.exception("screens")
        time.sleep(2)


def show(player, worker):
    """Open the main window and run until it's closed. `worker` (the media watcher) runs in the background."""
    import webview

    api = Api(player)
    api._wins[0] = webview.create_window("Music Sync", PAGE, js_api=api, width=1200, height=760,
                                         background_color="#000000", fullscreen=True)
    api._wins[0].events.closed += api._close

    def start():   # pywebview runs this on a background thread once the window is up
        threading.Thread(target=watch_screens, args=(api,), daemon=True).start()
        if worker:
            worker()

    webview.start(start)   # shows the window; returns when it's closed
    os._exit(0)            # make sure no background thread keeps a hidden process alive
