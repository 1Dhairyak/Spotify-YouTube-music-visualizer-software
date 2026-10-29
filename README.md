# Lyric Constellation

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
- **Synced lyrics** from [LRCLIB](https://lrclib.net), cached locally.
- **Learns word timing by listening.** LRCLIB times lines, not words. While an English song plays, Whisper
  (`faster-whisper`, small.en, ~480 MB downloaded on first use) hears which word is sung when and saves it, so
  replays and repeated choruses follow the singing word for word. Without `faster-whisper` installed, words inside a line are estimated.
- **Recognize by sound** (Shazam) when a player doesn't report the song.
- **Sharp album art** from the iTunes catalogue.

## Run

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

Other commands: `--preload` (cache lyrics for `songs.txt`), `--probe` (show what Windows reports), `--selftest`.

Each look is one file in `ui/looks/`; delete the file and its `<script>` line in `ui/index.html` to drop it.
Fonts in `ui/fonts/` are from Google Fonts under the SIL Open Font License (Permanent Marker: Apache 2.0); licence files are next to them.
