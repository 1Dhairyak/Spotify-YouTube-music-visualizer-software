// Look 3: Pop Colors (from The Chainsmokers "Closer" kinetic-typography video).
// Flat bold backgrounds that change every phrase with corner/stripe wipes, justified blocks of mixed fonts,
// hatched 3D drop shadows, words written around a circle, sunburst shouts and handwritten words with paint splats.
(() => {
  const SCHEMES = [   // background, two text colors, hatch-shadow color (all picked from the video)
    { bg: '#CC1A4A', a: '#FFF3D6', b: '#F4C64E', sh: '#F0A93A' },
    { bg: '#3FF0C3', a: '#FFF8E1', b: '#F9E07A', sh: '#F4C64E' },
    { bg: '#EECB5B', a: '#E2456F', b: '#33C9A8', sh: '#C93A60' },
    { bg: '#63F1F1', a: '#FFF6DA', b: '#E2456F', sh: '#E2456F' },
    { bg: '#F3F3F3', a: '#3BA7D9', b: '#E2456F', sh: '#9ED5EE' },
    { bg: '#E8704A', a: '#FFF3D6', b: '#F6C945', sh: '#B9482C' },
    { bg: '#E2456F', a: '#FFF3D6', b: '#F2C94C', sh: '#B52F55' },
  ];
  const CARD = { bg: '#333333', a: '#F1DC8E', b: '#F1DC8E', sh: '#222222' };
  const FONTS = {
    lg: px => `${px}px "League Gothic"`,
    js: px => `700 ${px}px "Josefin Sans"`,
    as: px => `${px}px "Alfa Slab One"`,
    cv: px => `700 ${px}px Caveat`,
  };

  const hatches = {};
  function hatch(color) {   // diagonal stripes, used inside the 3D drop shadow
    if (!hatches[color]) {
      const c = document.createElement('canvas'); c.width = c.height = 10;
      const g = c.getContext('2d'); g.strokeStyle = color; g.lineWidth = 3;
      for (const o of [-10, 0, 10]) { g.beginPath(); g.moveTo(o, 10); g.lineTo(o + 10, 0); g.stroke(); }
      hatches[color] = c;
    }
    return hatches[color];
  }
  const capsBox = (s, font) => {   // width and cap height at a given font
    ctx.font = font; const m = ctx.measureText(s);
    return { w: m.width, h: m.actualBoundingBoxAscent + Math.max(0, m.actualBoundingBoxDescent) * 0.6 };
  };

  // Background colors: a fixed sequence per song, never the same color twice in a row.
  let seq = [], seqFor = null;
  function schemeOf(k) {
    if (seqFor !== track.title) { seqFor = track.title; seq = []; }
    const r = rng(hash(track.title + ':pop'));
    while (seq.length <= k) seq.push(seq.length ? (seq[seq.length - 1] + 1 + Math.floor(r() * (SCHEMES.length - 1))) % SCHEMES.length
                                                : Math.floor(r() * SCHEMES.length));
    return SCHEMES[seq[k]];
  }

  // ---------- layouts ----------
  function build(ph, r, sc) {
    const S = stage(), ws = ph.words, n = ws.length, sch = schemeOf(ph.i);
    const chars = ws.map(w => w.w).join(' ').length;
    let type;
    if (n === 1) type = r() < 0.55 ? 'shout' : 'script';
    else if (n === 2) type = pickR(r, ['shout', 'block', 'script']);
    else if (n <= 7 && chars <= 34 && r() < 0.28) type = 'ring';
    else if (n <= 4 && r() < 0.25) type = 'script';
    else type = 'block';
    const L = { type, sch, wipe: pickR(r, ['corner', 'stripes', 'slide']), items: [] };

    if (type === 'block') {
      const rows = [];
      for (let i = 0; i < n;) {
        const len = Math.min(n - i, r() < 0.45 ? 1 : r() < 0.75 ? 2 : 3);
        rows.push(ws.slice(i, i += len));
      }
      while (rows.length > 5) {   // merge the two shortest neighbours
        let best = 0;
        for (let i = 1; i + 1 < rows.length; i++) if (rows[i].length + rows[i + 1].length < rows[best].length + rows[best + 1].length) best = i;
        rows.splice(best, 2, rows[best].concat(rows[best + 1]));
      }
      const vertical = n >= 4 && r() < 0.2;
      const blockW = vertical ? S.h * 0.7 : W * (0.3 + r() * 0.14), maxPx = (vertical ? W * 0.16 : S.h * 0.36);
      let extDone = false, colorFlip = r() < 0.5;
      const R = rows.map((rw, i) => {
        const f = pickR(r, ['lg', 'lg', 'lg', 'js', 'as']), s = rw.map(w => caps(w.w)).join(' ');
        const m = capsBox(s, FONTS[f](100));
        const px = Math.min(100 * blockW / m.w, maxPx);
        const ext = !extDone && f !== 'js' && r() < 0.45; if (ext) extDone = true;
        if (r() < 0.6) colorFlip = !colorFlip;
        return { rw, f, px, w: m.w * px / 100, h: m.h * px / 100, ext, color: colorFlip ? sch.a : sch.b };
      });
      const gap = Math.max(6, blockW * 0.02);
      let total = R.reduce((a, x) => a + x.h, 0) + gap * (R.length - 1);
      const limit = vertical ? W * 0.55 : S.h * 0.8;
      const k = Math.min(1, limit / total);
      total *= k;
      const bw = Math.max(...R.map(x => x.w)) * k;
      const ox = vertical ? 0 : (r() - 0.5) * W * 0.12;
      const cx = S.cx + ox, cy = S.cy;
      let y = -total / 2;
      for (const row of R) {
        row.px *= k; row.w *= k; row.h *= k;
        const x0 = -bw / 2, base = y + row.h;
        ctx.font = FONTS[row.f](row.px);
        const space = ctx.measureText(' ').width;
        let x = x0;
        for (const wd of row.rw) {
          const s = caps(wd.w), w = ctx.measureText(s).width;
          L.items.push({ s, wd, x, y: base, w, h: row.h, font: FONTS[row.f](row.px), color: row.color, ext: row.ext, px: row.px });
          x += w + space;
        }
        y += row.h + gap * k;
      }
      Object.assign(L, { cx, cy, rot: vertical ? -Math.PI / 2 : 0 });
    } else if (type === 'shout') {
      const s = ws.map(w => caps(w.w)).join(' '), f = n === 1 ? 'lg' : pickR(r, ['lg', 'as']);
      const m = capsBox(s, FONTS[f](100)), px = Math.min(100 * W * 0.42 / m.w, S.h * 0.5);
      ctx.font = FONTS[f](px);
      const space = ctx.measureText(' ').width, wTot = m.w * px / 100, h = m.h * px / 100;
      let x = -wTot / 2;
      for (const wd of ws) {
        const t = caps(wd.w), w = ctx.measureText(t).width;
        L.items.push({ s: t, wd, x, y: h / 2, w, h, font: FONTS[f](px), color: sch.a, ext: true, px });
        x += w + space;
      }
      Object.assign(L, { cx: S.cx, cy: S.cy, rot: 0, burst: { rx: wTot * 0.72 + 40, ry: h * 1.05 + 30 } });
    } else if (type === 'ring') {
      const R = S.h * 0.2, letters = [];
      let px = R * 0.42;
      const text = ws.map(w => caps(w.w)).join(' ');
      ctx.font = FONTS.lg(px);
      const spacing = px * 0.32;
      let arc = [...text].reduce((a, c) => a + ctx.measureText(c).width + spacing, 0);
      const rad = R * 1.38, maxArc = rad * 5.6;
      if (arc > maxArc) { px *= maxArc / arc; arc = maxArc; }
      ctx.font = FONTS.lg(px);
      let ang = -2.75;   // start on the left, go clockwise over the top
      ws.forEach((wd, wi) => {
        for (const c of caps(wd.w) + (wi < n - 1 ? ' ' : '')) {
          const cw = ctx.measureText(c).width, a = ang + (cw / 2) / rad;
          if (c !== ' ') letters.push({ c, wd, a });
          ang += (cw + px * 0.32) / rad;
        }
      });
      const circle = ['#63F1F1', '#3FF0C3'].includes(sch.bg) ? ['#E2456F', '#F6C945'] : ['#7EEFF0', '#4FF0BD'];
      Object.assign(L, { cx: S.cx, cy: S.cy, R, rad, px, letters, circle, font: FONTS.lg(px),
                         color: sch.bg === '#CC1A4A' ? '#F6D54E' : sch.a });
    } else {   // script
      const s = ws.map(w => w.w).join(' ');
      ctx.font = FONTS.cv(100);
      const px = Math.min(100 * W * 0.5 / ctx.measureText(s).width, S.h * 0.38);
      ctx.font = FONTS.cv(px);
      const space = ctx.measureText(' ').width, wTot = ctx.measureText(s).width;
      let x = -wTot / 2;
      for (const wd of ws) {
        const w = ctx.measureText(wd.w).width;
        L.items.push({ s: wd.w, wd, x, y: px * 0.3, w, h: px, font: FONTS.cv(px), color: sch.a, px, script: true });
        x += w + space;
      }
      const splats = [];
      for (let i = 0; i < 16; i++) {
        const a = r() * 6.28, d = (0.55 + r() * 0.5);
        splats.push({ x: Math.cos(a) * wTot * 0.6 * d, y: Math.sin(a) * px * 0.9 * d, r: 3 + r() * r() * 14,
                      stretch: r() < 0.25 ? 2 + r() * 2 : 1, rot: a, color: pickR(r, [sch.b, sch.a, '#7C6CF0']),
                      wd: ws[Math.floor(r() * n)] });
      }
      Object.assign(L, { cx: S.cx, cy: S.cy, rot: -0.04, splats });
    }
    return L;
  }

  function buildCard() {
    const S = stage(), title = track.title || 'Music Sync', who = caps(track.artist || '');
    ctx.font = FONTS.cv(100);
    const px = Math.min(100 * W * 0.42 / ctx.measureText(title).width, S.h * 0.3);
    return { card: true, sch: CARD, title, who, px, wipe: 'corner' };
  }

  // ---------- drawing ----------
  let wipe = null;   // background change in progress: {from, to, at, kind}
  function background(T, sch) {
    const D = 0.5;
    if (!wipe || T - wipe.at > D) { ctx.fillStyle = sch.bg; ctx.fillRect(0, 0, W, H); return; }
    const p = easeOut((T - wipe.at) / D);
    ctx.fillStyle = wipe.from; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = wipe.to;
    if (wipe.kind === 'corner') {   // a cut-corner panel growing from the middle
      const w = W * 1.25 * p, h = H * 1.4 * p, c = Math.min(w, h) * 0.22, x = W / 2 - w / 2, y = H / 2 - h / 2;
      ctx.beginPath();
      ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + h - c);
      ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c);
      ctx.closePath(); ctx.fill();
    } else if (wipe.kind === 'stripes') {   // three colored bands sweep across, the new color under them
      const bands = ['#F2D36B', '#F0A361', '#E2456F'];
      const x = -W * 0.6 + p * W * 1.9;
      ctx.fillRect(0, 0, Math.max(0, x - W * 0.3), H);
      bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x - W * 0.3 - i * W * 0.06, H * i / 3, W * 0.36, H / 3 + 1); });
    } else {   // a slanted panel sliding in from the right
      const x = W - p * W * 1.3;
      ctx.beginPath(); ctx.moveTo(x + H * 0.3, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(x, H); ctx.closePath(); ctx.fill();
    }
  }

  function drawWord(it, t, T, a) {
    const p = sung(it.wd, t, 0.3);
    if (p <= 0) return;
    ctx.font = it.font; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (it.script) {   // handwriting: written on left to right
      ctx.save(); ctx.beginPath(); ctx.rect(it.x - 10, it.y - it.h * 1.2, (it.w + 20) * clamp((t - it.wd.t) / 0.4, 0, 1), it.h * 1.8); ctx.clip();
      ctx.globalAlpha = a; ctx.fillStyle = it.color; ctx.fillText(it.s, it.x, it.y); ctx.restore();
      return;
    }
    const s = backOut(p) * 0.65 + 0.35, cx = it.x + it.w / 2, cy = it.y - it.h / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
    ctx.globalAlpha = a * clamp(p * 2, 0, 1);
    if (it.ext) {   // hatched 3D drop: the word stamped down-right, filled with diagonal stripes
      const color = ['#FFF3D6', '#FFF6DA', '#FFF8E1'].includes(it.color) ? currentSch.sh : it.color;
      if (!it.drop || it.dropColor !== color) {   // drawn once into its own image; stamping it every frame is slow
        const depth = Math.max(4, it.px * 0.06), pad = 4, c = document.createElement('canvas');
        c.width = Math.ceil(it.w + depth + pad * 2); c.height = Math.ceil(it.px * 1.3 + depth + pad * 2);
        const g = c.getContext('2d'); g.font = it.font; g.fillStyle = g.createPattern(hatch(color), 'repeat');
        for (let d = depth; d > 0; d -= 1.5) g.fillText(it.s, pad + d, pad + it.px + d);
        Object.assign(it, { drop: c, dropColor: color, dropOff: [it.x - pad, it.y - it.px - pad] });
      }
      ctx.drawImage(it.drop, it.dropOff[0], it.dropOff[1]);
    }
    ctx.fillStyle = it.color; ctx.fillText(it.s, it.x, it.y);
    ctx.restore();
  }

  function drawBurst(L, t, T, a) {
    const first = L.items[0].wd, e = clamp((t - first.t) / 0.55, 0, 1);
    if (e <= 0 || e >= 1) return;
    ctx.strokeStyle = L.sch.a; ctx.lineCap = 'round'; ctx.lineWidth = 4; ctx.globalAlpha = a * (1 - e);
    for (let i = 0; i < 12; i++) {
      const ang = i / 12 * 6.28 + 0.13, r1 = 0.85 + e * 0.35, r2 = r1 + 0.18;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * L.burst.rx * r1, Math.sin(ang) * L.burst.ry * r1);
      ctx.lineTo(Math.cos(ang) * L.burst.rx * r2, Math.sin(ang) * L.burst.ry * r2);
      ctx.stroke();
    }
  }

  function drawRing(sc, t, T, a) {
    const L = sc.L, age = T - sc.at, e = easeOut(age / 0.45);
    ctx.save(); ctx.translate(L.cx, L.cy);
    // circle pops in blurred, then sharpens
    ctx.globalAlpha = a; if (e < 1) ctx.filter = `blur(${(1 - e) * 10}px)`;
    const R = L.R * (0.6 + 0.4 * backOut(age / 0.45));
    ctx.fillStyle = L.circle[0]; ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.29); ctx.fill();
    const rot = T * 0.9;
    ctx.fillStyle = L.circle[1]; ctx.beginPath(); ctx.arc(0, 0, R * 0.9, rot, rot + 2.2); ctx.lineTo(0, 0); ctx.fill();
    ctx.filter = 'none';
    // sweeping arcs
    ctx.strokeStyle = L.color; ctx.lineCap = 'round';
    [[1.62, 0.9, 1.4], [1.72, -0.7, 0.9], [1.56, 0.5, 1.1]].forEach(([rr, sp, len], i) => {
      ctx.lineWidth = 3 - i * 0.6; ctx.globalAlpha = a * 0.9 * e;
      const s0 = T * sp + i * 2.1;
      ctx.beginPath(); ctx.arc(0, 0, L.R * rr, s0, s0 + len); ctx.stroke();
    });
    // letters around the circle, each appearing as its word is sung
    ctx.font = L.font; ctx.fillStyle = L.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const lt of L.letters) {
      const p = sung(lt.wd, t, 0.2);
      if (p <= 0) continue;
      ctx.save(); ctx.rotate(lt.a); ctx.translate(L.rad + (1 - p) * 20, 0); ctx.rotate(Math.PI / 2);
      ctx.globalAlpha = a * p; ctx.fillText(lt.c, 0, 0); ctx.restore();
    }
    ctx.restore();
  }

  function drawSplats(L, t, a) {
    for (const s of L.splats) {
      const p = backOut(sung(s.wd, t, 0.25));
      if (p <= 0) continue;
      ctx.globalAlpha = a; ctx.fillStyle = s.color;
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);
      ctx.beginPath(); ctx.ellipse(0, 0, s.r * s.stretch * p, s.r * p, 0, 0, 6.29); ctx.fill(); ctx.restore();
    }
  }

  function drawCard(sc, T, a) {
    const S = stage(), L = sc.L, age = T - sc.at;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = FONTS.lg(L.px * 0.24); ctx.letterSpacing = '0.12em';
    ctx.globalAlpha = a * easeOut(age / 0.4); ctx.fillStyle = CARD.a;
    ctx.fillText(L.who, S.cx, S.cy - L.px * 0.42);
    ctx.letterSpacing = '0px';
    ctx.font = FONTS.cv(L.px); const w = ctx.measureText(L.title).width;
    ctx.save(); ctx.beginPath(); ctx.rect(S.cx - w / 2 - 20, 0, (w + 40) * clamp((age - 0.15) / 0.7, 0, 1), H); ctx.clip();
    ctx.globalAlpha = a; ctx.fillText(L.title, S.cx, S.cy + L.px * 0.35); ctx.restore();
  }

  let currentSch = CARD;
  function drawScene(sc, t, T, a) {
    const L = sc.L;
    if (sc.card) return drawCard(sc, T, a);
    if (L.type === 'ring') return drawRing(sc, t, T, a);
    ctx.save(); ctx.translate(L.cx, L.cy); ctx.rotate(L.rot);
    if (L.burst) drawBurst(L, t, T, a);
    if (L.splats) drawSplats(L, t, a);
    for (const it of L.items) drawWord(it, t, T, a);
    ctx.restore();
  }

  LOOKS.push({
    id: 'pop', name: 'Pop Colors', exit: 0.35,
    reset() { wipe = null; },
    build, buildCard,
    enter(cur, prev, T) {
      const from = prev ? prev.L.sch.bg : CARD.bg;
      if (from !== cur.L.sch.bg) wipe = { from, to: cur.L.sch.bg, at: T, kind: cur.L.wipe };
    },
    frame(T) {
      const d = direct(this, T), cur = d.cur;
      currentSch = cur.L.sch;
      background(T, cur.L.sch);
      if (d.prev) {   // the old block slides out left, stretching
        const p = (T - d.prev.out) / this.exit;
        currentSch = d.prev.L.sch;
        ctx.save(); ctx.translate(-p * p * W * 0.4, 0); ctx.filter = `blur(${p * 8}px)`;
        ctx.translate(W / 2, H / 2); ctx.scale(1 + p * 0.5, 1); ctx.translate(-W / 2, -H / 2);
        drawScene(d.prev, d.t, T, sceneFade * (1 - p)); ctx.restore();
        currentSch = cur.L.sch;
      }
      drawScene(cur, d.t, T, sceneFade);
      setAccent(cur.L.sch.a);
    },
  });
})();
