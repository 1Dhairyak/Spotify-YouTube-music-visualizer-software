// Look 7: Splash (from the "Hand-Drawn Motion Typography" lyric video).
// Flat mint / indigo / magenta / night grounds that change with a brush swipe or a liquid flood, hand-lettered caps
// that boil (redrawn with a new wobble 8 times a second), small lead-in words with sparkle ticks over a huge
// dry-brush word, words written round a circle about a splat, words tumbling down stairs, and ink blobs that fly
// off the words as they're sung, drift, and get shoved around by the mouse.
(() => {
  const MINT = '#2BFFC0', INDIGO = '#3D0A91', MAGENTA = '#E8096E', NIGHT = '#0B1418';
  const SCHEMES = [   // ground, ink, blob color
    { bg: MINT, ink: INDIGO, blob: INDIGO }, { bg: INDIGO, ink: MINT, blob: MAGENTA }, { bg: MAGENTA, ink: INDIGO, blob: MINT },
    { bg: NIGHT, ink: MINT, blob: MAGENTA }, { bg: MINT, ink: MAGENTA, blob: INDIGO }, { bg: MAGENTA, ink: MINT, blob: INDIGO },
  ];
  const BIG = px => `${px}px "Permanent Marker"`, SMALL = px => `700 ${px}px Caveat`;
  const boilAt = T => Math.floor(T * 8);

  // ---------- hand-drawn helpers (as in ink.js) ----------
  function smoothPath(pts) {
    ctx.beginPath();
    const n = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let m = mid(pts[n - 1], pts[0]); ctx.moveTo(m[0], m[1]);
    for (let i = 0; i < n; i++) { const p = pts[i], q = mid(p, pts[(i + 1) % n]); ctx.quadraticCurveTo(p[0], p[1], q[0], q[1]); }
    ctx.closePath();
  }
  function blobPts(cx, cy, r, seed, lumpy = 0.18, n = 14) {
    const j = rng(seed), pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * 6.283, k = 1 + (j() - 0.5) * lumpy * 2; pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]); }
    return pts;
  }

  // Hand lettering: each letter wobbles on its own, and pops in (scale overshoot) as the reveal p passes it.
  // dry = slices of the glyphs shifted sideways, for the dry-brush edge of the giant words.
  function hand(s, x, y, px, font, color, T, seed, p, a, dry) {
    ctx.font = font(px); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color;
    const total = textW(s, font(px)), chars = [...s];
    let cx = x - total / 2;
    chars.forEach((ch, i) => {
      const w = ctx.measureText(ch).width, j = rng(seed + i * 31 + boilAt(T));
      const f = clamp(p * chars.length - i, 0, 1);
      if (f > 0 && ch !== ' ') {
        const k = backOut(f), lx = cx + w / 2, ly = y - px * 0.35;
        ctx.save(); ctx.globalAlpha = a * Math.min(1, f * 2);
        ctx.translate(lx + (j() - 0.5) * px * 0.03, ly + (j() - 0.5) * px * 0.03); ctx.rotate((j() - 0.5) * 0.09); ctx.scale(k, k);
        if (dry) {
          const sl = 5;
          for (let q = 0; q < sl; q++) {
            ctx.save(); ctx.beginPath(); ctx.rect(-w, -px * 0.75 + q * px * 1.1 / sl, w * 2, px * 1.1 / sl + 0.5); ctx.clip();
            ctx.fillText(ch, -w / 2 + (j() - 0.5) * px * 0.05, px * 0.35); ctx.restore();
          }
        } else ctx.fillText(ch, -w / 2, px * 0.35);
        ctx.restore();
      }
      cx += w;
    });
    return total;
  }
  function sparkles(x, y, r, color, T, seed, a, side) {   // the little tick marks round a lead-in word
    const j = rng(seed + boilAt(T));
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, r * 0.09); ctx.lineCap = 'round'; ctx.globalAlpha = a;
    for (let i = 0; i < 3; i++) {
      const ang = (side < 0 ? Math.PI : 0) + (i - 1) * 0.55 + (j() - 0.5) * 0.1;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r); ctx.lineTo(x + Math.cos(ang) * r * 1.8, y + Math.sin(ang) * r * 1.8); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- ink blobs ----------
  let blobs = [];
  function spawn(x, y, n, color, r, seed) {
    const j = rng(seed);
    for (let i = 0; i < n; i++) {
      const a = j() * 6.283, sp = 120 + j() * 380;
      blobs.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: r * (0.3 + j() * 0.9), born: sceneT, seed: Math.floor(j() * 1e6), color });
    }
    if (blobs.length > 46) blobs = blobs.slice(-46);
  }
  function drawBlobs(T, a) {
    const k = 1 - Math.pow(0.12, dt);   // drag
    blobs = blobs.filter(b => T - b.born < 7);
    for (const b of blobs) {
      b.vx -= b.vx * k; b.vy -= b.vy * k; b.x += b.vx * dt; b.y += b.vy * dt + Math.sin(T + b.seed) * 0.15;
      const age = T - b.born, life = Math.min(1, age * 6) * Math.min(1, (7 - age) / 0.6), r = b.r * (0.5 + 0.5 * Math.min(1, age * 5));
      ctx.save(); warp(b.x, b.y, 1.6); ctx.globalAlpha = a * life; ctx.fillStyle = b.color;
      smoothPath(blobPts(b.x, b.y, r, b.seed + boilAt(T) % 2)); ctx.fill(); ctx.restore();
    }
  }

  // ---------- layouts ----------
  function build(ph, r) {
    const S = stage(), ws = ph.words, n = ws.length, sch = pickR(r, SCHEMES);
    let type = n <= 3 ? 'giant' : n <= 6 ? pickR(r, ['giant', 'arc', 'stairs', 'arc']) : 'arc';
    const L = { type, sch, seed: Math.floor(r() * 1e6), swipe: pickR(r, ['brush', 'flood', 'brush']), fx: r(), fy: r(), items: [] };
    if (type === 'giant') {   // small lead-in words over one huge word (the longest of the last two)
      const gi = n === 1 ? 0 : (ws[n - 1].w.length >= ws[n - 2].w.length ? n - 1 : n - 2);
      const g = caps(ws[gi].w), px = Math.min(S.h * 0.46, 100 * W * 0.62 / textW(g, BIG(100)));
      const lead = ws.filter((_, i) => i !== gi), ls = lead.map(w => caps(w.w)).join(' ');
      const lpx = Math.min(px * 0.3, ls ? 100 * W * 0.4 / textW(ls, SMALL(100)) : 1e9);
      L.giant = { wd: ws[gi], s: g, px, x: S.cx, y: S.cy + px * 0.42 };
      if (lead.length) L.lead = { ws: lead, s: ls, px: lpx, x: S.cx, y: S.cy - px * 0.5 - lpx * 0.2, wd: lead[0] };
    } else if (type === 'arc') {   // letters round a circle, starting upper left, with a splat in the middle
      const s = ws.map(w => caps(w.w)).join(' '), R = Math.min(S.h * 0.33, W * 0.24);
      const px = Math.min(R * 0.42, 6.283 * R * 0.82 / Math.max(1, textW(s, SMALL(100))) * 100);
      let pos = 0; const span = textW(s, SMALL(px)), sweep = span / R, a0 = -Math.PI / 2 - Math.min(sweep, 5.2) / 2 - 0.2;
      ws.forEach((wd, i) => {
        const cs = caps(wd.w) + (i < n - 1 ? ' ' : '');
        for (const ch of cs) { const w = textW(ch, SMALL(px)); L.items.push({ ch, wd, ang: a0 + (pos + w / 2) / R }); pos += w; }
      });
      Object.assign(L, { R, px, cx: S.cx, cy: S.cy + S.h * 0.03 });
    } else {   // stairs: words step down and right, growing, the last the biggest
      const groups = []; for (let i = 0; i < n;) { const two = n > 5 && i + 1 < n && (ws[i].w + ws[i + 1].w).length <= 8; groups.push(ws.slice(i, i += two ? 2 : 1)); }
      const m = groups.length, sx = W * 0.62 / Math.max(1, m - 1 || 1), sy = S.h * 0.62 / Math.max(1, m - 1 || 1);
      groups.forEach((g, i) => {
        const s = g.map(w => caps(w.w)).join(' '), grow = 0.55 + 0.45 * (i / Math.max(1, m - 1));
        const px = Math.min(S.h * 0.2 * grow, 100 * W * 0.32 * grow / textW(s, BIG(100)), sy * (0.85 + 0.35 * grow));   // no taller than a step
        L.items.push({ s, wd: g[0], px, x: W * 0.2 + sx * i, y: S.y + S.h * 0.2 + sy * i + px * 0.35, rot: (r() - 0.5) * 0.25 });
      });
    }
    return L;
  }
  function buildCard(cur) {
    const S = stage(), title = caps(track.title || 'MUSIC SYNC');
    const px = Math.min(S.h * 0.3, 100 * W * 0.6 / textW(title, BIG(100)));
    return { card: true, sch: SCHEMES[cur.k >= 0 ? 3 : 0], title, px, who: caps(track.artist || ''), seed: 5, swipe: 'flood', fx: 0.5, fy: 0.5 };
  }

  // ---------- drawing ----------
  const reveal = (wd, t, dur) => clamp((t - wd.t + 0.06) / dur, 0, 1);
  function drawScene(sc, t, T, a) {
    const L = sc.L, ink = L.sch.ink, S = stage();
    if (sc.card) {
      const age = T - sc.at;
      hand(L.title, S.cx, S.cy + L.px * 0.35, L.px, BIG, ink, T, 3, clamp(age / 0.8, 0, 1), a, true);
      if (L.who) {
        const wpx = L.px * 0.3, w = textW(L.who, SMALL(wpx)), y = S.cy - L.px * 0.55;
        hand(L.who, S.cx, y, wpx, SMALL, ink, T, 9, clamp((age - 0.6) / 0.5, 0, 1), a);
        sparkles(S.cx - w / 2 - wpx * 0.3, y - wpx * 0.35, wpx * 0.45, ink, T, 4, a * clamp(age - 1, 0, 1), -1);
        sparkles(S.cx + w / 2 + wpx * 0.3, y - wpx * 0.35, wpx * 0.45, ink, T, 6, a * clamp(age - 1, 0, 1), 1);
      }
      return;
    }
    if (L.type === 'giant') {
      if (L.lead) {
        const ld = L.lead, p = reveal(ld.wd, t, 0.35), w = textW(ld.s, SMALL(ld.px));
        ctx.save(); warp(ld.x, ld.y); punchAt(ld.wd, t, ld.x, ld.y, ld.px);
        hand(ld.s, ld.x, ld.y, ld.px, SMALL, ink, T, L.seed, p, a);
        ctx.restore();
        sparkles(ld.x - w / 2 - ld.px * 0.25, ld.y - ld.px * 0.35, ld.px * 0.4, ink, T, L.seed + 1, a * p, -1);
        sparkles(ld.x + w / 2 + ld.px * 0.25, ld.y - ld.px * 0.35, ld.px * 0.4, ink, T, L.seed + 2, a * p, 1);
      }
      const g = L.giant, p = reveal(g.wd, t, 0.4);
      if (p > 0) {
        if (t - g.wd.t < 1.2) {   // a shiver of stripes behind the giant word, like the video's "FEAR"
          ctx.save(); ctx.strokeStyle = L.sch.blob; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.globalAlpha = a * (1 - (t - g.wd.t) / 1.2) * p;
          const j = rng(L.seed + boilAt(T));
          for (let i = 0; i < 10; i++) {
            const side = i % 2 ? 1 : -1, yy = g.y - g.px * (0.9 - i * 0.07), xx = g.x + side * (textW(g.s, BIG(g.px)) / 2 + 20 + j() * 30);
            ctx.beginPath(); ctx.moveTo(xx, yy); ctx.quadraticCurveTo(xx + side * 30, yy - 10, xx + side * 50, yy + (j() - 0.5) * 20); ctx.stroke();
          }
          ctx.restore();
        }
        ctx.save(); warp(g.x, g.y - g.px * 0.35, 0.7); punchAt(g.wd, t, g.x, g.y - g.px * 0.35, g.px, 0.6);
        hand(g.s, g.x, g.y, g.px, BIG, ink, T, L.seed + 9, p, a, true);
        ctx.restore();
      }
    } else if (L.type === 'arc') {
      const rot = Math.sin(T * 0.3) * 0.08;
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = L.sch.blob;   // the splat in the middle
      const sp = easeOut((T - sc.at) / 0.5);
      smoothPath(blobPts(L.cx, L.cy, L.R * 0.42 * sp, L.seed + boilAt(T) % 3, 0.25, 16)); ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.lineCap = 'round';   // swirl marks at both ends of the text
      for (const [a0, d] of [[L.items[0].ang - 0.25, -1], [L.items[L.items.length - 1].ang + 0.25, 1]]) {
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(L.cx, L.cy, L.R * (0.78 + k * 0.1), a0 + rot, a0 + rot + d * 0.35, d < 0); ctx.stroke(); }
      }
      ctx.restore();
      ctx.font = SMALL(L.px); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = ink;
      L.items.forEach((it, i) => {
        const f = reveal(it.wd, t, 0.3);
        if (f <= 0 || it.ch === ' ') return;
        const ang = it.ang + rot, x = L.cx + Math.cos(ang) * L.R, y = L.cy + Math.sin(ang) * L.R, j = rng(L.seed + i + boilAt(T));
        ctx.save(); warp(x, y); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2 + (j() - 0.5) * 0.08);
        const k = backOut(f) * punch(it.wd, t).s; ctx.scale(k, k); ctx.globalAlpha = a * Math.min(1, f * 2);
        ctx.fillText(it.ch, 0, 0); ctx.restore();
      });
    } else {
      L.items.forEach((it, i) => {
        const p = reveal(it.wd, t, 0.3);
        if (p <= 0) return;
        const drop = (1 - easeOut(p)) * -it.px * 1.2;   // tumbles in from above
        ctx.save(); warp(it.x, it.y - it.px * 0.35); punchAt(it.wd, t, it.x, it.y - it.px * 0.35, it.px);
        ctx.translate(it.x, it.y + drop); ctx.rotate(it.rot * (0.4 + 0.6 * p)); ctx.translate(-it.x, -it.y);
        hand(it.s, it.x, it.y, it.px, BIG, i % 2 ? L.sch.blob === MINT ? ink : L.sch.blob : ink, T, L.seed + i * 7, p, a, i === L.items.length - 1);
        ctx.restore();
      });
    }
  }

  // ---------- grounds and transitions ----------
  let swipe = null, ground = MINT, lastWord = -1;
  function background(T) {
    if (!swipe || T - swipe.at > 0.75) { ctx.fillStyle = ground; ctx.fillRect(-40, -40, W + 80, H + 80); return; }
    const p = easeInOut((T - swipe.at) / 0.75);
    ctx.fillStyle = swipe.from; ctx.fillRect(-40, -40, W + 80, H + 80);
    ctx.save(); ctx.fillStyle = swipe.to; ctx.beginPath();
    if (swipe.kind === 'brush') {   // a giant brush stroke dragged across, its leading edge ragged
      const x = lerp(-W * 0.3, W * 1.3, p), j = rng(swipe.seed + boilAt(T));
      ctx.moveTo(-40, -40); ctx.lineTo(x, -40);
      for (let i = 0; i <= 12; i++) { const y = -40 + (H + 80) * i / 12; ctx.lineTo(x + Math.sin(i * 1.7 + swipe.seed) * W * 0.12 + (j() - 0.5) * 30, y); }
      ctx.lineTo(-40, H + 40); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.strokeStyle = swipe.to; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.globalAlpha = 0.7;   // bristle streaks
      for (let i = 0; i < 9; i++) { const y = H * (0.08 + i * 0.11); ctx.beginPath(); ctx.moveTo(x - 140, y); ctx.lineTo(x + 40 + Math.sin(i + swipe.seed) * 60, y + (j() - 0.5) * 10); ctx.stroke(); }
    } else {   // a liquid flood from a corner, lumpy edge
      const cx = W * (swipe.fx < 0.5 ? 0 : 1), cy = H * (swipe.fy < 0.5 ? 0 : 1);
      smoothPath(blobPts(cx, cy, Math.hypot(W, H) * 1.05 * p, swipe.seed + boilAt(T), 0.08, 22)); ctx.fill();
    }
    ctx.restore();
  }

  LOOKS.push({
    id: 'splash', name: 'Splash', exit: 0.35,
    reset() { swipe = null; blobs = []; lastWord = -1; },
    build, buildCard,
    enter(cur, prev, T) {
      const to = cur.L.sch.bg;
      if (to !== ground) { swipe = { from: ground, to, at: T, kind: cur.L.swipe, seed: cur.L.seed % 997, fx: cur.L.fx, fy: cur.L.fy }; ground = to; }
    },
    frame(T) {
      const d = direct(this, T), cur = d.cur;
      if (!swipe) ground = cur.L.sch.bg;
      ctx.save(); parallax(0.3); background(T); ctx.restore();
      // a few blobs fly off each word as it's sung, from where it sits
      const ws = track.words; let i = lastWord;
      while (i + 1 < ws.length && ws[i + 1].t <= d.t) i++;
      if (i !== lastWord) {
        if (i > lastWord && i - lastWord <= 2 && !cur.card) spawn(W * (0.2 + ((ws[i].t * 7.3) % 1) * 0.6), stage().cy + (((ws[i].t * 3.1) % 1) - 0.5) * stage().h * 0.5,
                                                                  2 + (i % 3), cur.L.sch.blob, Math.min(W, H) * 0.035, hash(ws[i].w + ws[i].t));
        lastWord = i;
      }
      drawBlobs(T, sceneFade);
      if (d.prev) {   // the old line shrinks and tips away
        const p = clamp((T - d.prev.out) / this.exit, 0, 1);
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(p * 0.08); ctx.scale(1 - p * 0.25, 1 - p * 0.25); ctx.translate(-W / 2, -H / 2);
        drawScene(d.prev, d.t, T, sceneFade * (1 - p)); ctx.restore();
      }
      drawScene(cur, d.t, T, sceneFade);
      setAccent(cur.L.sch.bg === NIGHT ? MINT : cur.L.sch.ink);
    },
  });
})();
