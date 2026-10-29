// Look 1: Constellation. Yellow stars and lines from the original reference video, with 6 sub-styles that
// rotate every 30 s, 15 colors that rotate every 20 s, and a light circling the screen edge.

// The whole scene moves to the next color every COLOR_EVERY seconds of the song, starting on the video's yellow.
const PALETTE = ['#E8D44D', '#FFB020', '#FF7A3D', '#FF5E62', '#FF3B4E', '#FF4FA3', '#E056FD', '#9D7BFF',
                 '#4D7CFF', '#3FB8FF', '#22E1E8', '#2EE6B6', '#3EE07A', '#B6F03C', '#C8956B'];
const COLOR_EVERY = 20;  // seconds per color
const COLOR_FADE = 2;    // seconds to blend into the next one
let ACCENT = PALETTE[0];
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function accent() {
  const t = Math.max(0, songTime()), i = Math.floor(t / COLOR_EVERY), n = PALETTE.length;
  const from = rgb(PALETTE[(i - 1 + n) % n]), to = rgb(PALETTE[i % n]);
  const f = i ? Math.min(1, (t - i * COLOR_EVERY) / COLOR_FADE) : 1;
  return `rgb(${to.map((v, k) => Math.round(from[k] + (v - from[k]) * f)).join(',')})`;
}
const SCENE = 13;      // words in a constellation before it clears (at the next line end)
const SCENE_MAX = 18;  // ...or clears anyway at this many
const HOLD = 2.0;      // seconds a line-end word stays big
const SHRINK = 0.6;    // seconds it takes to shrink
const CLEAR = 0.8;     // seconds a finished constellation takes to fade out
const SMALL = 15;      // px, small labels
const LAP = 4;         // seconds per loop of the border light
const TAIL = 0.3;      // tail length, as a share of the border

let nodes = [], links = [], shown = -1;   // shown = index of the last word placed
const big = () => clamp(innerWidth * 0.055, 44, 96);

let style = 0, tris = [], shards = [], waveScroll = 0;   // style = index into STYLES (bottom of this file)
function clearScene() { nodes = []; links = []; tris = []; shards = []; }
function reset() { clearScene(); shown = -1; }
const center = () => ({ x: W / 2, y: TOP + (H - TOP) * 0.55 });

// A new word joins the current scene, or starts a fresh one when it's full.
function place(wd) {
  let scene = nodes.filter(n => !n.dying);
  let prev = scene[scene.length - 1];
  if (scene.length >= SCENE_MAX || (scene.length >= SCENE && prev.end)) {
    scene.forEach(n => n.dying = now());
    scene = []; prev = undefined;
  }
  const st = STYLES[style];
  const n = Object.assign({ w: wd.w, end: !!wd.end, born: now(), seed: rand(0, 6.28), dying: 0 },
                          (st.place || wanderPlace)(scene, prev));
  (st.link || constellationLink)(scene, prev, n);
  nodes.push(n);
  if (st.onAdd) st.onAdd(n);
}

// Best-candidate in a wide horizontal band, drifting left to right like the video.
function wanderPlace(scene, prev) {
  const x0 = W * 0.08, x1 = W * 0.92, y0 = TOP + (H - TOP) * 0.3, y1 = TOP + (H - TOP) * 0.8;
  const R = W * 0.12;
  const dir = prev && prev.x > W * 0.72 ? [-1, 0.3] : [-0.3, 1];   // turn back before piling up on the right
  let best, bestScore = -1;
  for (let k = 0; k < 16; k++) {
    const c = prev
      ? { x: clamp(prev.x + rand(...dir) * R, x0, x1), y: clamp(prev.y + rand(-1, 1) * R * 0.7, y0, y1) }
      : { x: rand(x0, x0 + (x1 - x0) * 0.35), y: rand(y0, y1) };
    const score = scene.length ? Math.min(...scene.map(n => dist(n, c))) : 1;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

function chainLink(scene, prev, n) { if (prev) links.push([prev, n]); }
function constellationLink(scene, prev, n) {
  chainLink(scene, prev, n);
  const near = scene.filter(m => m !== prev && dist(m, n) < W * 0.25).sort((a, b) => dist(a, n) - dist(b, n))[0];
  if (near && Math.random() < 0.25) links.push([near, n]);
}

// Bring the constellation up to the word being sung right now.
function step() {
  const ws = track.words, t = songTime();
  let target = -1;
  for (let lo = 0, hi = ws.length - 1; lo <= hi;) {        // last word with ws[i].t <= t
    const mid = (lo + hi) >> 1;
    if (ws[mid].t <= t) { target = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (target < shown - 2) reset();                       // seeked backwards (ignore tiny jitter)
  if (target - shown > SCENE) { reset(); shown = target - SCENE; } // seeked far forwards
  while (shown < target) place(ws[++shown]);
}

function star(x, y, r) {   // 4-point sparkle
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

function tri(x, y, q, rot = 0) {   // triangle path (pointing up at rot = 0); caller fills or strokes
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const t = rot - Math.PI / 2 + k * 2.0944;
    ctx[k ? 'lineTo' : 'moveTo'](x + Math.cos(t) * q, y + Math.sin(t) * q);
  }
  ctx.closePath();
}

function line(a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

// Node markers: (x, y, radius, is it the current word, its alpha)
function sparkle(x, y, r, isCur, a) {
  star(x, y, r);
  if (isCur) {   // outlined diamond halo
    ctx.globalAlpha = a * 0.45;
    const q = r * 1.8;
    ctx.beginPath(); ctx.moveTo(x, y - q); ctx.lineTo(x + q, y);
    ctx.lineTo(x, y + q); ctx.lineTo(x - q, y); ctx.closePath(); ctx.stroke();
  }
}
function triMarker(x, y, r, isCur, a) {
  tri(x, y, r * 1.1);
  if (!isCur) return ctx.fill();
  ctx.stroke();
  tri(x, y, r * 0.45); ctx.fill();
}

// Point at distance d (wrapping) along the screen edge, clockwise from the top-left corner.
function edge(d) {
  const i = 3, w = W - 2 * i, h = H - 2 * i, P = 2 * (w + h);
  d = ((d % P) + P) % P;
  if (d < w) return [i + d, i];
  if ((d -= w) < h) return [i + w, i + d];
  if ((d -= h) < w) return [i + w - d, i + h];
  return [i, i + h - (d - w)];
}

function border(T) {
  const P = 2 * (W + H - 12), head = (T / LAP % 1) * P, N = 60;
  ctx.strokeStyle = ctx.fillStyle = ACCENT;
  ctx.shadowColor = ACCENT;
  ctx.globalAlpha = 0.35; ctx.lineWidth = 3; ctx.shadowBlur = 22;   // static glow on the whole edge
  ctx.strokeRect(3, 3, W - 6, H - 6);
  ctx.shadowBlur = 0;
  for (let k = 0; k < N; k++) {                                       // fading tail
    const a = edge(head - TAIL * P * (1 - k / N)), b = edge(head - TAIL * P * (1 - (k + 1) / N));
    const f = (k + 1) / N;
    ctx.globalAlpha = f * f * 0.9; ctx.lineWidth = 2 + f * 2;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  const [hx, hy] = edge(head);                                        // bright head
  ctx.globalAlpha = 1; ctx.shadowBlur = 25;
  ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, 6.29); ctx.fill();
  ctx.shadowBlur = 0;
}

function draw(T) {
  ACCENT = accent();
  setAccent(ACCENT);
  border(T);

  nodes = nodes.filter(n => !n.dying || T - n.dying < CLEAR);
  const alive = new Set(nodes);
  links = links.filter(([a, b]) => alive.has(a) && alive.has(b));
  tris = tris.filter(t => t.every(m => alive.has(m)));
  const alpha = n => sceneFade * (n.dying ? 1 - (T - n.dying) / CLEAR : 1) * clamp((T - n.born) / 0.2, 0, 1);
  const cur = nodes[nodes.length - 1];
  const st = STYLES[style];
  if (st.tick) st.tick(T);
  nodes.forEach((n, k) => n.p = st.pos ? st.pos(n, T, nodes[k + 1]) : n);   // where each word is drawn now
  const P = n => n.p;

  ctx.save();
  ctx.translate(Math.sin(T * 0.13) * 8, Math.cos(T * 0.11) * 5);   // slow drift
  ctx.fillStyle = ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1;
  if (st.under) { st.under(T, alpha, P); ctx.fillStyle = ctx.strokeStyle = ACCENT; ctx.lineWidth = 1; ctx.shadowBlur = 0; }
  for (const [a, b] of links) {
    ctx.globalAlpha = 0.28 * Math.min(alpha(a), alpha(b));
    line(P(a), P(b));
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  nodes.forEach((n, k) => {
    const a = alpha(n), p = n.p;
    const isCur = n === cur && !n.dying;
    const next = nodes[k + 1];
    // Line-end words are big for HOLD seconds (or until the next big word), then shrink; others are small.
    let s = 1;
    if (n.end) {
      const nextBig = nodes.slice(k + 1).find(m => m.end);
      s = easeOut((T - Math.min(n.born + HOLD, nextBig ? nextBig.born : Infinity)) / SHRINK);
    }
    // Star: big with a halo while current, small afterwards.
    const settle = next ? easeOut((T - next.born) / 0.4) : 0;
    const r = (8 + (3 - 8) * settle) * backOut((T - n.born) / 0.35);
    ctx.globalAlpha = a * (isCur ? 1 : 0.75 + 0.25 * Math.sin(T * 2 + n.seed));
    if (isCur) { ctx.shadowColor = ACCENT; ctx.shadowBlur = 16; }
    (st.marker || sparkle)(p.x, p.y, r, isCur, a);
    ctx.shadowBlur = 0;

    // Label above the star.
    const grow = 0.85 + 0.15 * easeOut((T - n.born) / 0.25);
    const size = (big() + (SMALL - big()) * s) * (n.end ? grow : 1);
    ctx.font = `${s < 0.5 ? 600 : 500} ${size}px "Segoe UI Variable Display", "Segoe UI", sans-serif`;
    ctx.letterSpacing = s < 0.5 ? '-0.01em' : '0px';
    const half = ctx.measureText(n.w).width / 2;
    if (s < 0.5) { ctx.shadowColor = ACCENT; ctx.shadowBlur = 18 * (1 - s); }
    ctx.globalAlpha = a * (1 - (isCur ? 0.1 : 0.4) * s);
    ctx.fillText(n.w, clamp(p.x, half + 24, W - half - 24), p.y - r - 6);
    ctx.shadowBlur = 0;
  });
  ctx.letterSpacing = '0px';
  ctx.restore();
}

// ---------- styles (T or 1-6 to switch; delete an entry to drop a style) ----------

// Low-poly mesh: link to the 2 nearest stars and tint each triangle.
function meshLink(scene, prev, n) {
  const [a, b] = scene.slice().sort((p, q) => dist(p, n) - dist(q, n));
  if (a) links.push([a, n]);
  if (b) { links.push([b, n]); tris.push([a, b, n]); }
}
function meshUnder(T, alpha, P) {
  for (const t of tris) {
    ctx.globalAlpha = 0.08 * Math.min(...t.map(alpha));
    const [p, q, r] = t.map(P);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.lineTo(r.x, r.y); ctx.closePath(); ctx.fill();
  }
}

// Prism: the current word sits in a slowly turning triangle; earlier words gather at its corners.
const prismR = () => Math.min(W * 0.5, H - TOP) * 0.36;
function prismCorner(k, T) {
  const c = center(), t = T * 0.12 - Math.PI / 2 + k * 2.0944;
  return { x: c.x + Math.cos(t) * prismR(), y: c.y + Math.sin(t) * prismR() };
}
function prismPlace(scene) {
  const k = scene.length % 3, R = prismR();
  const mates = scene.filter(m => m.k === k);
  let best, bestScore = -1;
  for (let i = 0; i < 12; i++) {   // spread words around the same corner
    const t = rand(0, 6.28), d = rand(0.18, 0.55) * R, c = { x: Math.cos(t) * d, y: Math.sin(t) * d * 0.7 };
    const score = mates.length ? Math.min(...mates.map(m => Math.hypot(m.ox - c.x, m.oy - c.y))) : 1;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return { x: 0, y: 0, k, ox: best.x, oy: best.y };
}
function prismPos(n, T, next) {
  const c = center(), q = prismCorner(n.k, T), f = next ? easeOut((T - next.born) / 0.8) : 0;
  return { x: c.x + (q.x + n.ox - c.x) * f, y: c.y + (q.y + n.oy - c.y) * f };   // flies out of the center
}
function prismBurst(n) {
  if (!n.end) return;
  const c = center();
  for (let i = 0; i < 12; i++) {
    const t = rand(0, 6.28), v = rand(80, 260);
    shards.push({ x: c.x, y: c.y, vx: Math.cos(t) * v, vy: Math.sin(t) * v, q: rand(5, 14),
                  rot: rand(0, 6.28), spin: rand(-2, 2), born: now() });
  }
}
function prismUnder(T, alpha, P) {
  const c = center();
  ctx.globalAlpha = 0.5 * sceneFade; ctx.lineWidth = 1.5; ctx.shadowColor = ACCENT; ctx.shadowBlur = 14;
  tri(c.x, c.y, prismR(), T * 0.12); ctx.stroke();
  ctx.shadowBlur = 0; ctx.lineWidth = 1;
  for (const n of nodes) { ctx.globalAlpha = 0.22 * alpha(n); line(P(n), prismCorner(n.k, T)); }
  shards = shards.filter(s => T - s.born < 1.4);
  for (const s of shards) {
    const age = T - s.born;
    ctx.globalAlpha = sceneFade * 0.8 * (1 - age / 1.4);
    tri(s.x + s.vx * age, s.y + s.vy * age, s.q, s.rot + age * s.spin); ctx.stroke();
  }
}

// Orbit: words ride 3 slowly turning rings; spokes to the center make triangles between rings.
const RINGS = [0.17, 0.29, 0.41], SPIN = [0.06, -0.04, 0.025];
function orbitXY(ring, ang) {
  const c = center(), r = (H - TOP) * RINGS[ring];
  return { x: c.x + Math.cos(ang) * r * 1.8, y: c.y + Math.sin(ang) * r };
}
function orbitPlace(scene) {
  const ring = scene.length % 3, mates = scene.filter(m => m.ring === ring);
  let best = 0, bestScore = -1;
  for (let i = 0; i < 12; i++) {
    const a = rand(0, 6.28);
    const score = mates.length ? Math.min(...mates.map(m => Math.abs(Math.atan2(Math.sin(a - m.ang), Math.cos(a - m.ang))))) : 1;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return { x: 0, y: 0, ring, ang: best };
}
function orbitPos(n, T) { return orbitXY(n.ring, n.ang + T * SPIN[n.ring]); }
function orbitUnder(T, alpha, P) {
  const c = center();
  ctx.globalAlpha = 0.08 * sceneFade;
  for (const k of RINGS) {
    const r = (H - TOP) * k;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, r * 1.8, r, 0, 0, 6.29); ctx.stroke();
  }
  for (const n of nodes) { ctx.globalAlpha = 0.12 * alpha(n); line(c, P(n)); }
  ctx.globalAlpha = 0.6 * sceneFade; star(c.x, c.y, 5);
}

// Wave: words flow along a sine wave with triangle markers; the line scrolls left as the song goes on.
function wavePlace(scene) {
  const i = scene.length;
  return { x: 0, y: 0, wx: i * W * 0.085, wy: Math.sin(i * 0.8) * (H - TOP) * 0.14 };
}
function waveTick() {
  const cur = nodes.filter(n => !n.dying).pop();
  waveScroll += ((cur ? cur.wx : 0) - W * 0.62 - waveScroll) * 0.04;
}
function wavePos(n, T) {
  return { x: n.wx - waveScroll, y: center().y + n.wy + Math.sin(T * 1.3 + n.wx * 0.012) * 5 };
}

// Shatter grid: words snap to a hidden triangle grid and light up the triangles around them for a while.
const gridG = () => W * 0.065;
function gridOrigin() { return TOP + (H - TOP) * 0.3; }
function gridPlace(scene, prev) {
  const g = gridG(), h = g * 0.866, p = wanderPlace(scene, prev);
  const row = Math.round((p.y - gridOrigin()) / h), off = (row & 1) * g / 2;
  return { x: Math.round((p.x - off) / g) * g + off, y: gridOrigin() + row * h };
}
function gridUnder(T, alpha, P) {
  const g = gridG(), h = g * 0.866, y0 = gridOrigin();
  ctx.globalAlpha = 0.1 * sceneFade;   // faint lattice dots
  for (let row = -1; y0 + row * h < H - 20; row++)
    for (let x = (row & 1) * g / 2; x < W; x += g) ctx.fillRect(x - 1, y0 + row * h - 1, 2, 2);
  for (const n of nodes) {   // lit hexagon of 6 triangles around each word, fading with age
    const life = Math.exp(-(T - n.born) / 3) * alpha(n), p = P(n);
    const ring = [0, 1, 2, 3, 4, 5].map(k => ({ x: p.x + Math.cos(k * 1.0472) * g, y: p.y + Math.sin(k * 1.0472) * g }));
    ctx.globalAlpha = 0.05 * life;
    ctx.beginPath(); ring.forEach((q, k) => ctx[k ? 'lineTo' : 'moveTo'](q.x, q.y)); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.35 * life;
    ring.forEach((q, k) => { line(p, q); line(q, ring[(k + 1) % 6]); });
  }
}

const STYLES = [
  { name: 'Constellation' },
  { name: 'Low-poly mesh', link: meshLink, under: meshUnder },
  { name: 'Prism', place: prismPlace, link: () => {}, pos: prismPos, under: prismUnder, onAdd: prismBurst },
  { name: 'Orbit', place: orbitPlace, link: chainLink, pos: orbitPos, under: orbitUnder },
  { name: 'Wave', place: wavePlace, link: chainLink, pos: wavePos, tick: waveTick, marker: triMarker },
  { name: 'Shatter grid', place: gridPlace, link: chainLink, under: gridUnder },
];

// Styles take turns every STYLE_EVERY seconds of the song; T / 1-6 shift where the rotation is.
const STYLE_EVERY = 30;
let styleBase = 0, savedStyle = null;
const styleSlot = () => Math.floor(Math.max(0, songTime()) / STYLE_EVERY);

function setStyle(i) {
  i = ((i % STYLES.length) + STYLES.length) % STYLES.length;
  if (i !== style) { snapshot(); style = i; clearScene(); }
  return STYLES[i].name;
}

LOOKS.push({
  id: 'constellation',
  name: 'Constellation',
  reset,
  pre(T) { setStyle(styleBase + styleSlot()); },
  frame(T) { step(); draw(T); },
  poll(s) { if (s.style !== savedStyle) styleBase = savedStyle = s.style; },   // startup, or set on the other screen
  key(e) {
    const pick = e.key === 't' || e.key === 'T' ? style + 1 : '123456789'.indexOf(e.key);
    if (pick < 0 || (pick >= STYLES.length && e.key.toLowerCase() !== 't')) return false;
    const n = STYLES.length;
    styleBase = ((pick - styleSlot()) % n + n) % n;   // show the picked style now, then keep rotating
    setStyle(pick);
    toast(`Style ${style + 1}: ${STYLES[style].name}`);
    api.set_style(savedStyle = styleBase);
    return true;
  },
});
