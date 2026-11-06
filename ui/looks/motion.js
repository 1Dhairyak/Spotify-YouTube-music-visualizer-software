// Look 7: Motion (from a playlist of After Effects text animations). White type on black or navy; each lyric line gets
// one of 39 effects, picked so none comes back soon. Letters move as their word is sung. Press E to step through the
// effects by number (Shift+E goes back; past the last one returns to random). Emotional songs use only the gentle ones.
// A line never just sits there: once it's been sung it plays again, over and over, until the next line. Each effect gets three plays.
(() => {
  const BOLD = px => `900 ${px}px Montserrat, "Segoe UI", sans-serif`, THIN = px => `200 ${px}px Montserrat, "Segoe UI", sans-serif`;
  const PEN = px => `700 ${px}px Caveat, cursive`;
  const LAV = [185, 174, 255], WHITE = [255, 255, 255], PINK = '#F0148C';
  const mixRGB = (a, b, f) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(',')})`;
  const nz = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };   // 0..1, stable for its inputs
  const bounceOut = p => { p = clamp(p, 0, 1); const n = 7.5625, d = 2.75; return p < 1 / d ? n * p * p : p < 2 / d ? n * (p -= 1.5 / d) * p + 0.75 : p < 2.5 / d ? n * (p -= 2.25 / d) * p + 0.9375 : n * (p -= 2.625 / d) * p + 0.984375; };

  // ---------- layout: every effect works on pieces (letters, or whole words in joined scripts) ----------
  function rowAt(ws, font, px, cx, y, r, o, row = 0) {
    const f = font(px), track = (o.track || 0) * px;
    ctx.font = f;
    const sp = ctx.measureText(' ').width + track;
    const parts = ws.map(wd => {
      const ps = splitText(o.caps ? caps(wd.w) : wd.w).map(s => ({ s, w: ctx.measureText(s).width + track }));
      return { wd, ps, w: ps.reduce((a, b) => a + b.w, 0) };
    });
    const total = parts.reduce((a, b) => a + b.w, 0) + sp * (parts.length - 1);
    let x = cx - total / 2;
    const out = [];
    parts.forEach((p, wi) => {
      p.ps.forEach((q, k) => { out.push({ s: q.s, x: x + q.w / 2, y, w: q.w, px, wd: p.wd, k, n: p.ps.length, wi, r: r(), row, cx, font: f }); x += q.w; });
      x += sp;
    });
    return { g: out, w: total, s: ws.map(w => (o.caps ? caps(w.w) : w.w)).join(' '), cx, y, px, x0: cx - total / 2, ws, font: f };
  }
  function balance(ws, nl) {   // nl rows of about equal length
    const rows = [], total = ws.reduce((a, w) => a + w.w.length + 1, 0);
    let cur = [], len = 0;
    ws.forEach((w, i) => {
      cur.push(w); len += w.w.length + 1;
      if (rows.length < nl - 1 && len >= total / nl * (rows.length + 1) && ws.length - i - 1 >= nl - rows.length - 1) { rows.push(cur); cur = []; }
    });
    if (cur.length) rows.push(cur);
    return rows;
  }
  const widthAt100 = (ws, font, o) => {
    const s = ws.map(w => (o.caps ? caps(w.w) : w.w)).join(' ');
    return textW(s, font(100)) + (o.track || 0) * 100 * s.length;
  };
  function timing(g, words) {   // when each piece starts: its word's time, then letter by letter within the word
    g.forEach(p => {
      const i = words.indexOf(p.wd), gap = (i + 1 < words.length ? words[i + 1].t : p.wd.t + 0.5) - p.wd.t;
      p.t0 = p.wd.t - 0.08 + p.k * Math.min(0.05, Math.max(0.012, gap / (p.n + 1)));
    });
    return g;
  }
  function arrange(ws, r, o = {}) {   // fills the stage: as many rows as give the largest type
    const S = stage(), font = o.font || BOLD, lh = o.lh || 1.04, maxW = S.w * (o.w || 0.8), maxH = S.h * (o.h || 0.62), cap = o.cap || S.h * 0.2;
    let best = null;
    for (let nl = o.minLines || 1; nl <= Math.min(o.maxLines || 4, ws.length); nl++) {
      const rows = balance(ws, nl), widest = Math.max(...rows.map(rw => widthAt100(rw, font, o)));
      const px = Math.min(100 * maxW / widest, cap, maxH / (rows.length * lh));
      if (!best || px > best.px * 1.04) best = { rows, px };
    }
    const { rows, px } = best, y0 = (o.cy ?? S.cy) - (rows.length - 1) * lh * px / 2 + px * 0.35, cx = o.cx ?? S.cx;
    const R = rows.map((rw, i) => rowAt(rw, font, px, cx + (o.stair || 0) * (i - (rows.length - 1) / 2), y0 + i * lh * px, r, o, i));
    const g = timing(R.flatMap(x => x.g), ws);
    R.forEach(x => { x.t0 = x.ws[0].t - 0.1; });
    return { g, rows: R, px, font: R[0].font };
  }
  function groups(ws, r, o = {}) {   // one or two words at a time, each group alone in the middle of the screen
    const S = stage(), font = o.font || BOLD, out = [];
    for (let i = 0; i < ws.length;) {
      const take = i + 1 < ws.length && (ws[i].w + ws[i + 1].w).length <= 9 ? 2 : 1, rw = ws.slice(i, i += take);
      const px = Math.min(S.h * (o.cap || 0.17), 100 * S.w * 0.74 / widthAt100(rw, font, o));
      const row = rowAt(rw, font, px, S.cx, S.cy + px * 0.35, r, o);
      out.push({ ...row, t0: rw[0].t - 0.08 });
    }
    out.forEach((c, i) => { c.until = i + 1 < out.length ? out[i + 1].t0 : Infinity; });
    return { groups: out };
  }
  const bandAlpha = (wd, t) => 0.28 + 0.72 * sung(wd, t, 0.2);   // whole lines stay readable and light up as they're sung

  // ---------- drawing one piece ----------
  const NO = {};
  function put(p, a, o = NO) {
    if (a <= 0.004) return;
    const x = p.x + (o.dx || 0), y = p.y - p.px * 0.35 + (o.dy || 0);
    ctx.save();
    warp(x, y);
    if (mouse.inside) hitWord(p.wd, tNow, x, y, p.px);
    if (p.wd && clickPops.size && clickPops.has(p.wd.w + p.wd.t)) punchAt(p.wd, tNow, x, y, p.px);
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    if (o.sx !== undefined || o.sy !== undefined) ctx.scale(o.sx ?? 1, o.sy ?? 1);
    ctx.globalAlpha = a;
    if (o.color) ctx.fillStyle = o.color;
    ctx.fillText(p.s, 0, p.px * 0.35);
    ctx.restore();
  }
  function smear(p, a, o, dx, dy, amt) {   // motion blur: faint copies back along the way it came
    if (amt > 0.03) for (let k = 3; k > 0; k--) put(p, a * 0.16 * amt, { ...o, dx: (o.dx || 0) + dx * k / 3, dy: (o.dy || 0) + dy * k / 3 });
    put(p, a, o);
  }
  let tNow = 0;

  // A small set of ways for a copy of the text to arrive, shared by the many-copies effects.
  function arrive(p, v, t, a) {
    const P = (d, off = 0) => clamp((t - p.t0 - off) / d, 0, 1), u = p.px;
    if (v === 'pop') { const e = backOut(P(0.3)); if (e > 0) put(p, a, { sx: e, sy: e }); }
    else if (v === 'rise') { const e = easeOut(P(0.5, p.r * 0.2)); smear(p, a * Math.min(1, e * 2), { dy: (1 - e) * u * 0.8 }, 0, u * 0.5 * (1 - e), 1 - e); }
    else if (v === 'cascade') { const e = easeOut(P(0.4)); smear(p, a * e, { dx: (1 - e) * u * 0.35, dy: (1 - e) * u * 0.35 }, u * 0.3 * (1 - e), u * 0.3 * (1 - e), 1 - e); }
    else if (v === 'track') { const e = easeOut(P(0.5)); put(p, a * e, { dx: (p.x - p.cx) * 0.3 * (1 - e) }); }
    else if (v === 'drop') { const e = easeOut(P(0.35)); put(p, a * e, { dy: -(1 - e) * u * 0.7 }); }
    else if (v === 'focus') {
      const e = P(0.5, p.r * 0.35);
      if (e > 0) { drawHalo(p.s, THIN === p.fontFn ? THIN : BOLD, p.px, '#FFFFFF', 12, p.x, p.y, 'center', 'alphabetic', a * (1 - e) * Math.min(1, e * 5)); put(p, a * e * e); }
    }
    else put(p, a * P(0.3, p.r * 0.4));
  }

  // ---------- the effects (numbers as in the list agreed with the user) ----------
  const ctxText = (s, x, y) => ctx.fillText(s, x, y);
  function maskRows(L, t, a) {   // rows rise out from behind an invisible line below them
    for (const R of L.rows) {
      const e = backOut(clamp((t - R.t0) / 0.5, 0, 1));
      if (t < R.t0) continue;
      ctx.save(); ctx.beginPath(); ctx.rect(-50, R.y - R.px * 1.25, W + 100, R.px * 1.25 + R.px * 0.12); ctx.clip();
      ctx.globalAlpha = a; ctx.textAlign = 'center'; ctxText(R.s, R.cx, R.y + (1 - e) * R.px * 1.15);
      ctx.restore();
      for (const p of R.g) if (mouse.inside) hitWord(p.wd, tNow, p.x, p.y - p.px * 0.35, p.px);
    }
  }
  function groupDraw(L, t, a, fn) {   // the group being sung, with its age
    const c = L.groups.filter(g => t >= g.t0).pop();
    if (c) { ctx.font = c.font; fn(c, t - c.t0, a); }
  }
  function groupBody(c, a) { c.g.forEach(p => put(p, a)); }

  const EFFECTS = [
    { n: 1, name: 'Endless bounce', fit: n => n <= 6, setup: (ph, r) => arrange(ph.words, r, { cap: stage().h * 0.2 }),
      draw(L, t, T, a) { for (const p of L.g) { const e = clamp((t - p.t0) / 0.25, 0, 1); if (e > 0) put(p, a * e, { dy: Math.sin(T * 5.5 - p.x * 0.018) * p.px * 0.16 * e }); } } },
    { n: 2, name: 'Random fade', gentle: true, ownExit: true, setup: (ph, r) => arrange(ph.words, r),
      draw(L, t, T, a, sc, q) { for (const p of L.g) put(p, a * clamp((t - p.t0 - p.r * 0.45) / 0.3, 0, 1) * (1 - clamp(q * 2 - p.r, 0, 1))); } },
    { n: 3, name: 'Random rise', setup: (ph, r) => arrange(ph.words, r),
      draw(L, t, T, a) { for (const p of L.g) { const e = easeOut((t - p.t0 - p.r * 0.3) / 0.7); if (e > 0) put(p, a * Math.min(1, e * 1.6), { dy: (1 - e) * p.px * (0.9 + p.r * 2.3) }); } } },
    { n: 4, name: 'Stretch pop', setup: (ph, r) => groups(ph.words, r, { caps: true }),
      draw(L, t, T, a) {
        groupDraw(L, t, a, (c, age, A) => {
          const e = easeOut(age / 0.16), S = stage();
          for (let k = age < 0.22 ? 2 : 0; k >= 0; k--) {
            ctx.save(); ctx.translate(S.cx, 0); ctx.scale((0.12 + 0.88 * e) * (1 + k * 0.1 * (1 - e)), 1); ctx.translate(-S.cx, 0);
            groupBody(c, A * (k ? 0.25 : Math.min(1, age * 14))); ctx.restore();
          }
        });
      } },
    { n: 5, name: 'Mirror', gentle: true, fit: (n, ch) => n <= 6 && ch <= 30, setup: (ph, r) => arrange(ph.words, r, { font: THIN, caps: true, maxLines: 1, w: 0.82, cap: stage().h * 0.22 }),
      draw(L, t, T, a, sc) {
        const e = easeOut((T - sc.at) / 0.55);
        for (const R of L.rows) {
          const base = R.y;
          ctx.save(); ctx.translate(0, base); ctx.scale(1, Math.max(0.01, e)); ctx.translate(0, -base);
          for (const p of R.g) put(p, a * bandAlpha(p.wd, t));
          ctx.restore();
          ctx.save(); ctx.translate(0, base + R.px * 0.04); ctx.scale(1, -0.85 * e);
          const G = ctx.createLinearGradient(0, 0, 0, -R.px * 0.8);
          G.addColorStop(0, 'rgba(255,255,255,0.5)'); G.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = G; ctx.globalAlpha = a;
          for (const p of R.g) ctx.fillText(p.s, p.x, 0);
          ctx.restore();
        }
      } },
    { n: 6, name: 'Stretch melt', fit: (n, ch) => n <= 3 && ch <= 13, bg: 'navy',
      setup: (ph, r) => ({ ...arrange(ph.words, r, { caps: true, maxLines: 1, w: 0.6, cap: stage().h * 0.2 }), seed: r() * 100 }),
      draw(L, t, T, a, sc) {
        const R = L.rows[0], img = textImage(R.s, R.font, { fill: '#FFFFFF' }), { pad, asc, desc, w, d } = img.meta, S = stage();
        let amp = S.h * 0.7 * (1 - easeOut((T - sc.at) / 0.95)), down = false;
        sc.ph.words.forEach((wd, i) => { const u = t - wd.t; if (u > 0 && u < 0.65 && i) { const v = Math.sin(Math.PI * u / 0.65) ** 2 * S.h * 0.5; if (v > amp) { amp = v; down = i % 2 === 1; } } });
        const left = R.cx - w / 2 - pad, top = R.y - asc - pad, H0 = img.height / d, W0 = img.width / d, cut = pad + asc * (down ? 0.58 : 0.5);
        ctx.globalAlpha = a; drawHalo(R.s, BOLD, R.px, '#8A90FF', 26, R.cx, R.y, 'center', 'alphabetic', a * 0.5);
        ctx.globalAlpha = a;
        if (amp < 1.5) { ctx.drawImage(img, left, top, W0, H0); return; }
        const cw = 3;
        for (let x = 0; x < W0; x += cw) {
          const n = 0.5 + 0.28 * Math.sin(x * 0.045 + L.seed) + 0.22 * Math.sin(x * 0.13 + L.seed * 2), A = amp * clamp(n, 0.25, 1), wob = v => Math.sin(v * 0.012 + T * 4 + x * 0.01) * amp * 0.018;
          const seg = 5;
          if (down) {
            ctx.drawImage(img, x * d, 0, cw * d, cut * d, left + x, top, cw + 0.5, cut);
            for (let k = 0; k < seg; k++) ctx.drawImage(img, x * d, (cut + (H0 - cut) * k / seg) * d, cw * d, (H0 - cut) / seg * d, left + x + wob(k * A / seg), top + cut + (H0 - cut + A) * k / seg, cw + 0.5, (H0 - cut + A) / seg + 0.5);
          } else {
            ctx.drawImage(img, x * d, cut * d, cw * d, (H0 - cut) * d, left + x, top + cut, cw + 0.5, H0 - cut);
            for (let k = 0; k < seg; k++) ctx.drawImage(img, x * d, cut * k / seg * d, cw * d, cut / seg * d, left + x + wob(k * A / seg), top - A + (cut + A) * k / seg, cw + 0.5, (cut + A) / seg + 0.5);
          }
        }
        for (const p of R.g) if (mouse.inside) hitWord(p.wd, tNow, p.x, p.y - p.px * 0.35, p.px);
      } },
    { n: 7, name: 'Flicker', setup: (ph, r) => arrange(ph.words, r, { caps: true }),
      draw(L, t, T, a) {
        const f = Math.floor(T * 15);
        for (const p of L.g) {
          const u = t - p.t0, v = nz(p.x, f);
          put(p, a * (u < 0 ? (v < 0.3 ? 0.08 : 0.2) : u < 0.8 ? (v < 0.45 ? 0.25 : 1) : v < 0.05 ? 0.45 : 1));
        }
      } },
    { n: 8, name: 'Smooth cascade', setup: (ph, r) => arrange(ph.words, r), draw(L, t, T, a) { for (const p of L.g) arrive(p, 'cascade', t, a); } },
    { n: 9, name: 'Snappy', setup: (ph, r) => arrange(ph.words, r, { caps: true, maxLines: 3, lh: 0.92 }),
      draw(L, t, T, a) {
        for (const p of L.g) {
          const u = clamp((t - p.t0) / 0.2, 0, 1), e = 1 - (1 - u) ** 5;
          if (u <= 0) continue;
          const side = p.k % 3 === 2, dx = side ? (1 - e) * p.px * 0.6 : 0, dy = side ? 0 : (1 - e) * p.px * 0.8;
          smear(p, a * Math.min(1, u * 3), { dx, dy }, dx * 0.8, dy * 0.8, 1 - e);
        }
      } },
    { n: 10, name: 'Cinematic 3D title', bg: 'black', cinematic: true, setup: (ph, r) => arrange(ph.words, r, { track: 0.03, maxLines: 3 }),
      draw(L, t, T, a) {
        for (const p of L.g) {
          const e = easeOut((t - p.t0 - p.r * 0.25) / 0.9), turn = (1 - e) * (p.r - 0.5) * 3.4;
          if (e <= 0) continue;
          put(p, a * Math.min(1, e * 2.5), { sx: Math.max(0.1, Math.abs(Math.cos(turn))), rot: (1 - e) * (nz(p.x, 3) - 0.5) * 1.1, dx: (p.x - p.cx) * 0.18 * (1 - e), color: mixRGB(LAV, WHITE, e * e) });
        }
      } },
    { n: 11, name: 'Chunky 3D text', fit: (n, ch) => n <= 4 && ch <= 16, bg: 'magenta', setup: (ph, r) => ({ ...arrange(ph.words, r, { caps: true, maxLines: 2, w: 0.66, cap: stage().h * 0.3, lh: 0.92 }), hue: r() < 0.5 }),
      draw(L, t, T, a) {
        const S = stage(), ang = 0.8 + Math.sin(T * 0.7) * 0.6, dx = Math.cos(ang), dy = Math.sin(ang);
        ctx.save(); ctx.translate(S.cx, S.cy); ctx.transform(1, Math.sin(T * 0.5) * 0.07, -0.1 + Math.sin(T * 0.7) * 0.12, 1, 0, 0); ctx.translate(-S.cx, -S.cy);
        for (const p of L.g) {
          const u = clamp((t - p.t0) / 0.5, 0, 1), e = backOut(u);
          if (u <= 0) continue;
          ctx.save(); ctx.translate(p.x, p.y - p.px * 0.35); ctx.rotate((1 - e) * (p.r - 0.5) * 2.4); ctx.scale(e, e); ctx.globalAlpha = a;
          const depth = p.px * 0.13, base = p.px * 0.35;
          for (let k = depth; k > 0; k -= 1.6) { ctx.fillStyle = L.hue ? `hsl(${(T * 40 + p.x * 0.2) % 360} 85% ${Math.round(38 - 16 * k / depth)}%)` : `rgb(${150 - 90 * k / depth | 0},20,${110 - 40 * k / depth | 0})`; ctx.fillText(p.s, dx * k, base + dy * k); }
          const G = ctx.createLinearGradient(0, -p.px * 0.5, 0, p.px * 0.45);
          if (L.hue) { const h = (T * 40 + p.x * 0.2) % 360; G.addColorStop(0, `hsl(${h} 100% 62%)`); G.addColorStop(1, `hsl(${(h + 60) % 360} 100% 58%)`); }
          else { G.addColorStop(0, '#FF49C8'); G.addColorStop(0.55, '#FF1FA8'); G.addColorStop(1, '#FF8A3C'); }
          ctx.fillStyle = G; ctx.fillText(p.s, 0, base);
          ctx.restore();
          if (mouse.inside) hitWord(p.wd, tNow, p.x, p.y - p.px * 0.35, p.px);
        }
        ctx.restore();
      } },
    { n: 12, name: 'Character pop', setup: (ph, r) => arrange(ph.words, r), draw(L, t, T, a) { for (const p of L.g) { const u = clamp((t - p.t0) / 0.32, 0, 1); if (u > 0) { const e = backOut(u); put(p, a, { sx: e, sy: e, dx: (p.x - p.cx) * 0.22 * (1 - easeOut(u)) }); } } } },
    { n: 13, name: 'Shake', setup: (ph, r) => arrange(ph.words, r, { caps: true, minLines: Math.min(2, ph.words.length), lh: 1.6 }),
      draw(L, t, T, a) {
        const f = Math.floor(T * 16);
        for (const p of L.g) {
          const u = t - p.t0;
          if (u < 0) continue;
          const amp = p.px * (0.03 + 0.1 * Math.exp(-u * 2.2)), A = a * Math.min(1, u * 8);
          if (p.wi % 2 === 0) { const jx = (nz(p.wi, f) - 0.5) * amp * 1.6, jy = (nz(p.wi + 9, f) - 0.5) * amp * 1.6; smear(p, A, { dx: jx, dy: jy }, 0, amp * 1.4, 1); }
          else put(p, A, { dx: (nz(p.x, f) - 0.5) * amp, dy: (nz(p.x + 5, f) - 0.5) * amp * 2.4, rot: (nz(p.x + 7, f) - 0.5) * 0.28 });
        }
      } },
    { n: 14, name: 'Flip', bg: 'glow', setup: (ph, r) => arrange(ph.words, r),
      draw(L, t, T, a) { for (const p of L.g) { const u = clamp((t - p.t0) / 0.5, 0, 1); if (u > 0) { const e = easeOut(u); put(p, a * Math.min(1, u * 3), { sy: Math.max(0.03, Math.cos((1 - e) * Math.PI / 2)), color: mixRGB(LAV, WHITE, e * e) }); } } } },
    { n: 15, name: 'Jump', fit: (n, ch) => n <= 3 && ch <= 14, bg: 'navy', setup: (ph, r) => arrange(ph.words, r, { caps: true, maxLines: 1, w: 0.6, cap: stage().h * 0.26 }),
      draw(L, t, T, a) {
        for (const p of L.g) {
          const u = clamp((t - p.t0 + 0.15) / 0.42, 0, 1); if (u <= 0) continue;
          const e = backOut(u), side = p.k % 4, horiz = side % 2 === 0, far = (horiz ? W : H) * 0.75 * (side < 2 ? -1 : 1), off = (1 - e) * far, st = 1 + 1.6 * (1 - easeOut(u));
          put(p, a, horiz ? { dx: off, sx: st, sy: 1 / Math.sqrt(st) } : { dy: off, sy: st, sx: 1 / Math.sqrt(st) });
        }
      } },
    { n: 16, name: 'Expand', gentle: true, bg: 'glow', setup: (ph, r) => arrange(ph.words, r, { caps: true, w: 0.6 }),
      draw(L, t, T, a, sc) { const e = easeOut(clamp((t - sc.ph.t0) / Math.max(1.5, sc.ph.t1 - sc.ph.t0), 0, 1)); for (const p of L.g) put(p, a * bandAlpha(p.wd, t), { dx: (p.x - p.cx) * 0.24 * e }); } },
    { n: 17, name: 'Slice', fit: (n, ch) => n <= 5 && ch <= 22, bg: 'glow', setup: (ph, r) => arrange(ph.words, r, { caps: true, maxLines: 2, w: 0.66, cap: stage().h * 0.2 }),
      draw(L, t, T, a, sc) {
        const S = stage(), e = easeOut(((T - sc.at) - 0.12) / 0.4);
        ctx.save(); ctx.translate(S.cx, S.cy); ctx.rotate(-0.14); ctx.translate(-S.cx, -S.cy);
        for (const R of L.rows) {
          const mid = R.y - R.px * 0.36, A = a * clamp((T - sc.at) * 8, 0, 1) * bandAlpha(R.ws[R.ws.length - 1], t + 0.4), shift = R.px * 0.2 * e;
          ctx.globalAlpha = A; ctx.textAlign = 'center';
          ctx.save(); ctx.beginPath(); ctx.rect(-W, mid - R.px, W * 3, R.px); ctx.clip(); ctx.fillStyle = '#FFF'; ctx.fillText(R.s, R.cx, R.y); ctx.restore();
          ctx.save(); ctx.beginPath(); ctx.rect(-W, mid, W * 3, R.px); ctx.clip();
          const G = ctx.createLinearGradient(0, mid, 0, mid + R.px * 0.45); G.addColorStop(0, '#F5F5FF'); G.addColorStop(1, '#6E6E80');
          ctx.fillStyle = G; ctx.fillText(R.s, R.cx - shift, R.y); ctx.restore();
          for (const p of R.g) if (mouse.inside) hitWord(p.wd, tNow, p.x, p.y - p.px * 0.35, p.px);
        }
        ctx.restore();
      } },
    { n: 18, name: 'Scroll split', fit: (n, ch) => n <= 4 && ch <= 16, bg: 'navy', setup: (ph, r) => arrange(ph.words, r, { caps: true, maxLines: 1, w: 0.68, cap: stage().h * 0.2 }),
      draw(L, t, T, a, sc) {
        const R = L.rows[0], age = T - sc.at, mid = R.y - R.px * 0.36, sp = R.px * 0.86;
        const roll = 3 * (1 - easeInOut(clamp(age / 1.3, 0, 1))), f = roll - Math.floor(roll), off = f * sp;
        ctx.globalAlpha = a; ctx.textAlign = 'center';
        for (const [top, sign] of [[true, 1], [false, -1]]) {
          ctx.save(); ctx.beginPath(); ctx.rect(-50, top ? mid - R.px * 0.5 : mid, W + 100, R.px * 0.5); ctx.clip();
          for (const k of [-1, 0, 1]) ctx.fillText(R.s, R.cx, R.y + sign * (off + k * sp));
          ctx.restore();
        }
        for (const p of R.g) if (mouse.inside) hitWord(p.wd, tNow, p.x, p.y - p.px * 0.35, p.px);
      } },
    { n: 19, name: 'Mask reveal', gentle: true, bg: 'glow', fit: n => n <= 5, setup: (ph, r) => arrange(ph.words, r, { caps: true, maxLines: 1, w: 0.7, cap: stage().h * 0.2 }), draw(L, t, T, a) { maskRows(L, t, a); } },
    { n: 20, name: 'Squash and stretch', setup: (ph, r) => arrange(ph.words, r, { maxLines: 3 }),
      draw(L, t, T, a) {
        for (const p of L.g) {
          const u = t - p.t0; if (u < 0) continue;
          const sy = u < 0.12 ? 0.2 + 1.5 * u / 0.12 : 1 + 0.7 * Math.exp(-7 * (u - 0.12)) * Math.cos(18 * (u - 0.12));
          put(p, a * Math.min(1, u * 9), { sy, sx: 1 / Math.sqrt(Math.max(0.3, sy)), dy: -(sy - 1) * p.px * 0.35 });
        }
      } },
    { n: 21, name: 'Drop bounce', bg: 'navy', setup: (ph, r) => arrange(ph.words, r),
      draw(L, t, T, a) { for (const p of L.g) { const u = clamp((t - p.t0) / 0.6, 0, 1); if (u > 0) { const e = bounceOut(u), side = p.k % 2 ? 1 : -1, dy = side * (1 - e) * p.px * 1.3; smear(p, a * Math.min(1, u * 6), { dy }, 0, dy * 0.5, u < 0.35 ? 1 : 0); } } } },
    { n: 22, name: 'Float and shake', bg: 'glow', fit: (n, ch) => n >= 2 && n <= 6 && ch <= 26,
      setup(ph, r) {
        const S = stage(), half = Math.ceil(ph.words.length / 2), a = ph.words.slice(0, half), b = ph.words.slice(half), o = { caps: true };
        const px = Math.min(S.h * 0.14, 100 * S.w * 0.4 / Math.max(widthAt100(a, BOLD, o), widthAt100(b, BOLD, o)));
        const A = rowAt(a, BOLD, px, S.cx - S.w * 0.235, S.cy + px * 0.35, r, o), B = rowAt(b, BOLD, px, S.cx + S.w * 0.235, S.cy + px * 0.35, r, o);
        return { A: timing(A.g, ph.words), B: timing(B.g, ph.words), font: A.font };
      },
      draw(L, t, T, a, sc) {
        const S = stage(), e = easeOut((T - sc.at) / 0.5), f = Math.floor(T * 18);
        ctx.globalAlpha = a * 0.9; ctx.fillStyle = '#FFF'; ctx.fillRect(S.cx - 0.75, S.cy - (S.h / 2 + 40) * e, 1.5, (S.h + 80) * e);
        for (const p of L.A) put(p, a * bandAlpha(p.wd, t), { dx: Math.sin(T * 1.7) * p.px * 0.09, dy: Math.sin(T * 2.3) * p.px * 0.11 });
        const jx = (nz(1, f) - 0.5) * L.B[0]?.px * 0.07, jy = (nz(2, f) - 0.5) * (L.B[0]?.px || 0) * 0.09;
        for (const p of L.B) put(p, a * bandAlpha(p.wd, t), { dx: jx, dy: jy });
      } },
    { n: 23, name: 'Four-way stagger', fit: (n, ch) => n <= 3 && ch <= 13, bg: 'navy',
      setup(ph, r) {
        const S = stage(), ws = ph.words, px = Math.min(S.h * 0.15, 100 * S.w * 0.4 / widthAt100(ws, BOLD, {}));
        const sets = [[-1, -1, 'cascade'], [1, -1, 'rise'], [-1, 1, 'fade'], [1, 1, 'track']].map(([sx, sy, v]) => ({ v, g: timing(rowAt(ws, BOLD, px, S.cx + sx * S.w * 0.225, S.cy + sy * px * 1.05 + px * 0.35, r, {}).g, ws) }));
        return { sets, font: BOLD(px) };
      },
      draw(L, t, T, a) { for (const s of L.sets) for (const p of s.g) arrive(p, s.v, t, a); } },
    { n: 24, name: 'Split stack', fit: (n, ch) => n >= 2 && ch <= 28, setup(ph, r) {
        const S = stage(), ws = ph.words, third = Math.ceil(ws.length / 3), parts = ws.length < 3 ? ws.map(w => [w]) : [ws.slice(0, third), ws.slice(third, third * 2), ws.slice(third * 2)].filter(x => x.length);
        const px0 = Math.min(S.h * 0.17, 100 * S.w * 0.62 / widthAt100(parts[0], BOLD, { caps: true }));
        const items = parts.map((p, i) => { const px = i ? Math.min(px0 * 0.94, 100 * S.w * 0.58 / widthAt100(p, BOLD, { caps: true })) : px0; return { ...rowAt(p, BOLD, px, S.cx, S.cy + px * 0.35, r, { caps: true }), t0: p[0].t - 0.06, color: i === 1 ? PINK : '#FFF' }; });
        return { items, font: items[0].font };
      },
      draw(L, t, T, a) {
        const S = stage();
        ctx.save(); ctx.translate(S.cx, S.cy); ctx.transform(1, -0.1, -0.16, 1, 0, 0); ctx.translate(-S.cx, -S.cy); ctx.textAlign = 'center';
        L.items.forEach((it, i) => {
          if (t < it.t0) return;
          const later = L.items.slice(i + 1).reduce((v, nx, k) => v + (k ? 0.55 : 1) * easeOut((t - nx.t0) / 0.28), 0), open = later * it.px * 0.5;
          const show = i ? easeOut((t - it.t0) / 0.22) : easeOut((t - it.t0) / 0.3), mid = S.cy, h = it.px * 0.5 * (i ? show : 1);
          ctx.font = it.font; ctx.fillStyle = it.color; ctx.globalAlpha = a * (i ? 1 : show);
          const x = i ? it.cx + (1 - show) * it.px * 0.25 : it.cx;
          ctx.save(); ctx.beginPath(); ctx.rect(-W, mid - h - open, W * 3, h); ctx.clip(); ctx.fillText(it.s, x, it.y - open); ctx.restore();
          ctx.save(); ctx.beginPath(); ctx.rect(-W, mid + open, W * 3, h); ctx.clip(); ctx.fillText(it.s, x, it.y + open); ctx.restore();
          for (const p of it.g) if (mouse.inside) hitWord(p.wd, tNow, p.x, mid, p.px);
        });
        ctx.restore();
      } },
    { n: 25, name: 'Line by line', gentle: true, bg: 'glow', fit: n => n >= 3, setup: (ph, r) => arrange(ph.words, r, { caps: true, minLines: Math.min(3, ph.words.length), maxLines: 3, w: 0.6, lh: 0.98 }), draw(L, t, T, a) { maskRows(L, t, a); } },
    { n: 26, name: 'Wiggle', fit: n => n >= 2, setup: (ph, r) => arrange(ph.words, r, { minLines: Math.min(3, ph.words.length), maxLines: 3, w: 0.56, lh: 1.25, stair: stage().w * 0.13 }),
      draw(L, t, T, a) { for (const p of L.g) { const ph2 = p.x * 0.012 + T * 5 + p.row, A = p.px * 0.09 * (0.45 + 0.55 * Math.sin(T * 0.9 + p.row * 1.4)); put(p, a * bandAlpha(p.wd, t), { dy: Math.sin(ph2) * A, rot: Math.cos(ph2) * 0.09, sx: 1 + Math.sin(ph2 * 1.3) * 0.05 }); } } },
    { n: 27, name: 'Neon', gentle: true, bg: 'black', neon: true, setup: (ph, r) => ({ ...arrange(ph.words, r, { font: THIN, caps: true, maxLines: 2, cap: stage().h * 0.22, lh: 1.05 }), color: NEON[ph.i % NEON.length] }),
      draw(L, t, T, a, sc) {
        const age = T - sc.at, on = age < 0.45 ? (nz(3, Math.floor(T * 20)) < 0.4 ? 0.2 : 1) : 1;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const R of L.rows) { drawHalo(R.s, THIN, R.px, L.color, 22, R.cx, R.y, 'center', 'alphabetic', a * 0.95 * on); drawHalo(R.s, THIN, R.px, L.color, 9, R.cx, R.y, 'center', 'alphabetic', a * on); }
        ctx.restore();
        for (const p of L.g) put(p, a * on * bandAlpha(p.wd, t), { color: mixRGB(WHITE, L.rgb || WHITE, 0.15) });
      } },
    { n: 28, name: 'Cursor wipe', bg: 'glow', fit: (n, ch) => n <= 6 && ch <= 30, setup: (ph, r) => arrange(ph.words, r, { caps: true, maxLines: 1, w: 0.72, cap: stage().h * 0.15 }),
      draw(L, t, T, a, sc) {
        const R = L.rows[0], age = T - sc.at, ws = R.ws, left = R.x0, right = R.x0 + R.w;
        const starts = ws.map(w => R.g.find(p => p.wd === w).x - R.g.find(p => p.wd === w).w / 2).concat(right);
        let i = ws.findLastIndex(w => w.t <= t), x = left;
        if (i >= 0) { const nx = i + 1 < ws.length ? ws[i + 1].t : ws[i].t + 0.4; x = lerp(starts[i], starts[i + 1], clamp((t - ws[i].t) / Math.max(0.05, Math.min(0.6, nx - ws[i].t)), 0, 1)); }
        ctx.save(); ctx.beginPath(); ctx.rect(left - 4, R.y - R.px * 1.2, Math.max(0, x - left + 4), R.px * 1.7); ctx.clip();
        for (const p of R.g) put(p, a);
        ctx.restore();
        const h = R.px * 0.82 * easeOut(age / 0.25), blink = x >= right - 1 ? (Math.sin(T * 7) > 0 ? 1 : 0.25) : 1;
        ctx.globalAlpha = a * blink; ctx.fillStyle = '#FFF'; ctx.fillRect(x + R.px * 0.06, R.y - R.px * 0.36 - h / 2, Math.max(2, R.px * 0.09), h);
      } },
    { n: 29, name: 'Zoom settle', setup: (ph, r) => groups(ph.words, r, { caps: true }),
      draw(L, t, T, a) {
        groupDraw(L, t, a, (c, age, A) => {
          const e = easeOut(age / 0.28), S = stage(), cy = c.y - c.px * 0.35;
          for (let k = age < 0.2 ? 2 : 0; k >= 0; k--) {
            const s = 1 + (0.32 + k * 0.1) * (1 - e);
            ctx.save(); ctx.translate(S.cx, cy); ctx.scale(s, s); ctx.translate(-S.cx, -cy); groupBody(c, A * (k ? 0.18 : 1)); ctx.restore();
          }
        });
      } },
    { n: 30, name: 'Echo grid', fit: (n, ch) => n <= 2 && ch <= 11, bg: 'glow',
      setup(ph, r) {
        const S = stage(), ws = ph.words, px = Math.min(S.h * 0.15, 100 * S.w * 0.4 / widthAt100(ws, BOLD, {}));
        const sets = [[-1, -1, 'cascade'], [1, -1, 'pop'], [0, 0, 'focus'], [-1, 1, 'fade'], [1, 1, 'rise']].map(([sx, sy, v]) => ({ v, g: timing(rowAt(ws, BOLD, px, S.cx + sx * S.w * 0.225, S.cy + sy * px * 1.15 + px * 0.35, r, {}).g, ws) }));
        return { sets, font: BOLD(px) };
      },
      draw(L, t, T, a) { for (const s of L.sets) for (const p of s.g) arrive(p, s.v, t, a); } },
    { n: 31, name: 'Light stroke', fit: (n, ch) => ch <= 20, bg: 'navy', setup: (ph, r) => arrange(ph.words, r, { caps: true, maxLines: 2, w: 0.66, cap: stage().h * 0.2 }),
      draw(L, t, T, a) {
        ctx.strokeStyle = '#FFF'; ctx.lineWidth = Math.max(1.2, L.px * 0.016); ctx.lineJoin = 'round';
        for (const p of L.g) {
          const e = clamp((t - p.t0) / 0.9, 0, 1); if (e <= 0) continue;
          const len = p.px * 7, x0 = p.x - p.w / 2, y0 = p.y - p.px * 0.72, w = p.w * 0.9, h = p.px * 0.72;
          ctx.globalAlpha = a; ctx.save(); ctx.setLineDash([len * easeOut(e), len]); ctx.textAlign = 'center'; ctx.strokeText(p.s, p.x, p.y); ctx.restore();
          if (mouse.inside) hitWord(p.wd, tNow, p.x, p.y - p.px * 0.35, p.px);
          for (const off of [0, 0.5]) {   // sparks running round the letter
            const v = (e * 1.5 + T * 0.13 + p.r + off) % 1, per = 2 * (w + h), s = v * per;
            const sx = s < w ? x0 + s : s < w + h ? x0 + w : s < 2 * w + h ? x0 + w - (s - w - h) : x0, sy = s < w ? y0 : s < w + h ? y0 + (s - w) : s < 2 * w + h ? y0 + h : y0 + h - (s - 2 * w - h);
            const fade = e < 1 ? 1 : 0.55;
            glowAt(sx, sy, p.px * 0.2, 'rgb(120,130,255)', a * 0.8 * fade); glowAt(sx, sy, p.px * 0.06, '#FFFFFF', a * fade);
          }
        }
      } },
    { n: 32, name: 'Handwriting', fit: n => n <= 8, bg: 'navy', setup: (ph, r) => arrange(ph.words, r, { font: PEN, maxLines: 3, cap: stage().h * 0.3, lh: 1.05 }),
      draw(L, t, T, a) {
        ctx.strokeStyle = '#FFF'; ctx.lineWidth = L.px * 0.012; ctx.lineJoin = 'round';
        for (const p of L.g) {
          const e = clamp((t - p.t0) / 0.2, 0, 1); if (e <= 0) continue;
          const x0 = p.x - p.w / 2 - p.px * 0.15, wd = p.w + p.px * 0.3, top = p.y - p.px, h = p.px * 1.4, lean = p.px * 0.25;
          ctx.save();
          if (e < 1) { const xE = x0 + wd * e; ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(xE + lean, top); ctx.lineTo(xE - lean, top + h); ctx.lineTo(x0 - lean, top + h); ctx.closePath(); ctx.clip(); }
          ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.fillText(p.s, p.x, p.y); ctx.strokeText(p.s, p.x, p.y);
          ctx.restore();
          if (mouse.inside) hitWord(p.wd, tNow, p.x, p.y - p.px * 0.35, p.px);
        }
      } },
    { n: 33, name: 'Along a path', fit: (n, ch) => ch <= 28, bg: 'glow',
      setup(ph, r) {
        const S = stage(), ws = ph.words, o = { caps: true }, px = Math.min(S.h * 0.1, 100 * S.w * 0.62 / widthAt100(ws, BOLD, o));
        const row = rowAt(ws, BOLD, px, 0, 0, r, o), pts = [];
        let len = 0, last = null;
        for (let i = 0; i <= 240; i++) {   // an S across the screen, measured so letters keep even spacing
          const f = i / 240, x = -S.w * 0.1 + f * S.w * 1.2, y = S.cy + Math.sin(f * Math.PI * 2 + 0.5) * S.h * 0.3;
          if (last) len += Math.hypot(x - last[0], y - last[1]);
          pts.push([x, y, len]); last = [x, y];
        }
        return { g: timing(row.g, ws), pts, len, font: row.font, W0: row.w };
      },
      draw(L, t, T, a, sc) {
        const dur = Math.max(2.5, sc.ph.t1 - sc.ph.t0 + 0.6), u = (T - sc.at) / dur, head = L.len * (0.5 + (u - 0.5) * 0.5 - (1 - easeOut(u * 2.5)) * 0.42);
        const at = s => { let lo = 0, hi = L.pts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L.pts[m][2] < s) lo = m; else hi = m; } return [L.pts[lo], L.pts[hi]]; };
        for (const p of L.g) {
          const s = head + p.x; if (s < 2 || s > L.len - 2) continue;
          const [A, B] = at(s), f = (s - A[2]) / Math.max(0.01, B[2] - A[2]), x = lerp(A[0], B[0], f), y = lerp(A[1], B[1], f);
          ctx.save(); warp(x, y); ctx.translate(x, y); ctx.rotate(Math.atan2(B[1] - A[1], B[0] - A[0])); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.fillText(p.s, 0, p.px * 0.35); ctx.restore();
          if (mouse.inside) hitWord(p.wd, tNow, x, y, p.px);
        }
      } },
    { n: 34, name: 'Cinematic blur', gentle: true, bg: 'black', setup: (ph, r) => arrange(ph.words, r, { font: THIN, caps: true, track: 0.06, maxLines: 2, cap: stage().h * 0.15, lh: 1.15 }),
      draw(L, t, T, a) {
        for (const p of L.g) {
          const e = clamp((t - p.t0 - p.r * 0.55) / 0.65, 0, 1); if (e <= 0) continue;
          drawHalo(p.s, BOLD, p.px, '#FFFFFF', 12, p.x, p.y, 'center', 'alphabetic', a * 0.55 * (1 - e) * Math.min(1, e * 4));
          put(p, a * e * e);
        }
      } },
    { n: 35, name: 'Rolling cut', fit: (n, ch) => n <= 4 && ch <= 16, bg: 'glow', setup: (ph, r) => arrange(ph.words, r, { caps: true, maxLines: 1, w: 0.68, cap: stage().h * 0.2 }),
      draw(L, t, T, a, sc) {
        const R = L.rows[0], mid = R.y - R.px * 0.36, age = T - sc.at, sp = R.px * 0.86;
        ctx.globalAlpha = a; ctx.textAlign = 'center';
        for (const p of R.g) {
          const v = 2 * (1 - easeInOut(clamp((age - p.r * 0.6) / 0.9, 0, 1))), f = v - Math.floor(v), off = f * sp, slide = (1 - easeOut(clamp((age - p.r * 0.6) / 0.9, 0, 1))) * p.px * 0.12;
          for (const [top, sign] of [[true, 1], [false, -1]]) {
            ctx.save(); ctx.beginPath(); ctx.rect(p.x - p.w / 2 - 1, top ? mid - R.px * 0.5 : mid, p.w + 2, R.px * 0.5); ctx.clip();
            for (const k of [-1, 0, 1]) ctx.fillText(p.s, p.x + sign * slide, R.y + sign * (off + k * sp));
            ctx.restore();
          }
          if (mouse.inside) hitWord(p.wd, tNow, p.x, p.y - p.px * 0.35, p.px);
        }
      } },
    { n: 36, name: 'Liquid drip', fit: (n, ch) => n <= 4 && ch <= 16, bg: 'navy',
      setup(ph, r) {
        const L = arrange(ph.words, r, { caps: true, maxLines: 2, w: 0.64, cap: stage().h * 0.2, lh: 1.5, h: 0.5 });
        L.drips = L.g.flatMap(p => (r() < 0.65 ? [{ p, x: p.x + (r() < 0.5 ? -1 : 1) * p.w * 0.27, len: p.px * (0.5 + r() * 1.9), w: p.px * (0.07 + r() * 0.05), at: r() * 0.5 }] : []));
        return L;
      },
      draw(L, t, T, a) {
        ctx.fillStyle = '#FFF';
        for (const D of L.drips) {
          const u = t - D.p.t0 - D.at; if (u <= 0) continue;
          const v = easeInOut(u / 1.1) * (1 - easeInOut((u - 1.6) / 0.9)), h = D.len * v; if (h < 1) continue;
          ctx.globalAlpha = a; ctx.beginPath(); ctx.roundRect(D.x - D.w / 2, D.p.y - D.p.px * 0.1, D.w, h + D.p.px * 0.1, D.w / 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(D.x, D.p.y + h, D.w * 0.72, D.w * 1.05, 0, 0, 6.29); ctx.fill();
        }
        for (const p of L.g) put(p, a * clamp((t - p.t0) / 0.15, 0, 1));
      } },
    { n: 37, name: 'Outline flicker', bg: 'glow', setup: (ph, r) => arrange(ph.words, r, { caps: true, maxLines: 3 }),
      draw(L, t, T, a) {
        const f = Math.floor(T * 11);
        ctx.strokeStyle = '#FFF'; ctx.lineWidth = Math.max(1, L.px * 0.018);
        for (const p of L.g) {
          const u = t - p.t0; if (u < -0.3) continue;
          const v = nz(p.x, f), solid = u > 0.9 ? v > 0.03 : u > 0 ? v > 0.5 : false;
          if (solid) put(p, a);
          else if (v > 0.15) { ctx.globalAlpha = a * 0.85; ctx.textAlign = 'center'; ctx.strokeText(p.s, p.x, p.y); }
          if (mouse.inside && !solid) hitWord(p.wd, tNow, p.x, p.y - p.px * 0.35, p.px);
        }
      } },
    { n: 38, name: 'Word by word', gentle: true, setup: (ph, r) => { const L = arrange(ph.words, r, { caps: true, maxLines: 3 }); L.g.forEach(p => { p.t0 = p.wd.t - 0.08; }); return L; },
      draw(L, t, T, a) { for (const p of L.g) { const e = easeOut((t - p.t0) / 0.38); if (e > 0) put(p, a * e, { dy: (1 - e) * p.px * 0.55 }); } } },
    { n: 39, name: 'Fade sweep', gentle: true, bg: 'navy', setup: (ph, r) => arrange(ph.words, r, { caps: true, maxLines: 3 }),
      draw(L, t, T, a) { for (const p of L.g) put(p, a * (0.04 + 0.96 * smoothstep(0, 0.55, t - p.t0))); } },
  ];
  const NEON = ['#19D5FF', '#FF1E9C', '#C81EFF'];

  // ---------- which effect each line gets ----------
  // Each effect plays PLAYS times in a row, then the next one takes over. They're dealt from a shuffled deck that lasts
  // across songs and Mix turns, so every effect gets its go before any comes back.
  const PLAYS = 3;
  let forced = -1, deck = [], streak = null, plays = 0, chosen = new Map();   // chosen: line number -> effect, so a resize or seek doesn't change it
  const fits = (f, p) => {
    const n = p.words.length, ch = p.words.map(w => w.w).join(' ').length;
    return (!f.fit || f.fit(n, ch)) && (!calmMode || f.gentle);
  };
  function deal(lines, r) {
    const take = i => deck.splice(i, 1)[0];
    let i = deck.findIndex(f => lines.every(p => fits(f, p)));      // one that suits the lines it will play on...
    if (i < 0) i = deck.findIndex(f => fits(f, lines[0]));          // ...or at least this one
    if (i >= 0) return take(i);
    const more = EFFECTS.filter(f => !deck.includes(f));            // none left that suit: shuffle the rest back in, behind what's waiting
    for (let k = more.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [more[k], more[j]] = [more[j], more[k]]; }
    if (more[0] === streak && more.length > 1) more.push(more.shift());
    const start = deck.length;
    deck.push(...more);
    i = deck.findIndex((f, k) => k >= start && fits(f, lines[0]));
    return i >= 0 ? take(i) : EFFECTS.find(f => fits(f, lines[0])) || EFFECTS[EFFECTS.length - 1];
  }
  function choose(ph, r, again) {
    if (forced >= 0) return EFFECTS[forced];
    if (!again && chosen.has(ph.i)) return chosen.get(ph.i);
    let fx = streak;
    if (fx && plays < PLAYS && fits(fx, ph)) plays++;
    else {
      const lines = again ? [ph] : [ph, track.phrases[ph.i + 1], track.phrases[ph.i + 2]].filter(Boolean);
      fx = streak = deal(lines, r); plays = 1;
    }
    if (!again) chosen.set(ph.i, fx);
    return fx;
  }
  function build(ph, r, sc, again) {
    const fx = choose(ph, r, again), L = fx.setup(ph, r);
    L.fx = fx;
    return L;
  }

  // ---------- repeats: a sung line plays again with a new effect, until the next line takes over ----------
  const SETTLE = 1.0, MIN_ROOM = 1.3;   // seconds a line rests once sung; a repeat needs this much time to be worth starting
  let rep = null, repCount = 0, shown = null, outgoing = null, outAt = -9;
  function nextRepeat(P, t, T) {
    const span = Math.min(1.1, Math.max(0.3, P.tEnd - P.t0)), k = span / Math.max(0.3, P.tEnd - P.t0), base = t + 0.05;   // sung again quickly
    const words = P.words.map(w => ({ ...w, t: base + (w.t - P.t0) * k })), hold = calmMode ? 2.4 : 1.1;
    const ph = { i: P.i, words, t0: base, tEnd: base + span, t1: base + span + hold + 0.5 };
    const sc = { key: `rep${P.i}:${++repCount}`, ph, at: T, r: rng(hash(track.title + ':' + P.i + ':' + repCount + ':' + songSalt)) };
    sc.L = build(ph, sc.r, sc, true);
    return { P, sc, base, until: base + span + hold };
  }
  function whatToShow(cur, t, T) {   // the scene on screen right now: the line itself, or its latest repeat
    const P = cur.ph;
    if (!P) { rep = null; return cur; }                                        // before the first line: the title card
    if (rep && (rep.P !== P || t < rep.base - 0.5)) rep = null;                // a new line, or a seek back
    if (t < P.tEnd + SETTLE) return cur.card && shown ? shown : cur;
    const gap = cur.card || P.i === track.phrases.length - 1 || P.t1 - t > MIN_ROOM;   // room for another turn before the next line?
    if (gap && (!rep || t > rep.until)) {
      try { rep = nextRepeat(P, t, T); } catch (e) { console.error(e); }       // an effect that can't lay this out: another next frame
    }
    return rep ? rep.sc : cur.card ? shown || cur : cur;
  }
  function buildCard() {
    const S = stage(), title = caps(track.title || 'MUSIC SYNC'), who = caps(track.artist || '');
    const px = Math.min(S.h * 0.17, 100 * S.w * 0.7 / textW(title, BOLD(100))), r = rng(7);
    const row = rowAt([{ w: title, t: 0 }], BOLD, px, S.cx, S.cy + px * 0.35, r, {}), sub = rowAt([{ w: who, t: 0 }], THIN, px * 0.3, S.cx, S.cy - px * 0.72, r, { track: 0.18 });
    row.g.forEach((p, i) => { p.t0 = 0.1 + i * 0.03; p.wd = null; }); sub.g.forEach((p, i) => { p.t0 = 0.5 + p.r * 0.5; p.wd = null; });
    return { card: true, row, sub, bg: 'glow' };
  }
  function drawCard(sc, T, a) {
    const L = sc.L, age = T - sc.at;
    ctx.font = L.row.font; for (const p of L.row.g) { const e = easeOut((age - p.t0) / 0.5); if (e > 0) put(p, a * Math.min(1, e * 2), { dy: (1 - e) * p.px * 0.5 }); }
    ctx.font = L.sub.font; for (const p of L.sub.g) put(p, a * 0.8 * clamp((age - p.t0) / 0.5, 0, 1));
  }
  function drawScene(sc, t, T, a, q) {
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#FFF';
    tNow = t;
    if (sc.card) drawCard(sc, T, a);
    else { if (sc.L.font) ctx.font = sc.L.font; sc.L.fx.draw(sc.L, t, T, a, sc, q || 0); }
    ctx.restore();
  }

  // ---------- backgrounds ----------
  // Dark gradients show stepped bands in 8 bits, so these are worked out per pixel with a touch of dither, once per
  // screen size. Slightly bigger than the screen (for the mouse lean) and pasted pixel for pixel.
  const SPILL = 20, grounds = new Map(), dither = Float32Array.from({ length: 65536 }, () => Math.random());
  const rgbaOf = css => {
    const g = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    g.fillStyle = css; g.fillRect(0, 0, 1, 1);
    const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data;
    return [r, gr, b, a / 255];
  };
  function radial(key, inner, outer, size = 0.7) {
    const d = DPR(), k = `${key}@${W}x${H}@${d}`;
    let c = grounds.get(k);
    if (c) return c;
    c = document.createElement('canvas'); c.width = Math.round((W + SPILL * 2) * d); c.height = Math.round((H + SPILL * 2) * d);
    const g = c.getContext('2d'), img = g.createImageData(c.width, c.height), px = img.data;
    const [ir, ig, ib, ia] = rgbaOf(inner), [or, og, ob] = rgbaOf(outer);
    const cx = (W / 2 + SPILL) * d, cy = (H * 0.56 + SPILL) * d, R = Math.hypot(W, H) * size / 2 * d;
    for (let y = 0, i = 0, n = 0; y < c.height; y++) for (let x = 0; x < c.width; x++, i += 4) {
      const f = Math.max(0, 1 - Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / R), l = 1 - ia * f, m = ia * f * f;   // color and alpha both fade out
      px[i] = Math.floor(or * l + ir * m + dither[n++ & 65535]);
      px[i + 1] = Math.floor(og * l + ig * m + dither[n++ & 65535]);
      px[i + 2] = Math.floor(ob * l + ib * m + dither[n++ & 65535]);
      px[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grounds.set(k, c);
    return c;
  }
  const groundOf = (key, color) => {
    if (key === 'navy') return radial('navy', '#0D0D33', '#02020E', 1);
    if (key === 'glow') return radial('glow', 'rgba(150,150,215,0.42)', '#03030F', 0.62);
    if (key === 'magenta') return radial('magenta', 'rgba(200,10,110,0.75)', '#070211', 0.7);
    if (key === 'neon') return radial(`neon${color}`, `${color}66`, '#010103', 0.8);
    return null;   // plain black
  };
  let bgNow = null, bgPrev = null, bgAt = -9;
  function drawGround(T, cur) {
    const L = cur.L, key = L.card ? 'glow' : L.fx.neon ? 'neon' : L.fx.bg || 'black', color = L.color, id = key + (color || '');
    if (id !== (bgNow && bgNow.id)) { bgPrev = bgNow; bgNow = { id, key, color }; bgAt = T; }
    ctx.fillStyle = '#000'; ctx.fillRect(-40, -40, W + 80, H + 80);
    const f = clamp((T - bgAt) / 0.45, 0, 1), one = (b, A) => { const c = b && groundOf(b.key, b.color); if (c && A > 0.01) { ctx.globalAlpha = A; ctx.drawImage(c, -SPILL, -SPILL, W + SPILL * 2, H + SPILL * 2); } };
    if (f < 1) one(bgPrev, 1 - f);
    one(bgNow, f);
    ctx.globalAlpha = 1;
  }
  // The dust and embers behind the cinematic title.
  const dust = Array.from({ length: 22 }, (_, i) => ({ x: nz(i, 1), y: nz(i, 2), r: 0.12 + nz(i, 3) * 0.22, v: 0.004 + nz(i, 4) * 0.01 }));
  const embers = Array.from({ length: 70 }, (_, i) => ({ x: nz(i, 5), y: nz(i, 6), s: 0.2 + nz(i, 7), v: 0.02 + nz(i, 8) * 0.05, a: nz(i, 9) * 6.28 }));
  function cinematicAir(T, a) {
    for (const d of dust) glowAt(((d.x + T * d.v) % 1.3 - 0.15) * W, (d.y * 1.1 - 0.05) * H, d.r * H, 'rgb(72,72,92)', a * 0.13);
    ctx.fillStyle = '#FF4D5E';
    for (const e of embers) {
      const y = (((e.y - T * e.v) % 1) + 1) % 1, x = (e.x + Math.sin(T * 0.6 + e.a) * 0.012) * W;
      ctx.globalAlpha = a * 0.6 * e.s; ctx.fillRect(x, y * H, 1.6 * e.s + 0.6, 5 * e.s + 1);
    }
    ctx.globalAlpha = 1;
  }

  LOOKS.push({
    id: 'motion', name: 'Motion', exit: 0.28, effects: EFFECTS, get shown() { return shown; },
    force(i) { forced = i; this.st = null; rep = null; },
    reset() {
      chosen = new Map(); streak = null; bgNow = bgPrev = null; bgAt = -9; rep = shown = outgoing = null;
      if (LOOKS[look] === this || mixing()) {   // a song or look is changing: build the backgrounds now, not in the middle of a line
        for (const [k, color] of [['navy'], ['glow'], ['magenta'], ...NEON.map(c => ['neon', c])]) requestIdleCallback(() => groundOf(k, color));
      }
    },
    build, buildCard,
    frame(T) {
      const d = direct(this, T);
      if (!d.cur) return;
      const cur = whatToShow(d.cur, d.t, T);
      if (shown && cur !== shown && cur.key !== shown.key) { outgoing = shown; outAt = T; }   // same key: only a resize
      shown = cur;
      drawGround(T, cur);
      const fx = cur.L.fx;
      if (fx && fx.cinematic) { ctx.save(); cinematicAir(T, sceneFade); ctx.restore(); }
      if (outgoing) {   // what was showing fades away under the new one
        const again = cur.ph && outgoing.ph && cur.ph.i === outgoing.ph.i;   // the same words twice: fade fast, or they read as double vision
        const q = clamp((T - outAt) / (again ? 0.1 : this.exit), 0, 1), own = outgoing.L.fx && outgoing.L.fx.ownExit;
        if (q >= 1) outgoing = null;
        else drawScene(outgoing, d.t, T, sceneFade * (own ? 1 : 1 - q), q);
      }
      drawScene(cur, d.t, T, sceneFade);
      if (forced >= 0) {
        ctx.save(); ctx.globalAlpha = 0.75; ctx.fillStyle = cur.L.fx && cur.L.color || '#C9CCFF'; ctx.font = '600 15px Montserrat, sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(`${EFFECTS[forced].n}  ${EFFECTS[forced].name}`, 32, H - 30); ctx.restore();
      }
      setAccent(cur.L.color || (fx && fx.bg === 'magenta' ? '#FF49C8' : '#C9CCFF'));
    },
    key(e) {
      if (e.key !== 'e' && e.key !== 'E') return false;
      const n = EFFECTS.length;
      forced = e.shiftKey ? (forced <= 0 ? (forced < 0 ? n - 1 : -1) : forced - 1) : forced >= n - 1 ? -1 : forced + 1;
      this.st = null; rep = null;
      toast(forced < 0 ? 'Effects: random' : `Effect ${EFFECTS[forced].n}: ${EFFECTS[forced].name}`);
      return true;
    },
  });
})();
