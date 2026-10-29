# Notices

**Code:** MIT, see [LICENSE](LICENSE).

**Fonts** in `ui/fonts/` are from Google Fonts: Archivo, League Gothic, Alfa Slab One, Josefin Sans and Caveat under the
SIL Open Font License 1.1; Permanent Marker under the Apache License 2.0. Each licence file sits next to its font.

**Lyrics** are not part of this project. They are fetched at runtime from [LRCLIB](https://lrclib.net) and cached only
on your own computer (`%APPDATA%\LyricConstellation\cache`); nothing is redistributed.

**Album art** comes at runtime from the public iTunes Search API, or from the player's own thumbnail.

**Song recognition by sound** uses [shazamio](https://github.com/shazamio/ShazamIO), an unofficial client for Shazam.
It is only used when no player reports what is playing, sends a 6-second clip of the speaker output, and may stop
working if Shazam changes its service. Everything else in the app works without it.

**Word timing** is learned on your computer with [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
(MIT; Whisper model weights by OpenAI, MIT). Audio is processed locally and never uploaded.
