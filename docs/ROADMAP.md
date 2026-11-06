# Lyric Constellation 1.0: roadmap

Goal: finish the Windows app as a clean, fast, documented 1.0 that you can ship to other people and explain line by
line in an interview (Plan A), then let users opt in to sending mood corrections so the model improves with use
(Plan B). Android stays off.

**Where it stands today** (measured 2026-11-04): ~4,800 lines (Python ~1,000, UI ~3,500). The Python process uses
~485 MB, mostly the Whisper model; the WebView2 window uses ~414 MB. Python imports take 0.3 s. There are 2 pytest
files and CI runs ruff and pytest.

---

## Plan A: a clean, fast, product-ready 1.0

### Phase 0: land what's in progress
- Finish and commit the mood model (the other session) and calm mode on `mix-and-new-looks`, then merge to `main`.
  Every later phase starts from a clean, committed tree.
- **Done when:** `main` has calm mode and the mood model, CI is green, and the app runs from `main`.

### Phase 1: baseline numbers
- Add `tools/measure.py`: time from launch to the first drawn frame, memory at idle and while playing (Python and
  WebView2), CPU %, and FPS per look (the page reports its FPS to the log through a `?bench` URL flag).
- Save the results as the "before" column of a table in `docs/PERFORMANCE.md`.
- **Done when:** one command prints the numbers and they're written down.

### Phase 2: repo cleanup
- Move `android/` to an `android` branch and remove it from `main`. Remove the Android badge and the APK text from
  the README and the GPL part of `NOTICE.md`. On `main`, the license is plain MIT.
- Delete dead code, old comments and anything unused (checked with ruff's unused rules plus a manual pass over the UI).
- Add `CHANGELOG.md`, `CONTRIBUTING.md` and `PRIVACY.md` (needed for Plan B).
- **Done when:** a new reader sees only the Windows app, and every file in the tree is used.

### Phase 3: code that reads like a book
**Python** (`lyric_constellation/`)
- `player.py`: `Player` moves out of `media.py`. `media.py` keeps only "what is Windows playing".
- `settings.py`: one place that loads, validates and saves settings. Today the defaults live in `Api._cfg`.
- `audio.py`: **one** shared speaker-loopback recorder that `Learner` and `MoodListener` both read from. Today each
  opens its own, which costs double CPU and makes double the code. This is a good interview story.
- Type hints and one-line docstrings on every public function. Magic numbers become named constants.

**UI** (`ui/`)
- `index.html` (809 lines, mixing CSS, engine and API code) splits into plain files with no build step, loaded in
  order:
  `ui/app.css`, `ui/core/time.js` (clock, easing), `ui/core/draw.js` (glow sprites, halos, text images),
  `ui/core/mouse.js` (mouse, field, shockwaves), `ui/core/director.js` (phrases, punch, kick),
  `ui/core/mix.js` (looks, Mix plan, crossfade), `ui/core/calm.js`, `ui/core/notch.js`, `ui/core/bridge.js`
  (`poll()` and the calls to Python).
- `ui/looks/README.md`: "how to write a look". It covers the `LOOKS.push({...})` contract (`build`, `frame`, `poll`,
  `reset`, `exit`) with a 40-line example look.
- JS errors get forwarded to the Python log (`api.log`), so a broken screen like the notch bug leaves a trace.
- **Done when:** every file is under ~400 lines, has a header comment saying what it does, and the app looks and
  behaves the same (screenshots of all 6 looks before and after).

### Phase 4: fast and light
- **Whisper off by default**, with a "Learn word timing" switch in the notch. The model loads only when the switch is
  on and unloads after 10 minutes without English lyrics. Expected saving at idle: ~350–400 MB in Python.
- **Draw less when nothing changes.** Paused: 30 FPS. Window minimized or covered: 0 (requestAnimationFrame stops by
  itself; check that the poll also slows down).
- **Start faster:** show the window first, then import numpy and soundcard in the background threads.
- Check the WebView2 caches (sprites, halos, text images) stay capped during a long session (a 1-hour memory curve).
- **Done when:** the "after" column in `docs/PERFORMANCE.md` is filled in. Targets: under 1.5 s to the first
  frame, under 150 MB in Python at idle, and a steady 60 FPS on every look.

### Phase 5: shipping like a product
- **Installer:** an Inno Setup script (`installer/setup.iss`). It gives a Start-menu entry, an uninstaller and an
  optional "start with Windows" box, and adds Ctrl+Alt+Z inside the app (so `hotkey.pyw` is no longer needed).
- **Release workflow:** pushing a `v*` tag makes GitHub Actions build PyInstaller and then the installer, and attach
  `LyricConstellation-Setup.exe` to the release.
- **Update check:** at startup the app asks the GitHub Releases API for the latest tag. If it's newer, the notch shows
  "Update available" with a download link. It doesn't update itself silently, which keeps it simple and safe.
- Optional, costs money: a code-signing certificate to stop the SmartScreen warning.
- **Done when:** a clean Windows PC goes from download to running app with no Python installed, and the next version
  gets announced in the app.

### Phase 6: docs for the interview
- `docs/ARCHITECTURE.md`: one page and one diagram. It follows a song from Spotify, through the Windows media
  session, the watcher thread, LRCLIB and the `Player`, then `api.state()` polled every 250 ms, then the frame loop
  and the look. It also covers the threads (watcher, learner, mood listener), why polling is used instead of pushing,
  and the main trade-offs.
- `docs/WALKTHROUGH.md`: a file-by-file tour in the order you'd explain it, with the 3–4 cleverest parts called out:
  - word-timing learning,
  - fitting the mood model and fusing its predictions,
  - drawing that doesn't depend on frame rate (`ease()`),
  - the seeded Mix plan that two screens agree on.
- `docs/PERFORMANCE.md`: the before/after table from phases 1 and 4.
- README: a short GIF at the top, a features list, and Install / Use / Build / Architecture links.
- **Done when:** someone new can read `ARCHITECTURE.md` and then find any feature in the code in under a minute.

Then tag **v1.0.0**.

---

## Plan B: the model learns from its users (opt-in)

**What is collected:** only mood corrections. When the mood is on Auto and a user taps **Calm** or **Lively** during
a song, that is a label: this song felt calm (or lively), and the model said X. That is exactly what
`tools/train_mood.py` needs. It already fetches the lyrics and sound for any song title by itself, so no audio and no
measurements leave anyone's PC.

### B1: recording corrections in the app
- `lyric_constellation/feedback.py`: when `set_mood` changes while a song plays, it adds
  `{artist, title, model_p, chosen, app_version, week}` to `%APPDATA%\LyricConstellation\reports\2026-W45.json`.
  One entry per song: the latest choice wins.
- Calm/Lively already means "for this song" and the next song starts on Auto, so one tap labels one song. Still to
  add: remembering the choice when the same song plays again.
- **Consent:** on first run, a card asks "Help improve the mood model? Only song names and your Calm/Lively choices
  are sent, never audio." with **Yes** / **No**. If Yes, once a week a card lists exactly what's in the report and
  offers **Send** / **Not now** / **Stop asking**. The answer is stored in settings and can be changed any time.
  Nothing is sent without a Yes.

### B2: the collecting server
- `server/`: a Cloudflare Worker (free tier) with one endpoint, `POST /report`.
  - It checks the shape (JSON schema, at most 64 KB, at most 500 entries) and rate-limits each install.
  - It stores reports in Cloudflare D1 (SQLite) and doesn't keep IP addresses.
  - Reports carry only a random install ID (a UUID made on first run), with no name or email.
- `GET /export` (behind your own secret, which never ships in the app) downloads everything as CSV.
- The app holds no secret: anyone can send a report, so the server validates and limits instead.
- `PRIVACY.md` says exactly what is collected, why, where it's kept, and how to opt out.

### B3: turning reports into a better model
- `tools/train_mood.py import-reports`: merges exported labels into `mood_songs.txt`.
  - A song counts only when at least 2 different installs agree, which guards against mistakes and spam.
  - It then runs `fetch` and `train`, and compares accuracy on the fixed held-out set.
  - It ships the new `mood_model.json` only if accuracy didn't drop.
- New weights go out in the next release, and the update check from Phase 5 tells users.
- This loop is your CV story: real users label data, the model retrains, accuracy goes up, and every version's
  numbers are shown in `docs/PERFORMANCE.md`.

**Done when:** a test install sends a report after consent and it shows up in `/export`, and
`import-reports` → `train` produces a model plus an accuracy line.

---

## Order and size
| Phase | Depends on | Size |
|---|---|---|
| 0 Land work | – | small |
| 1 Baseline | 0 | small |
| 2 Cleanup | 0 | small |
| 3 Readable code | 2 | large |
| 4 Fast and light | 3 | medium |
| 5 Installer and updates | 2 | medium (can run beside 3–4) |
| 6 Docs | 3, 4 | medium |
| B1 Corrections + consent | 3 | medium |
| B2 Server | – (only the report format) | medium (can start any time) |
| B3 Retrain loop | B1, B2 | small |

Rules for every phase: the app must look and behave the same unless the phase says otherwise. Each phase checks all
6 looks in the real app window, not only the preview. ruff and pytest stay green, and each phase is one PR.
