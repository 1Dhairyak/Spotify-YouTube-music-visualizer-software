# Lyric Constellation

<p>
  <a href="https://github.com/1Dhairyak/Spotify-YouTube-music-visualizer-software/releases/latest/download/LyricConstellation-Windows.zip"><img alt="Download for Windows" src="https://img.shields.io/badge/Download-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" height="40"></a>
  &nbsp;
  <a href="https://github.com/1Dhairyak/Spotify-YouTube-music-visualizer-software/releases/latest/download/LyricConstellation-Android.apk"><img alt="Download for Android" src="https://img.shields.io/badge/Download-Android-3DDC84?style=for-the-badge&logo=android&logoColor=white" height="40"></a>
</p>

**Windows:** unzip, then run `LyricConstellation.exe` (Windows 10/11; if SmartScreen warns about an unknown app, choose *More info → Run anyway*).
**Android 8+:** open the `.apk` on your phone to install it (allow installing from your browser or files app when asked), then allow
*notification access* when the app asks: that is how it sees which song is playing. Notifications themselves are never read.
The Android app has the Constellation look with its color picker; the Windows app has all 5 looks.

A lightweight Windows app that turns whatever you're playing on Spotify, YouTube Music or YouTube into time-synced kinetic-typography lyrics. It runs full screen and uses a second monitor when you have one.

Each song gets the next of 5 looks, in turn:

| Look | Style |
|---|---|
| Constellation | Glowing stars and lines; 6 sub-styles every 30 s, 15 colors every 20 s, a light circling the screen edge |
| Pink Poster | Morphing pink gradients, extra-wide outlined type that fills in, echo rows, a lettered sphere, shattering glass |
| Pop Colors | Flat bold colors with wipes, justified blocks of mixed fonts, hatched 3D shadows, ring text, handwriting with splats |
| Ink Sketch | Paper and blackboard with ink floods, brush caps, hand-drawn bubbles, signboard, bulbs, footsteps |
| Night Map | Teal night sky with clouds and flying letters, and a city map where each line runs along a road |

- **No login.** It reads the song from Windows' media controls (the title in the volume popup).
- **Synced lyrics** from [LRCLIB](https://lrclib.net), cached locally in `%APPDATA%\LyricConstellation` (with settings and the log).
- **Learns word timing by listening.** LRCLIB times lines, not words. While an English song plays, Whisper
  (`faster-whisper`, small.en, ~480 MB downloaded on first use) hears which word is sung when and saves it, so
  replays and repeated choruses follow the singing word for word. Without `faster-whisper` installed, words inside a line are estimated.
- **Recognize by sound** (Shazam) when a player doesn't report the song.
- **Sharp album art** from the iTunes catalogue.

## Run from source

Requirements: Windows 10/11 and Python 3.10+.

```bash
pip install -r requirements.txt
python app.py              # live
python app.py --demo 15    # demo with the first song in songs.txt, starting at 0:15
```

Double-click `hotkey.pyw` to make **Ctrl+Alt+Z** open or close the app from anywhere.

**The notch:** hover the black pill at the top center of the screen to pick one look or **Mix** (a new look every song), and Constellation's color (or **Cycle**). Switches crossfade; the choice is remembered. It slides away after 5 s without the mouse moving, once the edge light has gone round it.

**The mouse:** every look reacts to it. Words and stars near the cursor are pushed aside and magnified, then spring back; the scene leans with it; the edge light bends toward it, ripples when you sweep past and races to meet it. Drawing keeps pace with the screen's refresh rate (180 Hz included).

## Keys

| Key | Does |
|---|---|
| Space | Play / pause the music |
| F12 / F11, Esc | Toggle full screen / leave it |
| N | Next look (looks also change with every new song) |
| T, 1–6 | In Constellation: next sub-style / pick one (they also rotate every 30 s) |
| D / S | One or two screens / swap screens |
| ← / →, 0 | Shift lyric timing / reset |

Other commands: `--preload` (cache lyrics for `songs.txt`), `--probe` (show what Windows reports), `--version`.

## Develop

```bash
pip install -r requirements-dev.txt
pytest        # lyrics parsing, word timing, title cleanup, cache
ruff check .
```

Build the downloads: `python -m PyInstaller LyricConstellation.spec` (Windows, into `dist/`) and
`android/gradlew assembleRelease` (Android; the app is `ui/index.html` with only Constellation, plus `android/web/android.js`
in place of the Python side).

The code lives in `lyric_constellation/` (`lyrics.py`, `media.py`, `learner.py`, `window.py`); `app.py` just starts it.
MIT licensed; see [NOTICE.md](NOTICE.md) for fonts, lyrics and services.

Each look is one file in `ui/looks/`; delete the file and its `<script>` line in `ui/index.html` to drop it.
Fonts in `ui/fonts/` are from Google Fonts under the SIL Open Font License (Permanent Marker: Apache 2.0); licence files are next to them.
