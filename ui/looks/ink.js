// Look 4: Ink Sketch (from the Charlie Puth "How Long" kinetic-typography video).
// Paper and blackboard that swap with an ink flood, brush-marker caps that go from grey to ink as they're sung,
// and hand-drawn outlines that "boil": bubbles with shine marks, a signboard, an underline with footsteps,
// light bulbs on a wire and big words.
(() => {
  const PAPER = '#EEEBE3', BOARD = '#1B1A17', INK = '#16150F', CHALK = '#F1EEE6';
  const fg = dark => (dark ? CHALK : INK), grey = dark => (dark ? '#64625C' : '#ABA8A0');
  const SQ = 0.82;   // Permanent Marker is drawn squeezed to look like the video's condensed brush caps
  const pm = px => `${px}px "Permanent Marker"`;
  const tw = (s, px) => { ctx.font = pm(px); return ctx.measureText(s).width * SQ; };

  // ---------- textures ----------
  let paper, board, texW = 0, texH = 0;
  function textures() {
    if (texW === W && texH === H) return;
    texW = W; texH = H;
    const make = (base, dark) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.fillStyle = base; g.fillRect(0, 0, W, H);
      for (const [light, a] of [[false, dark ? 0.08 : 0.07], [true, dark ? 0.04 : 0.1]]) {
        g.globalAlpha = a; g.fillStyle = g.createPattern(noiseTile(256, light, 0.6), 'repeat'); g.fillRect(0, 0, W, H);
      }
      g.globalAlpha = dark ? 0.035 : 0.05; g.strokeStyle = dark ? '#FFFFFF' : '#6B655A'; g.lineWidth = 1;
      for (let i = 0; i < 380; i++) {   // paper fibres / chalk dust streaks
        const x = Math.random() * W, y = Math.random() * H, a = Math.random() * 6.28, l = 4 + Math.random() * 16;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      const v = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, dark ? 'rgba(0,0,0,0.35)' : 'rgba(80,70,50,0.12)');
      g.globalAlpha = 1; g.fillStyle = v; g.fillRect(0, 0, W, H);
      return c;
    };
    paper = make(PAPER, false); board = make(BOARD, true);
  }

  // ---------- hand-drawn helpers ----------
  const boilAt = T => Math.floor(T * 8);   // outlines are redrawn with a new wobble 8 times a second
  function smoothPath(pts, closed) {
    ctx.beginPath();
    const n = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (closed) {
      let m = mid(pts[n - 1], pts[0]); ctx.moveTo(m[0], m[1]);
      for (let i = 0; i < n; i++) { const p = pts[i], q = mid(p, pts[(i + 1) % n]); ctx.quadraticCurveTo(p[0], p[1], q[0], q[1]); }
      ctx.closePath();
    } else {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n - 1; i++) { const q = mid(pts[i], pts[i + 1]); ctx.quadraticCurveTo(pts[i][0], pts[i][1], q[0], q[1]); }
      ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
    }
  }
  const pathLen = pts => pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
  function strokePts(pts, closed, p, width) {   // draws the first fraction p of a wobbly path
    if (p <= 0) return;
    const len = pathLen(pts) + (closed ? Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) : 0);
    ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (p < 1) { ctx.setLineDash([len, len]); ctx.lineDashOffset = len * (1 - p); }
    smoothPath(pts, closed); ctx.stroke();
    ctx.setLineDash([]);
  }
  function circlePts(cx, cy, r, seed, ry) {
    const j = rng(seed), n = 24, pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.283 - 1.2, k = 1 + (j() - 0.5) * 0.045;
      pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * (ry || r) * k]);
    }
    return pts;
  }
  function linePts(x1, y1, x2, y2, seed, amp = 2.2, n = 10) {
    const j = rng(seed), pts = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      pts.push([x1 + (x2 - x1) * f + (j() - 0.5) * amp, y1 + (y2 - y1) * f + (j() - 0.5) * amp]);
    }
    return pts;
  }
  function rectPts(x, y, w, h, rad, seed) {   // rounded rectangle traced by hand
    const pts = [], j = rng(seed), seg = (x1, y1, x2, y2, n) => {
      for (let i = 0; i < n; i++) { const f = i / n; pts.push([x1 + (x2 - x1) * f + (j() - 0.5) * 2, y1 + (y2 - y1) * f + (j() - 0.5) * 2]); }
    };
    seg(x + rad, y, x + w - rad, y, 6); pts.push([x + w, y + rad * 0.3]);
    seg(x + w, y + rad, x + w, y + h - rad, 4); pts.push([x + w - rad * 0.3, y + h]);
    seg(x + w - rad, y + h, x + rad, y + h, 6); pts.push([x, y + h - rad * 0.3]);
    seg(x, y + h - rad, x, y + rad, 4); pts.push([x + rad * 0.3, y]);
    return pts;
  }

  // A word in brush caps: grey until sung, then the ink is "written" over it left to right.
  let inGroup = false;   // drawing words inside a bubble: the bubble reacts to the mouse as a whole
  function word(s, x, y, px, wd, t, T, dark, a, seed, center) {
    const w = tw(s, px), x0 = center ? x - w / 2 : x, j = rng(seed + boilAt(T));
    const rot = (j() - 0.5) * 0.02, dx = (j() - 0.5) * 1.2, dy = (j() - 0.5) * 1.2;
    ctx.save(); if (!inGroup) warp(x0 + w / 2, y - px * 0.35);   // pushed aside and magnified by the mouse
    ctx.translate(x0 + dx, y + dy); ctx.rotate(rot); ctx.scale(SQ, 1);
    ctx.font = pm(px); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const p = wd ? clamp((t - wd.t) / 0.22, 0, 1) : 1;
    ctx.globalAlpha = a; ctx.fillStyle = grey(dark); if (p < 1) ctx.fillText(s, 0, 0);
    if (p > 0) {
      ctx.beginPath(); ctx.rect(-10, -px * 1.4, (w / SQ + 20) * p, px * 2); ctx.clip();
      ctx.fillStyle = fg(dark); ctx.fillText(s, 0, 0);
    }
    ctx.restore();
    return w;
  }
  function shine(cx, cy, r, T, seed) {   // the bubble highlight: a tilted pill and a small dot
    ctx.save(); ctx.translate(cx - r * 0.5, cy + r * 0.32); ctx.rotate(-0.95);
    strokePts(circlePts(0, 0, r * 0.22, seed + boilAt(T), r * 0.08), true, 1, Math.max(1.5, r * 0.035));
    ctx.restore();
    strokePts(circlePts(cx - r * 0.22, cy + r * 0.62, r * 0.065, seed + 7 + boilAt(T)), true, 1, Math.max(1.5, r * 0.03));
  }

  // ---------- layouts ----------
  function build(ph, r) {
    const S = stage(), ws = ph.words, n = ws.length, dark = r() < 0.5;
    let type;
    if (n <= 2) type = r() < 0.6 ? 'big' : 'bubbles';
    else if (n <= 5) type = pickR(r, ['bubbles', 'bubbles', 'bulbs', 'underline']);
    else type = pickR(r, ['sign', 'underline', 'sign', 'bubbles']);
    const L = { type, dark, seed: Math.floor(r() * 1e6), flood: r() < 0.5 ? 'blob' : 'ripple', fx: r(), fy: r() };

    if (type === 'bubbles') {
      const groups = [];
      for (let i = 0; i < n;) {
        const two = n > 4 && i + 1 < n && (ws[i].w + ws[i + 1].w).length <= 9;
        groups.push(ws.slice(i, i += two ? 2 : 1));
      }
      let x = 0;
      L.bubbles = groups.map((g, i) => {
        const s = g.map(w => caps(w.w)).join(' '), px = S.h * (0.075 + r() * 0.035), w = tw(s, px);
        const rad = Math.max(w / 2 + px * 0.6, px * 1.15);
        if (i) x += rad * 0.95; else x = rad;
        const b = { g, s, px, rad, x, y: S.cy + (r() - 0.5) * S.h * 0.3, seed: Math.floor(r() * 1e6) };
        x += rad * 0.95;
        return b;
      });
      L.width = x;
    } else if (type === 'sign') {
      const half = Math.ceil(n / 2);
      L.lines = [ws.slice(0, half), ws.slice(half)];
      const texts = L.lines.map(l => l.map(w => caps(w.w)).join(' '));
      const px = Math.min(...texts.map(s => 100 * W * 0.46 / tw(s, 100)), S.h * 0.11);
      const pad = px * 0.75, wMax = Math.max(...texts.map(s => tw(s, px)));
      Object.assign(L, { px, w: wMax + pad * 2, h: px * 2.3 + pad * 1.4, pad });
      L.x = S.cx - L.w / 2; L.y = S.cy - L.h / 2 - S.h * 0.06;
    } else if (type === 'underline') {
      const half = Math.min(3, Math.ceil(n / 2));
      L.l1 = ws.slice(0, half); L.l2 = ws.slice(half);
      const s1 = L.l1.map(w => caps(w.w)).join(' '), s2 = L.l2.map(w => caps(w.w)).join(' ');
      L.px1 = Math.min(100 * W * 0.5 / tw(s1, 100), S.h * 0.17);
      L.px2 = Math.min(L.px1 * 0.58, s2 ? 100 * W * 0.5 / tw(s2, 100) : 1e9);
      L.right = W * 0.86; L.base1 = S.cy - L.px1 * 0.05; L.lineY = L.base1 + L.px1 * 0.28; L.base2 = L.lineY + L.px2 * 1.25;
    } else if (type === 'bulbs') {
      L.rb = Math.min(S.h * 0.14, W / (n * 2.7));
      L.wire = [[-30, S.y + S.h * 0.08], [W / 2, S.y + S.h * 0.5], [W + 30, S.y + S.h * 0.14]];
      L.bulbs = ws.map((wd, i) => ({ wd, f: (i + 1) / (n + 1), s: caps(wd.w), seed: Math.floor(r() * 1e6) }));
    } else {   // big
      const s = ws.map(w => caps(w.w)).join(' ');
      L.s = s; L.px = Math.min(100 * W * 0.62 / tw(s, 100), S.h * 0.4);
    }
    return L;
  }
  function buildCard() {
    const S = stage(), title = caps(track.title || 'MUSIC SYNC');
    return { card: true, dark: false, title, who: caps(track.artist || ''), px: Math.min(100 * W * 0.42 / tw(title, 100), S.h * 0.16) };
  }

  // ---------- drawing ----------
  let flood = null;   // paper <-> board change in progress
  function background(T, dark) {
    textures();
    const D = 0.75;
    if (!flood || T - flood.at > D) { ctx.drawImage(dark ? board : paper, 0, 0, W, H); return; }
    const p = easeInOut((T - flood.at) / D), maxR = Math.hypot(W, H);
    ctx.drawImage(flood.from ? board : paper, 0, 0, W, H);
    const cx = W * (0.2 + flood.fx * 0.6), cy = H * (0.25 + flood.fy * 0.5);
    if (flood.kind === 'ripple') {   // grey rings run ahead of the new colour
      [['#8C8A84', 0.25], ['#5E5C57', 0.12]].forEach(([c, lead]) => {
        ctx.fillStyle = c; smoothPath(circlePts(cx, cy, maxR * clamp(p + lead, 0, 1), boilAt(T) + lead * 100), true); ctx.fill();
      });
    }
    ctx.save(); smoothPath(circlePts(cx, cy, maxR * p, boilAt(T)), true); ctx.clip();
    ctx.drawImage(flood.to ? board : paper, 0, 0, W, H); ctx.restore();
  }

  function drawBubbles(sc, t, T, a) {
    const L = sc.L, S = stage();
    // camera glides so the bubble being sung stays left of centre
    const curIdx = Math.max(0, L.bubbles.findLastIndex(b => b.g[0].t <= t + 0.05));
    const target = L.width <= W * 0.9 ? -(W - L.width) / 2                       // fits: just centre the row
                                      : clamp(L.bubbles[curIdx].x - W * 0.42, -W * 0.05, L.width - W * 0.95);
    sc.cam = sc.cam === undefined ? target : lerp(sc.cam, target, ease(0.06));
    ctx.strokeStyle = fg(L.dark);
    L.bubbles.forEach((b, i) => {
      const p = clamp((t - b.g[0].t + 0.05) / 0.35, 0, 1);
      if (p <= 0) return;
      const x = b.x - sc.cam, y = b.y + Math.sin(T * 1.1 + i * 1.7) * 5, k = 0.55 + 0.45 * backOut(p);
      ctx.save(); warp(x, y, 1.2); ctx.translate(x, y); ctx.scale(k, k);   // the bubble drifts away from the mouse
      ctx.globalAlpha = a;
      strokePts(circlePts(0, 0, b.rad, b.seed + boilAt(T)), true, p, Math.max(2.2, b.px * 0.07));
      shine(0, 0, b.rad, T, b.seed);
      let wx = -tw(b.s, b.px) / 2;
      inGroup = true;
      b.g.forEach(wd => { wx += word(caps(wd.w), wx, b.px * 0.36, b.px, wd, t, T, L.dark, a, b.seed + wd.t * 100) + tw(' ', b.px); });
      inGroup = false;
      ctx.restore();
    });
  }

  function drawSign(sc, t, T, a) {
    const L = sc.L, p = easeOut((T - sc.at) / 0.6), b = boilAt(T);
    ctx.strokeStyle = fg(L.dark); ctx.globalAlpha = a;
    strokePts(rectPts(L.x, L.y, L.w, L.h, 24, L.seed + b), true, p, 3);
    strokePts(rectPts(L.x + 12, L.y + 12, L.w - 24, L.h - 24, 16, L.seed + 3 + b), true, p, 3);
    const px1 = L.x + L.w * 0.45, px2 = L.x + L.w * 0.55;   // two posts, each a double line
    for (const px of [px1, px2]) {
      strokePts(linePts(px - 8, L.y + L.h, px - 8, H + 10, L.seed + px + b, 2, 6), false, p, 3);
      strokePts(linePts(px + 8, L.y + L.h, px + 8, H + 10, L.seed + px + 9 + b, 2, 6), false, p, 3);
    }
    L.lines.forEach((ln, i) => {
      let x = L.x + L.pad;
      const y = L.y + L.pad * 0.7 + L.px * (1.0 + i * 1.12);
      ln.forEach(wd => { x += word(caps(wd.w), x, y, L.px, wd, t, T, L.dark, a * easeOut((T - sc.at - 0.3) / 0.3), L.seed + wd.t * 100) + tw(' ', L.px); });
    });
  }

  function drawUnderline(sc, t, T, a) {
    const L = sc.L, b = boilAt(T);
    ctx.strokeStyle = fg(L.dark); ctx.globalAlpha = a;
    const lp = easeOut((T - sc.at) / 0.8);
    const pts = linePts(-10, L.lineY + 10, L.right + 30, L.lineY - 4, L.seed + b, 3, 14);
    strokePts(pts, false, lp, 3.2);
    const s1 = L.l1.map(w => caps(w.w)).join(' '), s2 = L.l2.map(w => caps(w.w)).join(' ');
    let x = L.right - tw(s1, L.px1);
    L.l1.forEach(wd => { x += word(caps(wd.w), x, L.base1, L.px1, wd, t, T, L.dark, a, L.seed + wd.t * 100) + tw(' ', L.px1); });
    x = L.right - tw(s2, L.px2);
    L.l2.forEach(wd => { x += word(caps(wd.w), x, L.base2, L.px2, wd, t, T, L.dark, a, L.seed + wd.t * 100) + tw(' ', L.px2); });
    // footsteps walk toward the words, one step per sung word
    const all = L.l1.concat(L.l2), steps = all.filter(wd => wd.t <= t).length;
    ctx.fillStyle = fg(L.dark);
    const S = stage(), start = [W * 0.06, S.y + S.h * 0.92], end = [L.right - tw(s1, L.px1) - W * 0.08, L.lineY - 30];
    for (let i = 0; i < steps; i++) {
      const f = all.length > 1 ? i / (all.length - 1) : 1, side = i % 2 ? 1 : -1;
      const ang = Math.atan2(end[1] - start[1], end[0] - start[0]);
      const x0 = lerp(start[0], end[0], f) + Math.cos(ang + Math.PI / 2) * side * 16;
      const y0 = lerp(start[1], end[1], f) + Math.sin(ang + Math.PI / 2) * side * 16;
      const k = backOut(clamp((t - all[i].t) / 0.25, 0, 1)), sz = S.h * 0.028;
      ctx.save(); ctx.translate(x0, y0); ctx.rotate(ang + Math.PI / 2); ctx.scale(k, k);
      ctx.beginPath(); ctx.ellipse(0, -sz * 0.4, sz * 0.55, sz, 0, 0, 6.29); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, sz * 1.15, sz * 0.42, sz * 0.48, 0, 0, 6.29); ctx.fill();
      ctx.restore();
    }
  }

  function bezier(P, f) {
    const [a, b, c] = P, u = 1 - f;
    return [u * u * a[0] + 2 * u * f * b[0] + f * f * c[0], u * u * a[1] + 2 * u * f * b[1] + f * f * c[1]];
  }
  function drawBulbs(sc, t, T, a) {
    const L = sc.L, bt = boilAt(T), wp = easeOut((T - sc.at) / 0.6);
    ctx.strokeStyle = fg(L.dark); ctx.globalAlpha = a;
    const wire = []; for (let i = 0; i <= 24; i++) wire.push(bezier(L.wire, i / 24));
    strokePts(wire, false, wp, 2.5);
    L.bulbs.forEach((bl, i) => {
      const p = clamp((T - sc.at - 0.15 - i * 0.08) / 0.4, 0, 1);
      if (p <= 0) return;
      const [x, y] = bezier(L.wire, bl.f), rb = L.rb, lit = sung(bl.wd, t, 0.2);
      ctx.save(); warp(x, y, 1.1); ctx.translate(x, y); ctx.rotate(Math.sin(T * 1.3 + i) * 0.07 + (i % 2 ? 0.05 : -0.05));
      ctx.strokeRect(-rb * 0.17, 0, rb * 0.34, rb * 0.32);   // socket
      for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-rb * 0.17, rb * 0.1 * k); ctx.lineTo(rb * 0.17, rb * 0.1 * k); ctx.stroke(); }
      const cy = rb * 0.32 + rb * 1.05, glass = circlePts(0, cy, rb, bl.seed + bt);
      if (lit > 0) {   // the bulb lights up when its word is sung
        glowAt(0, cy, rb * 2.1, L.dark ? 'rgb(255,240,180)' : 'rgb(255,230,150)', a * lit * 0.75);   // its glow
        ctx.save(); ctx.globalAlpha = a * lit; ctx.fillStyle = L.dark ? '#FFF7D6' : '#FFFFFF';
        smoothPath(glass, true); ctx.fill(); ctx.restore();
      }
      ctx.globalAlpha = a;
      strokePts(glass, true, p, 2.5);
      shine(0, cy, rb, T, bl.seed);
      const px = Math.min(rb * 0.55, 100 * rb * 1.45 / tw(bl.s, 100));
      ctx.save(); ctx.translate(rb * 0.08, cy - rb * 0.12 + px * 0.35); ctx.rotate(-0.12);   // above the shine marks
      word(bl.s, 0, 0, px, bl.wd, t, T, L.dark && lit < 0.5, a * p, bl.seed, true);
      ctx.restore();
      ctx.restore();
    });
  }

  function drawBig(sc, t, T, a) {
    const L = sc.L, S = stage(), ws = sc.ph.words;
    let x = S.cx - tw(L.s, L.px) / 2;
    ws.forEach(wd => { x += word(caps(wd.w), x, S.cy + L.px * 0.36, L.px, wd, t, T, L.dark, a, L.seed + wd.t * 100) + tw(' ', L.px); });
    const last = ws[ws.length - 1], p = clamp((t - last.t - 0.15) / 0.35, 0, 1);
    if (p > 0) {   // a small bubble pops into the middle of the word
      const r = L.px * 0.3 * backOut(p), cx = S.cx, cy = S.cy;
      ctx.globalAlpha = a; ctx.fillStyle = L.dark ? BOARD : PAPER; ctx.strokeStyle = fg(L.dark);
      smoothPath(circlePts(cx, cy, r, L.seed + boilAt(T)), true); ctx.fill();
      strokePts(circlePts(cx, cy, r, L.seed + boilAt(T)), true, 1, 3);
      shine(cx, cy, r, T, L.seed);
    }
  }

  function drawCard(sc, T, a) {
    const S = stage(), L = sc.L, age = T - sc.at;
    const x1 = W * 0.08, yWho = S.y + S.h * 0.18;
    word(L.who, x1, yWho, S.h * 0.05, null, 0, T, false, a * easeOut(age / 0.4), 11);
    const xr = W * 0.88 - tw(L.title, L.px), yT = S.y + S.h * 0.72;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, xr + (tw(L.title, L.px) + 40) * clamp((age - 0.3) / 0.6, 0, 1), H); ctx.clip();
    word(L.title, xr, yT, L.px, null, 0, T, false, a, 13); ctx.restore();
    ctx.strokeStyle = INK; ctx.globalAlpha = a;
    strokePts(linePts(xr - 10, yT + L.px * 0.25, W * 0.9, yT + L.px * 0.2, 21 + boilAt(T), 2.5, 10), false, easeOut((age - 0.8) / 0.5), 3);
    // an ink drop falls every few seconds and ripples on the line
    const cyc = (age % 3.2) / 3.2, dx = W * 0.3;
    if (cyc < 0.45) {
      const f = easeInOut(cyc / 0.45), dy = lerp(S.y + 20, yT + L.px * 0.22, f * f);
      ctx.fillStyle = INK; ctx.beginPath();
      ctx.moveTo(dx, dy - 26); ctx.quadraticCurveTo(dx + 12, dy - 2, dx, dy + 8); ctx.quadraticCurveTo(dx - 12, dy - 2, dx, dy - 26); ctx.fill();
    } else {
      const f = (cyc - 0.45) / 0.55;
      ctx.globalAlpha = a * (1 - f); ctx.lineWidth = 2.5;
      for (const k of [1, 0.6]) { ctx.beginPath(); ctx.ellipse(dx, yT + L.px * 0.22, 70 * f * k + 4, 14 * f * k + 2, 0, 0, 6.29); ctx.stroke(); }
    }
  }

  function drawScene(sc, t, T, a) {
    if (sc.card) return drawCard(sc, T, a);
    ({ bubbles: drawBubbles, sign: drawSign, underline: drawUnderline, bulbs: drawBulbs, big: drawBig })[sc.L.type](sc, t, T, a);
  }

  LOOKS.push({
    id: 'ink', name: 'Ink Sketch', exit: 0.3,
    reset() { flood = null; },
    build, buildCard,
    enter(cur, prev, T) {
      const from = prev ? prev.L.dark : false;
      if (from !== cur.L.dark) flood = { from, to: cur.L.dark, at: T, kind: cur.L.flood || 'blob', fx: cur.L.fx || 0.5, fy: cur.L.fy || 0.5 };
    },
    frame(T) {
      const d = direct(this, T), cur = d.cur;
      ctx.save(); parallax(0.4); background(T, cur.L.dark); ctx.restore();   // paper sits behind the ink
      if (d.prev) {
        const p = (T - d.prev.out) / this.exit;
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(1 - p * 0.06, 1 - p * 0.06); ctx.translate(-W / 2, -H / 2);
        drawScene(d.prev, d.t, T, sceneFade * (1 - p)); ctx.restore();
      }
      drawScene(cur, d.t, T, sceneFade);
      setAccent(fg(cur.L.dark));
    },
  });
})();
