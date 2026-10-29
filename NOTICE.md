# Notices

**Code:** MIT, see [LICENSE](LICENSE), except the Android app in `android/`, which is **GPL-3.0-or-later**
(see [android/LICENSE](android/LICENSE)): its song recognition (`Signature.java`) is a Java port of the fingerprinting in
[SongRec](https://github.com/marin-m/SongRec) by Marin Moulinier and contributors, GPL-3.0.

**Fonts** in `ui/fonts/` are from Google Fonts: Archivo, League Gothic, Alfa Slab One, Josefin Sans and Caveat under the
SIL Open Font License 1.1; Permanent Marker under the Apache License 2.0. Each licence file sits next to its font.

**Lyrics** are not part of this project. They are fetched at runtime from [LRCLIB](https://lrclib.net) and cached only
on your own device (`%APPDATA%\LyricConstellation\cache` on Windows, app storage on Android); nothing is redistributed.

**Album art** comes at runtime from the public iTunes Search API, or from the player's own thumbnail.

**Song recognition by sound** uses Shazam's unofficial app endpoint, which may stop working if Shazam changes its service.
Only a fingerprint (frequency peaks) is sent, never the audio itself.
- Windows: through [shazamio](https://github.com/shazamio/ShazamIO) (MIT), only when no player reports what is playing,
  from 6 seconds of the speaker output. Its fingerprinting core, shazamio-core, is published as MIT and follows SongRec.
- Android: the app's own port of SongRec's fingerprinting, from about 10 seconds of the microphone, only while the app
  is open on screen. Nothing is recorded or kept.

**Word timing** is learned on your computer with [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
(MIT; Whisper model weights by OpenAI, MIT). Audio is processed locally and never uploaded.
