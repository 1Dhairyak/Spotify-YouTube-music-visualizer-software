# Lyric Constellation

<p>
  <a href="https://github.com/1Dhairyak/Spotify-YouTube-music-visualizer-software/releases/latest/download/LyricConstellation-Windows.zip"><img alt="Download for Windows" src="https://img.shields.io/badge/Download-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" height="40"></a>
  &nbsp;
  <a href="https://github.com/1Dhairyak/Spotify-YouTube-music-visualizer-software/releases/latest/download/LyricConstellation-Android.apk"><img alt="Download for Android" src="https://img.shields.io/badge/Download-Android-3DDC84?style=for-the-badge&logo=android&logoColor=white" height="40"></a>
</p>

**Windows:** unzip, then run `LyricConstellation.exe` (Windows 10/11; if SmartScreen warns about an unknown app, choose *More info → Run anyway*).
**Android 8+:** open the `.apk` on your phone to install it (allow installing from your browser or files app when asked), then allow
the *microphone*: play a song out loud nearby and the app recognizes it (like Shazam) within about 10 seconds, then
listens again every 20 seconds to stay in time and notice a new song or a pause. It only listens while it is open on
screen. The Android app has the Constellation look with its color picker; the Windows app has all 6 looks.

A lightweight Windows app that turns whatever you're playing on Spotify, YouTube Music or YouTube into time-synced kinetic-typography lyrics. It runs full screen and uses a second monitor when you have one.

Each song gets the next of 6 looks, in turn (or pick **Mix** in the notch to switch every few lines):

| Look | Style |
|---|---|
| Constellation | Glowing stars and lines that flare as each word is sung; 7 sub-styles every 30 s (Spiral included), 15 colors every 20 s, a light circling the screen edge that speeds up for fast verses (rap) and drifts through slow ones |
| Pink Poster | Morphing pink gradients, extra-wide outlined type that fills in, echo rows, a lettered sphere, shattering glass, words split in two 3D halves, a framed card with the line running round it |
| Pop Colors | Flat bold colors with wipes, justified blocks of mixed fonts, hatched 3D shadows, ring text, handwriting with splats, tumbling 3D slab words, small lead-ins over a giant word |
| Ink Sketch | Paper and blackboard with ink floods, brush caps, hand-drawn bubbles, signboard, bulbs, footsteps, a glass that fills as the line is sung, a speech balloon |
| Deep Space | Indigo sky with stars, a ringed planet and comets; thin and bold caps that drop, squeeze and slide in; warp streaks; flat color cut-ins with speed lines and a one-word band; RGB-split exits |
| Splash | Flat mint, indigo and magenta with brush-swipe and flood changes, boiling hand lettering, giant dry-brush words, words round a circle, word stairs and flying ink blobs |

- **No login.** It reads the song from Windows' media controls (the title in the volume popup).
- **Synced lyrics** from [LRCLIB](https://lrclib.net), cached locally in `%APPDATA%\LyricConstellation` (with settings and the log).
- **Learns word timing by listening.** LRCLIB times lines, not words. While an English song plays, Whisper
  (`faster-whisper`, small.en, ~480 MB downloaded on first use) hears which word is sung when and saves it, so
  replays and repeated choruses follow the singing word for word. Without `faster-whisper` installed, words inside a line are estimated.
- **Recognize by sound** (Shazam) when a player doesn't report the song.
- **Knows an emotional song when it hears one.** A small trained model reads the lyrics' words (English and romanized
  Hindi/Punjabi) and how densely they're sung, then listens to the music itself: brightness, percussion, beat and
  swells, which works in any language. Ballads get calm mode; the log shows each decision (`mood: … -> calm 0.82`).
- **Sharp album art** from the iTunes catalogue.

## Run from source

Requirements: Windows 10/11 and Python 3.10+.

```bash
pip install -r requirements.txt
python app.py              # live
python app.py --demo 15    # demo with the first song in songs.txt, starting at 0:15
```

Double-click `hotkey.pyw` to make **Ctrl+Alt+Z** open or close the app from anywhere.

**The notch:** hover the black pill at the top center of the screen to pick one look or **Mix** (looks take turns every 5-10 s, each with a random variant, in a new order every play), and Constellation's color (or **Cycle**). Switches crossfade; the choice is remembered. On emotional songs the app goes calm: muted colors, slower motion, gentler pops, and Mix sticks to the quiet looks for 12-20 s each; **Auto · Calm · Lively** in the notch lets it decide or forces one. It slides away after 5 s without the mouse moving, once the edge light has gone round it.

**The mouse:** every look reacts to it. Words and stars near the cursor are pushed aside and magnified, then spring back; the scene leans with it; the edge light bends toward it, ripples when you sweep past and races to meet it. **Click** anywhere to send a shockwave that knocks the lyrics outward. Every word pops as it's sung and the scene kicks in on each line. Drawing keeps pace with the screen's refresh rate (180 Hz included).

## Keys

| Key | Does |
|---|---|
| Space | Play / pause the music |
| F12 / F11, Esc | Toggle full screen / leave it |
| N | Next look; in Mix, reshuffle the order |
| T, 1–7 | In Constellation: next sub-style / pick one (they also rotate every 30 s) |
| D / S | One or two screens / swap screens |
| ← / →, 0 | Shift lyric timing / reset |

Other commands: `--preload` (cache lyrics for `songs.txt`), `--probe` (show what Windows reports), `--version`.

## Develop

```bash
pip install -r requirements-dev.txt
pytest        # lyrics parsing, word timing, title cleanup, cache
ruff check .
```

Retrain the mood model: `python tools/train_mood.py fetch` measures the labeled songs in `tools/mood_songs.txt` and
`tools/mood_heldout.txt` (lyrics from LRCLIB, sound streamed from iTunes previews by ffmpeg, nothing saved but the
measurements), then `python tools/train_mood.py train` fits it, prints its test accuracy and writes
`lyric_constellation/mood_model.json`.

Build the downloads: `python -m PyInstaller LyricConstellation.spec` (Windows, into `dist/`) and
`android/gradlew assembleRelease` (Android; the app is `ui/index.html` with only Constellation, plus `android/web/android.js`
in place of the Python side, and a Java port of SongRec's Shazam fingerprinting in `Signature.java`).

The code lives in `lyric_constellation/` (`lyrics.py`, `media.py`, `learner.py`, `window.py`); `app.py` just starts it.
MIT licensed, except the Android app in `android/`, which is GPL-3.0 (it ports SongRec's GPL code); see [NOTICE.md](NOTICE.md).

Each look is one file in `ui/looks/`; delete the file and its `<script>` line in `ui/index.html` to drop it.
Fonts in `ui/fonts/` are from Google Fonts under the SIL Open Font License (Permanent Marker: Apache 2.0); licence files are next to them.
