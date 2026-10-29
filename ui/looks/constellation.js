// Look 1: Constellation. Yellow stars and lines from the original reference video, with 6 sub-styles that
// rotate every 30 s, 15 colors that rotate every 20 s, and a light circling the screen edge.

// The whole scene moves to the next color every COLOR_EVERY seconds of the song, starting on the video's yellow.
const PALETTE = ['#E8D44D', '#FFB020', '#FF7A3D', '#FF5E62', '#FF3B4E', '#FF4FA3', '#E056FD', '#9D7BFF',
                 '#4D7CFF', '#3FB8FF', '#22E1E8', '#2EE6B6', '#3EE07A', '#B6F03C', '#C8956B'];
const COLOR_EVERY = 20;  // seconds per color
const COLOR_FADE = 2;    // seconds to blend into the next one
let ACCENT = PALETTE[0];
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
// A color picked in the notch holds (-1 = cycle); switching blends from the color on screen over a second.
let colorPick = -1, pickFrom = null, pickAt = -9, shownRGB = rgb(PALETTE[0]);
function accent() {
  const t = Math.max(0, songTime()), i = Math.floor(t / COLOR_EVERY), n = PALETTE.length;
  const from = rgb(PALETTE[(i - 1 + n) % n]), to = rgb(PALETTE[i % n]);
  const f = i ? Math.min(1, (t - i * COLOR_EVERY) / COLOR_FADE) : 1;
  let c = colorPick >= 0 ? rgb(PALETTE[colorPick]) : to.map((v, k) => from[k] + (v - from[k]) * f);
  const p = easeInOut(Math.min(1, (sceneT - pickAt) / 1));
  if (pickFrom && p < 1) c = c.map((v, k) => pickFrom[k] + (v - pickFrom[k]) * p);
  shownRGB = c;
  return `rgb(${c.map(Math.round).join(',')})`;
}
const SCENE = 13;      // words in a constellation before it clears (at the next line end)
const SCENE_MAX = 18;  // ...or clears anyway at this many
const HOLD = 2.0;      // seconds a line-end word stays big
const SHRINK = 0.6;    // seconds it takes to shrink
const CLEAR = 0.8;     // seconds a finished constellation takes to fade out
const SMALL = 15;      // px, small labels
const LAP = 6;         // seconds per loop of the border light
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
    scene.forEach(n => n.dying = sceneT);
    scene = []; prev = undefined;
  }
  const st = STYLES[style];
  const n = Object.assign({ w: wd.w, end: !!wd.end, born: sceneT, seed: rand(0, 6.28), dying: 0 },
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
// The border light, like the reference: a soft wide glow around the whole screen with rounded corners, and a
// glassy comet (bright core inside a wide translucent band) gliding round it, flaring as it rounds each corner.
// ---------- the border light ----------
// A rounded rectangle round the screen that dips around the notch while it shows (and round the open panel while
// it's hovered). The light travels along the plain rectangle and is mapped onto the dip, so the notch appearing,
// opening or hiding never makes it jump. Near the mouse the edge brightens and ripples, then settles.
let touch = 0, cometNearNotch = false;
let headB = 0, headV = 0;   // the light's head: position on the plain rectangle (px) and current speed (px/s)
const ripples = [];         // fast mouse moves send a wave along the edge: { b: where (px on the rectangle), t: when, amp }
let rippleAt = -9;
function updateTouch(T) {   // eased 0..1: how strongly the edge reacts to the mouse right now
  const edge = !mouse.inside || mouse.x < 0 ? 1e9 : Math.min(mouse.x, mouse.y, W - mouse.x, H - mouse.y);
  const near = clamp(1 - edge / 220, 0, 1);
  const moving = now() - mouse.at < 0.25 ? 0.45 + 0.55 * Math.min(1, mouse.speed / 1200) : 0.25;
  const target = near * moving;
  touch += (target - touch) * (1 - Math.exp(-dt * (target > touch ? 7 : 2.5)));   // quick to wake, slow to settle
  if (touch < 0.0005) touch = 0;
}
function frameRect(T) {
  const i = 4, r = clamp(Math.min(W, H) * 0.03, 14, 36), pts = [], marks = [], PI = Math.PI;
  const to = (x, y) => {   // straight run, in short steps so the ripple can bend it
    const [px, py] = pts[pts.length - 1], n = Math.ceil(Math.hypot(x - px, y - py) / 24);
    for (let k = 1; k <= n; k++) pts.push([px + (x - px) * k / n, py + (y - py) * k / n]);
  };
  const arc = (cx, cy, R, a0, a1, mark) => {
    to(cx + R * Math.cos(a0), cy + R * Math.sin(a0));
    for (let k = 1; k <= 14; k++) {
      const a = a0 + (a1 - a0) * k / 14;
      if (mark && k === 7) marks.push(pts.length);   // flare point: halfway round this corner
      pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
  };
  const nb = notchShape(), g = 4, f = 8;   // g: gap kept from the notch, f: the curve where the top edge turns down
  let dip = null;
  pts.push([i + r, i]);
  if (nb && nb.y1 - nb.rb > i + f) {
    to(nb.x0 - g - f, i);
    const k0 = pts.length - 1;
    arc(nb.x0 - g - f, i + f, f, -PI / 2, 0);
    arc(nb.x0 + nb.rb, nb.y1 - nb.rb, nb.rb + g, PI, PI / 2, true);
    arc(nb.x1 - nb.rb, nb.y1 - nb.rb, nb.rb + g, PI / 2, 0, true);
    arc(nb.x1 + g + f, i + f, f, PI, 1.5 * PI);
    dip = { k0, k1: pts.length - 1, bs: nb.x0 - g - f - (i + r), be: nb.x1 + g + f - (i + r) };
  }
  arc(W - i - r, i + r, r, -PI / 2, 0, true);
  arc(W - i - r, H - i - r, r, 0, PI / 2, true);
  arc(i + r, H - i - r, r, PI / 2, PI, true);
  arc(i + r, i + r, r, PI, 1.5 * PI, true);
  const L = [0];
  for (let k = 1; k < pts.length; k++) L.push(L[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const F = { pts, L, P: L[L.length - 1], dip };
  if (dip) Object.assign(dip, { ds: L[dip.k0], de: L[dip.k1] });
  F.Pb = F.P - (dip ? (dip.de - dip.ds) - (dip.be - dip.bs) : 0);   // the plain rectangle's length: the light's track
  F.corners = marks.map(k => toBase(F, L[k]));
  for (let k = ripples.length - 1; k >= 0; k--) if (T - ripples[k].t > 1.2) ripples.splice(k, 1);
  if (ripples.length) {   // waves running both ways along the edge from where the mouse swept past
    const cx = W / 2, cy = H / 2;
    pts.forEach((q, k) => {
      const bk = toBase(F, L[k]);
      let push = 0;
      for (const rp of ripples) {
        const age = T - rp.t, front = 900 * age, life = 1 - age / 1.2;
        const dd = Math.abs((((bk - rp.b) % F.Pb) + F.Pb * 1.5) % F.Pb - F.Pb / 2);   // distance along the edge
        push += rp.amp * life * life * Math.exp(-(((dd - front) / 55) ** 2));
      }
      if (push > 0.05) { const dx = cx - q[0], dy = cy - q[1], m = Math.hypot(dx, dy) || 1; q[0] += dx / m * push; q[1] += dy / m * push; }
    });
  }
  if (touch > 0.003 && mouse.x >= 0) {   // the bend: the edge near the mouse leans towards it and shivers
    let best = 0, bd = Infinity;
    pts.forEach(([x, y], k) => { const d = (x - mouse.x) ** 2 + (y - mouse.y) ** 2; if (d < bd) { bd = d; best = k; } });
    const [cx, cy] = pts[best];
    for (const q of pts) {
      const d = Math.hypot(q[0] - cx, q[1] - cy), w = Math.exp(-((d / 150) ** 2));
      if (w < 0.01) continue;
      const amp = touch * w * (4 + 3 * Math.sin(T * 14 - d / 22)), dx = mouse.x - q[0], dy = mouse.y - q[1], m = Math.hypot(dx, dy) || 1;
      q[0] += dx / m * amp; q[1] += dy / m * amp;
    }
    F.touchAt = [cx, cy];
  }
  return F;
}
function toPath(F, b) {   // distance on the plain rectangle -> distance on the drawn path
  b = ((b % F.Pb) + F.Pb) % F.Pb;
  const d = F.dip;
  if (!d || b < d.bs) return b;
  if (b <= d.be) return d.ds + (b - d.bs) / (d.be - d.bs) * (d.de - d.ds);
  return b + (d.de - d.ds) - (d.be - d.bs);
}
function toBase(F, l) {
  const d = F.dip;
  if (!d || l < d.ds) return l;
  if (l <= d.de) return d.bs + (l - d.ds) / ((d.de - d.ds) || 1) * (d.be - d.bs);
  return l - (d.de - d.ds) + (d.be - d.bs);
}
function along(F, b) {   // the point b px clockwise round the plain rectangle, drawn on the real path
  const l = toPath(F, b);
  let lo = 0, hi = F.L.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (F.L[m] <= l) lo = m; else hi = m; }
  const [p, q] = [F.pts[lo], F.pts[hi]], u = (l - F.L[lo]) / ((F.L[hi] - F.L[lo]) || 1);
  return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
}
// The soft wide glow all round. Stroking wide paths every frame was the single biggest GPU cost, so:
// - the wide layers of the plain rectangle are painted once into an image and pasted;
// - where the notch dips, that strip is cut out and the dip's glow is stamped with cheap glow sprites;
// - only the thin bright line is stroked live, so the bend and ripples still move it.
let edgeCache = null, edgeKey = '';
function edgeGlow(F, accentQ) {
  const dpr = devicePixelRatio || 1, i = 4, r = clamp(Math.min(W, H) * 0.03, 14, 36), key = `${W}x${H}@${dpr}|${accentQ}`;
  if (key !== edgeKey) {
    edgeCache = edgeCache || document.createElement('canvas');
    edgeCache.width = Math.round(W * dpr); edgeCache.height = Math.round(H * dpr);
    const g = edgeCache.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.lineJoin = 'round'; g.strokeStyle = accentQ;
    for (const [lw, a] of [[24, 0.035], [13, 0.06], [6, 0.12]]) {
      g.globalAlpha = a; g.lineWidth = lw; g.beginPath(); g.roundRect(i, i, W - 2 * i, H - 2 * i, r); g.stroke();
    }
    edgeKey = key;
  }
  const a0 = ctx.globalAlpha, d = F.dip;
  if (d) {   // paste everything except the strip under the notch, then stamp the dip's glow
    const x0 = i + r + d.bs, x1 = i + r + d.be;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(x0, 0, x1 - x0, i + 18); ctx.clip('evenodd');
    ctx.drawImage(edgeCache, 0, 0, W, H); ctx.restore();
    const n = Math.ceil((d.de - d.ds) / 5);
    for (let k = 0; k <= n; k++) { const [x, y] = along(F, d.bs + (d.be - d.bs) * k / n); glowAt(x, y, 13, accentQ, a0 * 0.085); }
  } else ctx.drawImage(edgeCache, 0, 0, W, H);
  ctx.globalAlpha = a0 * 0.42; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.strokeStyle = ACCENT;   // the thin line, live
  ctx.beginPath(); F.pts.forEach(([x, y], k) => ctx[k ? 'lineTo' : 'moveTo'](x, y)); ctx.closePath(); ctx.stroke();
  ctx.globalAlpha = a0;
}
function border(T) {
  updateTouch(T);
  ctx.setTransform(devicePixelRatio || 1, 0, 0, devicePixelRatio || 1, 0, 0);   // screen-fixed: no parallax
  const F = frameRect(T), len = TAIL * F.Pb, N = 24, base = F.Pb / LAP;
  // where along the edge is the mouse? the light speeds up to reach it, then lingers there
  let want = base;
  if (mouse.inside && mouse.presence > 0.2 && now() - mouse.at < 2.5) {
    let best = 0, bd = Infinity;
    F.pts.forEach(([x, y], k) => { const d = (x - mouse.x) ** 2 + (y - mouse.y) ** 2; if (d < bd) { bd = d; best = k; } });
    const tb = toBase(F, F.L[best]), ahead = (((tb - headB) % F.Pb) + F.Pb) % F.Pb;
    want = base * (0.35 + 2.6 * clamp(ahead / (0.35 * F.Pb), 0, 1));
    if (mouse.speed > 700 && now() - rippleAt > 0.15 && bd < 280 * 280) {   // a fast sweep near the edge: a ripple
      rippleAt = now(); ripples.push({ b: tb, t: T, amp: Math.min(16, 6 + mouse.speed / 220) });
      if (ripples.length > 6) ripples.shift();
    }
  }
  headV = headV ? headV + (want - headV) * ease(0.05) : base;
  headB = (headB + headV * dt) % F.Pb;
  const head = headB;
  const q = c => `rgb(${c.map(v => Math.round(v / 12) * 12).join(',')})`;   // a few cached sprite colors, not one per frame
  const accentQ = q(shownRGB), core = q(shownRGB.map(v => v + (255 - v) * 0.6));   // glassy: near-white center
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.85 + 0.15 * Math.sin(T * 1.2);   // breathing
  edgeGlow(F, accentQ);
  const pts = Array.from({ length: N + 1 }, (_, k) => along(F, head - len * (1 - k / N)));
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'butt';   // butt ends: round ones overlap into beads
  for (const [lw, a, col] of [[30, 0.06, ACCENT], [16, 0.16, ACCENT], [7, 0.4, ACCENT], [2.4, 0.9, core]]) {   // the comet
    ctx.lineWidth = lw; ctx.strokeStyle = col;
    for (let k = 0; k < N; k++) {
      ctx.globalAlpha = a * Math.pow((k + 1) / N, 1.6);
      ctx.beginPath(); ctx.moveTo(pts[k][0], pts[k][1]); ctx.lineTo(pts[k + 1][0], pts[k + 1][1]); ctx.stroke();
    }
  }
  const glow = (x, y, rad, a) => { glowAt(x, y, rad, accentQ, a * 0.7); glowAt(x, y, rad * 0.4, core, a); };
  for (const c of F.corners) {   // a corner flares as the light rounds it, then fades
    const since = ((((head - c) % F.Pb) + F.Pb) % F.Pb) / base;
    if (since < 1.1) {
      const e = 1 - since / 1.1, [x, y] = along(F, c);
      glow(x, y, 50 + 90 * (1 - e * 0.5), 0.55 * e * e);
    }
  }
  for (const rp of ripples) {   // each ripple's two wave fronts glow as they travel
    const age = T - rp.t, life = 1 - age / 1.2, front = 900 * age;
    for (const sgn of [1, -1]) { const [x, y] = along(F, rp.b + sgn * front); glow(x, y, 40, 0.5 * life * life); }
  }
  if (F.touchAt) glow(F.touchAt[0], F.touchAt[1], 120, 0.45 * touch);   // where the mouse touches the edge
  const [hx, hy] = pts[N];
  glowAt(hx, hy, 34, accentQ, 0.8); glowAt(hx, hy, 12, '#ffffff', 0.95);   // the head: a soft bright orb
  ctx.globalCompositeOperation = 'source-over';
  const d = F.dip;   // is the bright part of the light going round the notch? (the notch waits for it to pass)
  cometNearNotch = !!d && Array.from({ length: 12 }, (_, k) => (((head - len * 0.5 * k / 11) % F.Pb) + F.Pb) % F.Pb)
    .some(b => b > d.bs - 40 && b < d.be + 40);
}

const haloColor = () => `rgb(${shownRGB.map(v => Math.round(v / 12) * 12).join(',')})`;
function draw(T) {
  ACCENT = accent();
  setAccent(ACCENT);

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
  nodes.forEach(n => {   // the mouse pushes stars aside (their links bend with them) and magnifies their words
    const w = field(n.p.x, n.p.y);
    n.p = w.f ? { x: n.p.x + w.dx, y: n.p.y + w.dy, s: w.s } : n.p;
  });
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
    if (isCur) { glowAt(p.x, p.y, r * 3.2, haloColor(), a * 0.55); ctx.globalAlpha = a; }
    (st.marker || sparkle)(p.x, p.y, r, isCur, a);

    // Label above the star.
    const grow = 0.85 + 0.15 * easeOut((T - n.born) / 0.25);
    const size = (big() + (SMALL - big()) * s) * (n.end ? grow : 1);
    const font = px => `${s < 0.5 ? 600 : 500} ${px}px "Segoe UI Variable Display", "Segoe UI", sans-serif`;
    ctx.font = font(size);
    ctx.letterSpacing = s < 0.5 ? '-0.01em' : '0px';
    const half = ctx.measureText(n.w).width / 2, lx = clamp(p.x, half + 24, W - half - 24), ly = p.y - r - 6;
    ctx.save();
    if (p.s) { ctx.translate(lx, ly); ctx.scale(p.s, p.s); ctx.translate(-lx, -ly); }   // the lens
    if (s < 0.5) drawHalo(n.w, font, size, haloColor(), 18, lx, ly, 'center', 'bottom', a * (1 - 2 * s));
    ctx.globalAlpha = a * (1 - (isCur ? 0.1 : 0.4) * s);
    ctx.fillText(n.w, lx, ly);
    ctx.restore();
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
                  rot: rand(0, 6.28), spin: rand(-2, 2), born: sceneT });
  }
}
function prismUnder(T, alpha, P) {
  const c = center();
  ctx.globalAlpha = 0.12 * sceneFade; ctx.lineWidth = 7;   // a soft wide stroke under a thin one: a glow without blur
  tri(c.x, c.y, prismR(), T * 0.12); ctx.stroke();
  ctx.globalAlpha = 0.5 * sceneFade; ctx.lineWidth = 1.5;
  tri(c.x, c.y, prismR(), T * 0.12); ctx.stroke();
  ctx.lineWidth = 1;
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
  waveScroll += ((cur ? cur.wx : 0) - W * 0.62 - waveScroll) * ease(0.04);
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
  overlay(T) { border(T); },          // screen-fixed: the edge doesn't lean with the mouse
  busyNotch: () => cometNearNotch,   // the notch stays until the light has gone round it
  poll(s) {
    if (s.style !== savedStyle) styleBase = savedStyle = s.style;   // startup, or set on the other screen
    if (s.color !== colorPick) { pickFrom = shownRGB; pickAt = sceneT; colorPick = s.color; }
  },
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
