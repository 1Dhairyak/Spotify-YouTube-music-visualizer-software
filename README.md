# Lyric Constellation

A lightweight Windows app that turns whatever you're playing on Spotify, YouTube Music or YouTube into time-synced lyrics drawn as a glowing constellation. It runs full screen, uses a second monitor when you have one, and shifts through 15 colors and 6 styles as the song plays.

- **No login.** It reads the song from Windows' media controls (the title in the volume popup).
- **Synced lyrics** from [LRCLIB](https://lrclib.net), cached locally.
- **Recognize by sound** (Shazam) when a player doesn't report the song.
- **Sharp album art** from the iTunes catalogue.

## Run

```bash
pip install -r requirements.txt
python app.py              # live
python app.py --demo 15    # demo with the first song in songs.txt, starting at 0:15
```

Double-click `hotkey.pyw` to make **Ctrl+Alt+Z** open or close the app from anywhere.

## Keys

| Key | Does |
|---|---|
| Space | Play / pause the music |
| F12 / F11, Esc | Toggle full screen / leave it |
| T, 1–6 | Next style / pick a style (styles also rotate every 30 s) |
| D / S | One or two screens / swap screens |
| ← / →, 0 | Shift lyric timing / reset |

Other commands: `--preload` (cache lyrics for `songs.txt`), `--probe` (show what Windows reports), `--selftest`.
