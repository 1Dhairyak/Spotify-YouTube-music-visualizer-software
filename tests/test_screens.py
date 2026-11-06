"""Choosing monitors: which windows exist, what each shows, with 1, 2 and 3 monitors plugged in."""
import sys, types

import pytest

from lyric_constellation import read_json, window
from lyric_constellation.media import Player


def mon(x, w=1920):
    return types.SimpleNamespace(x=x, y=0, width=w, height=1080)


class Win:
    def __init__(self, title="", url="", screen=None):
        self.title, self.url, self.screen, self.visible, self.destroyed = title, url, screen, True, False
        self.events = types.SimpleNamespace(closed=Closed())

    def show(self):
        self.visible = True

    def hide(self):
        self.visible = False

    def destroy(self):
        self.destroyed = True


class Closed:
    def __iadd__(self, fn):
        self.fn = fn
        return self


@pytest.fixture
def setup(monkeypatch, tmp_path):
    def make(*monitors):
        made = []

        def create_window(title, url, js_api=None, screen=None, fullscreen=False, background_color=None):
            made.append(Win(title, url, screen))
            return made[-1]

        fake = types.SimpleNamespace(screens=list(monitors), create_window=create_window)
        monkeypatch.setitem(sys.modules, "webview", fake)
        monkeypatch.setattr(window, "SETTINGS", tmp_path / "settings.json")
        monkeypatch.setattr(window.time, "sleep", lambda s: None)
        api = window.Api(Player())
        api._wins[0] = Win("main")
        api._sync_screens()
        return api, made, fake
    return make


def on(api):
    return [m["on"] for m in api.state()["monitors"]]


def test_one_monitor_is_one_only(setup):
    api, made, _ = setup(mon(0))
    s = api.state()
    assert s["monitors"] == [{"n": 1, "on": True}] and s["views"] == {0: "both"} and not made
    assert "stay on" in api.toggle_screen(1) and on(api) == [True] and api._wins[0].visible
    assert api.toggle_dual() == "Only one screen connected"


def test_two_monitors_start_on_one_and_switch_with_a_tap(setup):
    api, made, _ = setup(mon(0), mon(1920))
    assert on(api) == [True, False] and api.state()["views"] == {0: "both"} and not made   # starts on Screen 1

    assert api.toggle_screen(2) == "Screen 2 on"                # both
    assert on(api) == [True, True] and len(made) == 1 and made[0].screen.x == 1920 and "?win=1" in made[0].url
    assert api.state()["views"] == {0: "stars", 1: "cover"}

    assert api.toggle_screen(1) == "Screen 1 off"               # only the right monitor: the left one is free to turn off
    assert on(api) == [False, True] and api.state()["views"] == {1: "both"} and not api._wins[0].visible

    assert "stay on" in api.toggle_screen(2)                    # never none
    assert on(api) == [False, True]

    assert api.toggle_screen(1) == "Screen 1 on"
    assert api._wins[0].visible and api.state()["views"] == {0: "stars", 1: "cover"}

    assert api.toggle_screen(2) == "Screen 2 off"               # back to one: the extra window is gone
    assert made[0].destroyed and api.state()["views"] == {0: "both"} and 1 not in api._wins
    assert read_json(window.SETTINGS)["screens_on"] == ["0,0,1920,1080"]    # remembered


def test_three_monitors_any_mix(setup):
    api, made, _ = setup(mon(-1920), mon(0), mon(1920))         # the primary is the middle one
    assert on(api) == [False, True, False] and api.state()["views"] == {0: "both"}
    api.toggle_screen(1)
    api.toggle_screen(3)
    assert on(api) == [True, True, True] and len(made) == 2
    views = api.state()["views"]
    assert sorted(views.values()) == ["cover", "stars", "stars"] and set(views) == {0, 1, 2}
    api.toggle_screen(2)                                        # the outer two only
    assert on(api) == [True, False, True] and not api._wins[0].visible and sorted(api.state()["views"].values()) == ["cover", "stars"]
    assert api.toggle_dual() == "One screen" and on(api) == [True, False, False]
    assert api.toggle_dual() == "All screens" and on(api) == [True, True, True]


def test_swap_changes_which_screen_has_the_lyrics(setup):
    api, _, _ = setup(mon(0), mon(1920))
    api.toggle_screen(2)
    assert api.state()["views"] == {0: "stars", 1: "cover"}
    api.swap()
    api._sync_screens()
    assert api.state()["views"] == {0: "cover", 1: "stars"}


def test_unplugging_a_monitor_falls_back(setup):
    api, made, fake = setup(mon(0), mon(1920))
    api.toggle_screen(2)
    api.toggle_screen(1)                                        # only the right monitor, then it's unplugged
    fake.screens = [mon(0)]
    api._sync_screens()
    assert on(api) == [True] and api._wins[0].visible and made[0].destroyed and api.state()["views"] == {0: "both"}
    fake.screens = [mon(0), mon(1920)]                          # plugged back in: the choice returns
    api._sync_screens()
    assert on(api) == [False, True] and not api._wins[0].visible


def test_a_saved_choice_opens_again(setup, tmp_path):
    api, _, _ = setup(mon(0), mon(1920))
    api.toggle_screen(2)
    second = window.Api(Player())
    second._wins[0] = Win("main")
    second._sync_screens()
    assert on(second) == [True, True]


def test_closing_a_window_quits_but_our_own_closing_does_not(setup, monkeypatch):
    quit = []
    monkeypatch.setattr(window.os, "_exit", quit.append)
    api, made, _ = setup(mon(0), mon(1920))
    api.toggle_screen(2)
    api.toggle_screen(2)                                        # we closed it: the app carries on
    made[0].events.closed.fn()
    assert not quit
    api.toggle_screen(2)
    made[1].events.closed.fn()                                  # the user pressed Alt+F4 on it
    assert quit == [0]


def test_the_countdown_knows_the_length_from_the_player_or_the_lyrics(setup):
    api, _, _ = setup(mon(0))
    assert api.state()["dur"] is None                           # unknown: the UI hides the countdown
    p = api._player
    p.tid = 1
    p.publish("Song", "Artist", None, [], "", {"lrc": "[00:01.00]hi", "duration": 200})
    assert api.state()["dur"] == 200                            # identified by sound: LRCLIB knows the length
    p.dur = 215.5
    assert api.state()["dur"] == 215.5                          # the player itself wins
