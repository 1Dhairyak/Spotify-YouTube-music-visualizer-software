"""Trains the mood model in lyric_constellation/mood_model.json. Developer tool, not part of the app.

  python tools/train_mood.py fetch   measure every song in mood_songs.txt and mood_heldout.txt (resumable, ~20 min)
  python tools/train_mood.py relyrics   recompute the lyric features from the lyrics already fetched (no network)
  python tools/train_mood.py train   fit the lyrics, sound and fusion models, test them, write mood_model.json

fetch: lyrics come from LRCLIB (training songs) or the app's own cache (held-out songs, read only); sound from the
song's 30 s iTunes preview, which ffmpeg streams straight into memory, so no audio file is ever written. Only the
measurements are kept, in tools/mood_features.json: the set of words a song uses, its lyric density and its
8 sound features. train needs only that file and numpy.
"""
import json, re, subprocess, sys, time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lyric_constellation import DATA, lyrics, read_json, write_json  # noqa: E402
from lyric_constellation.mood import AUDIO_FEATURES, density, mean_features, tokens, windows  # noqa: E402

HERE = Path(__file__).resolve().parent
FEATURES = HERE / "mood_features.json"
MODEL = HERE.parent / "lyric_constellation" / "mood_model.json"
SEARCH_GAP = 3.2   # seconds between iTunes searches: it allows about 20 a minute


def songs(name):
    out = []
    for line in (HERE / name).read_text("utf-8").splitlines():
        m = re.match(r"([EL])\s+(.+)", line.strip())
        if m:
            out.append((m[1] == "E", m[2].strip()))
    return out


# ---------- fetch ----------

def preview_audio(url):
    """A preview URL -> 16 kHz mono float32 samples, decoded by ffmpeg straight from the web into memory."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", url, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         capture_output=True, timeout=120, check=True).stdout
    return np.frombuffer(raw, np.float32)


def find_preview(artist, title, stem=None):
    """iTunes search -> preview URL. stem (held-out songs): one 'artist title' string, matched on the artist's words."""
    for country in ("US", "IN"):
        time.sleep(SEARCH_GAP)
        if stem is None:
            hit = lyrics.itunes_song(artist, title, country)
        else:
            res = lyrics.http_json("https://itunes.apple.com/search?" + lyrics.urllib.parse.urlencode(
                {"term": stem, "entity": "song", "limit": 5, "country": country}))["results"]
            hit = next((r for r in res if all(w in stem for w in lyrics.cache_key(r["artistName"], "").split()[:2])), None)
        if hit and hit.get("previewUrl"):
            return hit["previewUrl"], f"{hit['artistName']} - {hit['trackName']}"
    return None, None


def fetch():
    feats = read_json(FEATURES, {})
    lyrics.CACHE = HERE / ".cache"   # training lyrics never go into the user's cache
    todo = [("train", e, s) for e, s in songs("mood_songs.txt")] + [("test", e, s) for e, s in songs("mood_heldout.txt")]
    for i, (split, emotional, name) in enumerate(todo):
        if name in feats:
            continue
        rec = {"split": split, "emotional": emotional}
        try:
            if split == "train":
                artist, title = name.split(" - ", 1)
                ly = lyrics.fetch_lyrics(artist, title)
                url, found = find_preview(artist, title)
            else:   # the app's own cache, by file name; read only
                ly = read_json(DATA / "cache" / f"{name}.json")
                url, found = find_preview(None, None, stem=name)
            if ly and ly.get("lrc"):
                rec["tokens"], rec["density"] = sorted(tokens(ly["lrc"])), density(ly["lrc"])
            if url:
                rec["audio"], rec["itunes"] = mean_features(windows(preview_audio(url))), found
        except Exception as e:  # one bad song never stops the run
            rec["error"] = repr(e)[:200]
        feats[name] = rec
        write_json(FEATURES, feats)
        print(f"{i + 1:3}/{len(todo)} {'E' if emotional else 'L'} {name[:60]:<60} lyrics {'yes' if rec.get('tokens') else ' - '}"
              f"  sound {'yes' if rec.get('audio') else ' - '}  {rec.get('itunes') or rec.get('error', '')}", flush=True)


def relyrics():
    """Recompute the lyric features from the lyrics already fetched (no network): after changing tokens/density."""
    feats = read_json(FEATURES, {})
    for name, rec in feats.items():
        if rec["split"] == "train":
            artist, title = name.split(" - ", 1)
            ly = read_json(HERE / ".cache" / f"{lyrics.cache_key(artist, title)}.json")
        else:
            ly = read_json(DATA / "cache" / f"{name}.json")
        if ly and ly.get("lrc") and density(ly["lrc"]):
            rec["tokens"], rec["density"] = sorted(tokens(ly["lrc"])), density(ly["lrc"])
        else:
            rec.pop("tokens", None), rec.pop("density", None)
    write_json(FEATURES, feats)
    print(f"lyric features recomputed for {sum(1 for r in feats.values() if r.get('tokens'))} songs")


# ---------- train ----------

def fit(X, y, lam):
    """L2 logistic regression by Newton's method -> weights, the last one the bias (not penalized)."""
    Xb = np.hstack([X, np.ones((len(X), 1))])
    R = lam * np.eye(Xb.shape[1]); R[-1, -1] = 0
    w = np.zeros(Xb.shape[1])
    for _ in range(60):
        p = 1 / (1 + np.exp(-np.clip(Xb @ w, -30, 30)))
        step = np.linalg.solve((Xb.T * (p * (1 - p))) @ Xb + R + 1e-6 * np.eye(len(w)), Xb.T @ (p - y) + R @ w)
        w -= step
        if np.abs(step).max() < 1e-7:
            break
    return w


class Lyrics:
    """Words used (present or not) plus standardized lyric density."""
    def __init__(self, recs, lam, min_df=3):
        df = {}
        for r in recs:
            for t in r["tokens"]:
                df[t] = df.get(t, 0) + 1
        self.vocab = sorted(t for t, c in df.items() if c >= min_df)
        D = np.array([r["density"] for r in recs])
        self.mean, self.std = D.mean(0), D.std(0) + 1e-9
        self.w = fit(self.X(recs), np.array([r["emotional"] for r in recs], float), lam)

    def X(self, recs):
        idx = {t: i for i, t in enumerate(self.vocab)}
        B = np.zeros((len(recs), len(self.vocab)))
        for k, r in enumerate(recs):
            for t in r["tokens"]:
                if t in idx:
                    B[k, idx[t]] = 1
        return np.hstack([B, (np.array([r["density"] for r in recs]) - self.mean) / self.std])

    def logit(self, recs):
        return np.hstack([self.X(recs), np.ones((len(recs), 1))]) @ self.w

    def export(self):
        n = len(self.vocab)
        return {"vocab": {t: round(float(c), 4) for t, c in zip(self.vocab, self.w[:n]) if abs(c) > 1e-4},
                "w": self.w[n:].tolist()[:-1], "mean": self.mean.tolist(), "std": self.std.tolist(), "b": float(self.w[-1])}


class Sound:
    """The 8 sound features, standardized."""
    def __init__(self, recs, lam):
        A = np.array([r["audio"] for r in recs])
        self.mean, self.std = A.mean(0), A.std(0) + 1e-9
        self.w = fit((A - self.mean) / self.std, np.array([r["emotional"] for r in recs], float), lam)

    def logit(self, recs):
        return ((np.array([r["audio"] for r in recs]) - self.mean) / self.std) @ self.w[:-1] + self.w[-1]

    def export(self):
        return {"names": AUDIO_FEATURES, "w": self.w[:-1].tolist(), "mean": self.mean.tolist(), "std": self.std.tolist(),
                "b": float(self.w[-1])}


def folds(n, k=5, seed=7):
    order = np.random.default_rng(seed).permutation(n)
    return [order[i::k] for i in range(k)]


def cv(make, recs, lam, k=5):
    """Out-of-fold logits for every song."""
    z = np.zeros(len(recs))
    for test in folds(len(recs), k):
        keep = np.setdiff1d(np.arange(len(recs)), test)
        m = make([recs[i] for i in keep], lam)
        z[test] = m.logit([recs[i] for i in test])
    return z


def report(name, z, y):
    z, y = np.asarray(z, float), np.asarray(y, bool)
    if not len(y):
        print(f"  {name:<22} no songs")
        return None
    pred = z > 0
    acc = (pred == y).mean()
    tp, tn = (pred & y).sum(), (~pred & ~y).sum()
    print(f"  {name:<22} accuracy {acc:5.1%}   emotional caught {tp}/{y.sum()}   lively caught {tn}/{(~y).sum()}")
    return float(acc)


def train():
    feats = read_json(FEATURES, {})
    recs = [dict(r, name=n) for n, r in feats.items()]
    tr = [r for r in recs if r["split"] == "train"]
    te = [r for r in recs if r["split"] == "test"]
    trL = [r for r in tr if r.get("tokens") and r.get("density")]
    trA = [r for r in tr if r.get("audio")]
    print(f"training songs: {len(tr)} ({len(trL)} with lyrics, {len(trA)} with sound); held-out: {len(te)}")
    yL, yA = np.array([r["emotional"] for r in trL]), np.array([r["emotional"] for r in trA])
    nll = lambda z, y: float(np.mean(np.log1p(np.exp(-np.where(y, z, -z)))))   # pick the penalty by CV log loss
    lamL = min([1, 3, 10, 30, 100], key=lambda lam: nll(cv(Lyrics, trL, lam), yL))
    lamA = min([0.1, 0.3, 1, 3, 10], key=lambda lam: nll(cv(Sound, trA, lam), yA))
    print(f"penalty: lyrics {lamL}, sound {lamA}\n5-fold cross-validation on the training songs:")
    zL, zA = cv(Lyrics, trL, lamL), cv(Sound, trA, lamA)
    m = {"lyrics_cv": report("lyrics only", zL, yL), "sound_cv": report("sound only", zA, yA)}
    # fusion, on out-of-fold logits of the songs that have both
    both = [r["name"] for r in trL if r.get("audio")]
    oL, oA = dict(zip([r["name"] for r in trL], zL)), dict(zip([r["name"] for r in trA], zA))
    Zf = np.array([[oL[n], oA[n]] for n in both])
    yF = np.array([feats[n]["emotional"] for n in both])
    wf = fit(Zf, yF.astype(float), 0.1)
    zF = np.zeros(len(both))
    for test in folds(len(both)):
        keep = np.setdiff1d(np.arange(len(both)), test)
        w = fit(Zf[keep], yF[keep].astype(float), 0.1)
        zF[test] = Zf[test] @ w[:2] + w[2]
    m["fused_cv"] = report("lyrics + sound", zF, yF)
    L, A = Lyrics(trL, lamL), Sound(trA, lamA)
    model = {"lyrics": L.export(), "audio": A.export(), "fuse": {"wl": float(wf[0]), "wa": float(wf[1]), "b": float(wf[2])}}

    print("held-out test (the app's own cached songs, never trained on):")
    wrong = []
    ys, zs, how = [], [], []
    for r in te:
        zl = L.logit([r])[0] if r.get("tokens") and r.get("density") else None
        za = A.logit([r])[0] if r.get("audio") else None
        if zl is None and za is None:
            continue
        z = zl if za is None else za if zl is None else wf[0] * zl + wf[1] * za + wf[2]
        ys.append(r["emotional"]); zs.append(z); how.append((zl, za))
        if (z > 0) != r["emotional"]:
            wrong.append(f"    {'E' if r['emotional'] else 'L'} {r['name']}: calm {1 / (1 + np.exp(-z)):.2f}")
    ys, zs = np.array(ys, bool), np.array(zs, float)
    m["heldout"] = report("lyrics + sound", zs, ys)
    hl = [(z, y) for (z, _), y in zip(how, ys) if z is not None]
    ha = [(z, y) for (_, z), y in zip(how, ys) if z is not None]
    m["heldout_lyrics"] = report("lyrics only", np.array([z for z, _ in hl]), np.array([y for _, y in hl]))
    m["heldout_sound"] = report("sound only", np.array([z for z, _ in ha]), np.array([y for _, y in ha]))
    print("  wrong:\n" + ("\n".join(wrong) or "    none"))
    top = sorted(model["lyrics"]["vocab"].items(), key=lambda kv: kv[1])
    print("  most emotional words:", ", ".join(t for t, _ in top[::-1][:25]))
    print("  most lively words:   ", ", ".join(t for t, _ in top[:25]))
    print("  sound weights:", ", ".join(f"{n} {w:+.2f}" for n, w in zip(AUDIO_FEATURES, A.w)))
    model["trained"] = {"songs": len(tr), "with_lyrics": len(trL), "with_sound": len(trA), "heldout": int(len(ys)),
                        **{k: round(v, 3) for k, v in m.items() if v is not None}}
    MODEL.write_text(json.dumps(model, ensure_ascii=False, separators=(",", ":")), "utf-8")
    print(f"wrote {MODEL} ({MODEL.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    {"fetch": fetch, "relyrics": relyrics, "train": train}[sys.argv[1] if len(sys.argv) > 1 else "train"]()
