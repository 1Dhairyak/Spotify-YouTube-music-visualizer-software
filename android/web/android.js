// Lyric Constellation on Android: stands in for app.py behind the same ui/index.html (Constellation only).
// It reads what the phone is playing from the native `Media` bridge (Android media sessions), fetches synced lyrics
// from LRCLIB and art from iTunes, and answers the page's pywebview.api calls. The lyric helpers are ports of
// lyric_constellation/lyrics.py (parse_lrc, word_times, clean); keep them in step with it.
window.MOBILE_APP = true;   // index.html: Constellation only, the notch shows just the colors
(() => {   // own scope: index.html has its own api, track, clock and rev

const LINE_TAG = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
const WORD_TAG = /<(\d+):(\d+(?:\.\d+)?)>\s*([^<]*)/g;
const WORD_PACE = 0.07;
const JUNK = /[(\[][^)\]]*\b(official|lyrics?|video|audio|visuali[sz]er|hd|4k|mv|remaster(ed)?)\b[^)\]]*[)\]]/gi;
const VERSION = /\b(acoustic|live|remix|remaster(ed)?|version|edit|mix|unplugged|lo-?fi|slowed|reverb|sped up|instrumental|reprise|cover)\b/i;
const FEAT = /\s*[(\[]?\s*\b(ft|feat|featuring)\b\.?[^)\]]*[)\]]?/gi;
const VIDEO_APPS = /youtube(?!\.music)|chrome|firefox|browser|opera|brave|edge/i;   // titles are "Artist - Song"
const IDLE = 'Play something on Spotify, YouTube Music or YouTube';

function parseLrc(text) {   // LRC text -> sorted [[seconds, line]]; a line may carry several [mm:ss] tags
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const body = raw.replace(LINE_TAG, '').trim();
    for (const [, m, s] of raw.matchAll(LINE_TAG)) out.push([+m * 60 + +s, body]);
  }
  return out.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
}

function wordTimes(lines) {   // [[seconds, line]] -> [{t, w, end?}]; words inside a line spread by length
  const words = [], r3 = x => Math.round(x * 1000) / 1000;
  lines.forEach(([t, body], i) => {
    const tagged = [...body.matchAll(WORD_TAG)].filter(([, , , w]) => w.trim());
    let line;
    if (tagged.length) line = tagged.map(([, m, s, w]) => ({ t: +m * 60 + +s, w: w.trim() }));
    else {
      const ws = body.split(/\s+/).filter(Boolean), gap = i + 1 < lines.length ? lines[i + 1][0] - t : 4;
      const weights = ws.map(w => w.length + 2), sum = weights.reduce((a, b) => a + b, 0);
      const span = Math.min(gap * 0.9, sum * WORD_PACE);
      let acc = 0;
      line = ws.map((w, k) => { const at = r3(t + span * acc / sum); acc += weights[k]; return { t: at, w }; });
    }
    if (line.length) line[line.length - 1].end = true;
    words.push(...line);
  });
  return words;
}

function clean(title, artist, video) {   // player-reported title/artist -> [artist, title] fit for a lyrics lookup
  title = (title || '').replace(/–|—/g, '-').replace(JUNK, '').split('|')[0];
  artist = (artist || '').replace(/\s*-\s*Topic$|VEVO$/, '').trim();
  const cut = title.indexOf(' - ');
  if (cut >= 0) {
    const left = title.slice(0, cut), right = title.slice(cut + 3);
    if (video && !VERSION.test(right)) { artist = left; title = right; } else title = left;
  }
  artist = artist.replace(FEAT, '').split(/,|&|;| x | feat\.? | ft\.? /i)[0];
  return [artist.trim(), title.replace(FEAT, '').replace(/^[\s-]+|[\s-]+$/g, '')];
}

const getJson = async url => { const r = await fetch(url); if (r.status === 404) return null; if (!r.ok) throw new Error(r.status); return r.json(); };
const store = { get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
                set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } } };

async function fetchLyrics(artist, title, dur) {   // synced lyrics from the cache or LRCLIB, or null
  const key = 'lrc:' + `${artist} ${title}`.toLowerCase().replace(/[\W_]+/g, ' ').trim(), cached = store.get(key);
  if (cached && !(dur && Math.abs((cached.duration || 0) - dur) > 3)) return cached;
  const q = new URLSearchParams({ artist_name: artist, track_name: title });
  if (dur) q.set('duration', Math.round(dur));
  try {
    let hit = await getJson('https://lrclib.net/api/get?' + q);
    if (!(hit && hit.syncedLyrics)) {
      const found = ((await getJson('https://lrclib.net/api/search?' + new URLSearchParams({ q: `${artist} ${title}` }))) || [])
        .filter(r => r.syncedLyrics);
      if (dur) found.sort((a, b) => Math.abs((a.duration || 0) - dur) - Math.abs((b.duration || 0) - dur));
      hit = found[0];
    }
    if (!hit) return cached;
    const data = { artist: hit.artistName, title: hit.trackName, lrc: hit.syncedLyrics, duration: hit.duration };
    store.set(key, data);
    return data;
  } catch { return cached; }   // offline: an off-version copy still beats no lyrics
}

async function coverUrl(artist, title) {   // 1200 px art from iTunes, only from the same artist
  try {
    const res = (await getJson('https://itunes.apple.com/search?' + new URLSearchParams({ term: `${artist} ${title}`, entity: 'song', limit: 5 }))).results;
    const a = artist.toLowerCase(), hit = res.find(r => a && (r.artistName.toLowerCase().includes(a) || a.includes(r.artistName.toLowerCase())));
    return hit ? hit.artworkUrl100.replace('100x100', '1200x1200') : null;
  } catch { return null; }
}

// ---------- what the page asks for (pywebview.api) ----------
const cfg = Object.assign({ color: -1, style: 0 }, store.get('cfg'));
let rev = 0, tid = 0, key = null, status = IDLE, track = { id: 0, title: '', artist: '', art: null, words: [] };
let clock = { pos: 0, at: Date.now(), playing: false };   // for players that report no position

function publish(t, st) { track = { id: tid, ...t }; status = st; rev++; }

async function load(m, id) {
  const [artist, title] = clean(m.title, m.artist, VIDEO_APPS.test(m.app));
  publish({ title, artist, art: null, words: [] }, 'Finding lyrics…');
  const lyrics = title ? await fetchLyrics(artist, title, m.dur) : null;
  const art = (title && await coverUrl(artist, m.title.replace(JUNK, ''))) || Media.art() || null;
  if (id !== tid) return;   // the song changed meanwhile
  if (lyrics) publish({ title: lyrics.title, artist: lyrics.artist, art, words: wordTimes(parseLrc(lyrics.lrc)) }, '');
  else publish({ title, artist, art, words: [] }, 'No synced lyrics found for this song');
}

const api = {
  async state() {
    const m = JSON.parse(Media.state());
    if (!m.granted) { status = 'Allow notification access so the app can see what is playing'; }
    else if (!m.title) {
      if (key) { key = null; tid++; publish({ title: '', artist: '', art: null, words: [] }, IDLE); }
    } else {
      const k = `${m.app}|${m.title}|${m.artist}`;
      if (k !== key) { key = k; tid++; clock = { pos: 0, at: Date.now(), playing: m.playing }; load(m, tid); }
    }
    if (m.pos >= 0) clock = { pos: m.pos, at: Date.now(), playing: m.playing };
    else clock = { pos: clock.pos + (clock.playing ? (Date.now() - clock.at) / 1000 : 0), at: Date.now(), playing: m.playing };
    return { rev, pos: clock.pos, playing: !!m.playing, status, dual: false, stars_on: 0, style: cfg.style,
             look: 0, lock: 0, color: cfg.color };
  },
  async track() { return track; },
  async set_color(i) { cfg.color = +i; store.set('cfg', cfg); },
  async set_style(i) { cfg.style = +i; store.set('cfg', cfg); },
  async set_lock() {}, async next_look() {}, async fullscreen() {},
  async play_pause() { Media.playPause(); },
  async toggle_dual() { return 'One screen'; }, async swap() { return ''; },
};
window.pywebview = { api };
addEventListener('load', () => dispatchEvent(new Event('pywebviewready')));
})();
