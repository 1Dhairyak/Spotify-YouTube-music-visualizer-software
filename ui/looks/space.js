// Look 6: Deep Space (from the "Don't Let Me Down" motion-graphic lyric video).
// An indigo-to-violet sky with green and red glows, a three-depth starfield, a ringed planet, a moon and a passing
// comet (drawn here, not from the video). Lines mix thin and bold Josefin caps: stacks that drop in word by word and
// slowly zoom, letter-spaced lines that squeeze together, staircases that slide in, and warp streaks at every line.
// About one line in four cuts to a flat color with speed lines and diamond frames, a black band showing one word at
// a time or a big block. Lines leave with an RGB-split glitch.
(() => {
  const BOLD = px => `700 ${px}px "Josefin Sans"`, THIN = px => `100 ${px}px "Josefin Sans"`;
  const INK = '#FFFFFF', LILAC = '#C9B8FF';
  const FLASH = [   // flat cut-in colors: background, ink, speed lines, diamond frame (null = none)
    { bg: '#EBD43C', ink: '#2230E0', lines: 'rgba(120,200,60,0.55)', frame: 'rgba(150,110,30,0.6)' },
    { bg: '#C9622E', ink: '#FFFFFF', lines: 'rgba(255,220,180,0.45)', frame: 'rgba(0,0,0,0.75)' },
    { bg: '#050507', ink: '#FFFFFF', lines: 'rgba(210,40,60,0.6)', frame: 'rgba(255,255,255,0.8)' },
    { bg: '#5DB82A', ink: '#FFFFFF', lines: 'rgba(230,255,200,0.45)', frame: 'rgba(240,230,60,0.8)' },
    { bg: '#C8164A', ink: '#FFFFFF', lines: 'rgba(255,170,200,0.4)', frame: 'rgba(110,60,230,0.9)' },
    { bg: '#F2F2F2', ink: '#111111', lines: 'rgba(80,220,240,0.5)', frame: null },
    { bg: '#D864D8', ink: '#2230E0', lines: 'rgba(255,220,255,0.45)', frame: 'rgba(60,20,120,0.7)' },
  ];

  // ---------- the sky ----------
  const STARS = Array.from({ length: 240 }, () => ({ x: Math.random(), y: Math.random(), z: [0.25, 0.55, 1][Math.floor(Math.random() * 3)],
                                                     s: Math.random() < 0.1 ? 2 : 1, tw: Math.random() * 6.28 }));
  function sky(T) {
    ctx.drawImage(layer('space-sky', g => {
      const lin = g.createLinearGradient(0, 0, W, H);
      lin.addColorStop(0, '#1A1466'); lin.addColorStop(0.55, '#2A0E78'); lin.addColorStop(1, '#3A0A5A');
      g.fillStyle = lin; g.fillRect(0, 0, W, H);
      for (const [x, y, r, c] of [[0, H, H * 0.75, 'rgba(40,170,60,0.45)'], [W, H, H * 0.8, 'rgba(180,20,60,0.5)'], [W * 0.3, 0, H * 0.7, 'rgba(40,60,200,0.35)']]) {
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, c); rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg; g.fillRect(0, 0, W, H);
      }
    }), 0, 0, W, H);
    for (const z of [0.25, 0.55, 1]) {   // three depths, each leaning with the mouse by its own amount
      ctx.save(); parallax(z * 0.5); ctx.fillStyle = '#FFFFFF';
      for (const s of STARS) {
        if (s.z !== z) continue;
        const x = (((s.x - T * 0.006 * z) % 1) + 1) % 1 * W, y = s.y * H;
        ctx.globalAlpha = (0.25 + 0.45 * z) * (0.7 + 0.3 * Math.sin(T * 2 + s.tw));
        ctx.fillRect(x, y, s.s * (0.6 + z * 0.8), s.s * (0.6 + z * 0.8));
      }
      ctx.restore();
    }
  }

  function bodies(T) {   // a ringed planet, a moon and a comet; they lean away from the mouse and pulse with the beat
    const S = stage(), m = Math.min(W, H), beat = 1 + kick * 2.5;
    ctx.save(); parallax(0.3);
    const px = W * (0.84 + Math.sin(T * 0.05) * 0.04), py = S.y + S.h * (0.2 + Math.sin(T * 0.07) * 0.05), pr = m * 0.065 * beat;
    ctx.save(); warp(px, py, 0.8); ctx.translate(px, py); ctx.rotate(-0.35);
    const ring = (a0, a1) => { ctx.beginPath(); ctx.ellipse(0, 0, pr * 1.9, pr * 0.42, 0, a0, a1); ctx.stroke(); };
    ctx.strokeStyle = 'rgba(255,215,240,0.65)'; ctx.lineWidth = pr * 0.11; ctx.globalAlpha = 0.9;
    ring(Math.PI, Math.PI * 2);   // the back half of the ring, behind the planet
    const g = ctx.createRadialGradient(-pr * 0.4, -pr * 0.4, pr * 0.1, 0, 0, pr);
    g.addColorStop(0, '#F7A6C9'); g.addColorStop(0.6, '#9A3FB0'); g.addColorStop(1, '#2A0F55');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, pr, 0, 6.29); ctx.fill();
    ring(0, Math.PI);
    ctx.restore();
    const mx = W * (0.1 + ((T * 0.004) % 1) * 0.15), my = S.y + S.h * 0.82, mr = m * 0.028 * beat;   // the moon
    ctx.save(); warp(mx, my); ctx.globalAlpha = 0.85; ctx.fillStyle = '#B9B2D8';
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#8E86B4';
    for (const [dx, dy, r] of [[-0.3, -0.2, 0.25], [0.35, 0.25, 0.18], [0.05, 0.45, 0.12]]) { ctx.beginPath(); ctx.arc(mx + dx * mr, my + dy * mr, r * mr, 0, 6.29); ctx.fill(); }
    ctx.restore();
    const ph = (T % 13) / 13;   // a comet crosses every 13 s
    if (ph < 0.3) {
      const f = ph / 0.3, x = lerp(-W * 0.1, W * 1.1, f), y = lerp(S.y + S.h * 0.05, S.y + S.h * 0.55, f);
      const tl = ctx.createLinearGradient(x, y, x - 220, y - 100);
      tl.addColorStop(0, 'rgba(220,240,255,0.8)'); tl.addColorStop(1, 'rgba(220,240,255,0)');
      ctx.strokeStyle = tl; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 220, y - 100); ctx.stroke();
      glowAt(x, y, 16, 'rgb(230,245,255)', 0.9);
    }
    ctx.restore();
  }

  function streaks(T, at, seed, color, always) {   // warp lines rushing out from the center
    const age = T - at;
    if (!always && age > 1.1) return;
    const cx = W / 2, cy = stage().cy, R = Math.hypot(W, H) / 2, j = rng(seed);
    ctx.save(); ctx.strokeStyle = color; ctx.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const a = j() * 6.283, sp = 0.5 + j() * 0.8, off = j(), len = 0.08 + j() * 0.14, w = 1 + j() * 3;
      const f = always ? (T * sp * 0.6 + off) % 1 : clamp(age * sp * 1.3 + off * 0.25, 0, 1.4);
      const r0 = R * (0.15 + f * 0.95), r1 = r0 + R * len * (always ? 1 : 1 + 1.5 * (1 - age));
      ctx.globalAlpha = (always ? Math.sin(f * Math.PI) : Math.max(0, 1 - age / 1.1)) * 0.8;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
    }
    ctx.restore();
  }

  function diamonds(T, color, at) {   // thin diamond frames that open out from the middle
    if (!color) return;
    const S = stage(), p = easeOut((T - at) / 0.5), w = W * 0.42 * (0.6 + 0.4 * p), h = S.h * 0.55 * (0.6 + 0.4 * p);
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = p;
    for (const k of [1, 1.35]) {
      ctx.beginPath(); ctx.moveTo(S.cx, S.cy - h * k); ctx.lineTo(S.cx + w * k, S.cy); ctx.lineTo(S.cx, S.cy + h * k); ctx.lineTo(S.cx - w * k, S.cy); ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- layouts ----------
  // Every item is one word: { wd, s, thin, px, x (left), y (baseline), w, enter, t0 (when it arrives) }.
  function row(ws, px, thinOf, y, align, x0, enter) {
    const sp = px * 0.28;
    const its = ws.map(wd => { const s = caps(wd.w), thin = thinOf(wd); return { wd, s, thin, px, w: textW(s, (thin ? THIN : BOLD)(px)), y, enter, t0: wd.t }; });
    const total = its.reduce((a, it) => a + it.w, 0) + sp * (its.length - 1);
    let x = align === 'center' ? x0 - total / 2 : x0;
    its.forEach(it => { it.x = x; x += it.w + sp; });
    return its;
  }
  function chunks(ws, maxWords, maxChars) {
    const out = []; let cur = [];
    for (const wd of ws) {
      const len = cur.reduce((a, w) => a + w.w.length + 1, 0) + wd.w.length;
      if (cur.length && (cur.length >= maxWords || len > maxChars)) { out.push(cur); cur = []; }
      cur.push(wd);
    }
    if (cur.length) out.push(cur);
    return out;
  }
  function build(ph, r) {
    const S = stage(), ws = ph.words, n = ws.length, flash = n <= 6 && r() < 0.27 && !calmMode;   // calm: no cut-ins
    const last = ws[n - 1], thinOf = flash ? () => false : wd => wd !== last && wd.w.length > 1 && r() < 0.32;
    const thin = new Map(ws.map(wd => [wd, thinOf(wd)])), isThin = wd => thin.get(wd);
    const L = { flash: flash ? pickR(r, FLASH) : null, seed: Math.floor(r() * 1e6), items: [] };
    let type;
    if (flash) type = n <= 4 && r() < 0.6 ? 'band' : 'block';
    else if (n <= 4) type = pickR(r, ['stack', 'stack', 'line']);
    else if (n <= 6) type = pickR(r, ['stack', 'two', 'stair', 'line']);
    else type = pickR(r, ['two', 'stair', 'two']);
    L.type = type;
    const fit = (rows, frac, cap) => Math.min(cap, ...rows.map(rw => 100 * W * frac / textW(rw.map(w => caps(w.w)).join(' '), BOLD(100))));
    if (type === 'stack') {   // rows of 1-2 words, tight, dropping in
      const rows = chunks(ws, 2, 9), px = fit(rows, 0.42, S.h * 0.17), lh = px * 0.98;
      const y0 = S.cy - (rows.length - 1) * lh / 2 + px * 0.36;
      rows.forEach((rw, i) => L.items.push(...row(rw, px, isThin, y0 + i * lh, 'center', S.cx, 'drop')));
      L.zoom = true;
    } else if (type === 'line') {
      const px = fit([ws], 0.8, S.h * 0.13);
      L.items = row(ws, px, isThin, S.cy + px * 0.36, 'center', S.cx, 'squeeze');
    } else if (type === 'two') {
      const half = Math.ceil(n / 2), rows = [ws.slice(0, half), ws.slice(half)], px = fit(rows, 0.72, S.h * 0.12);
      const enter = r() < 0.5 ? 'squeeze' : 'slide';
      rows.forEach((rw, i) => L.items.push(...row(rw, px * (i ? 1 : 0.8), isThin, S.cy + (i ? px * 0.95 : -px * 0.2), 'center', S.cx, enter)));
    } else if (type === 'stair') {   // like the video's repeated "D-DON'T LET" lines, each stepped right and down
      const rows = chunks(ws, 3, 14), px = fit(rows, 0.4, S.h * 0.075), step = W * 0.08, lh = px * 1.55;
      const x0 = S.cx - (W * 0.4 + step * (rows.length - 1)) / 2, y0 = S.cy - (rows.length - 1) * lh / 2 + px * 0.36;
      rows.forEach((rw, i) => L.items.push(...row(rw, px, () => false, y0 + i * lh, 'left', x0 + i * step, 'slide')));
    } else if (type === 'band') {   // a black band across the middle, one word at a time, zooming in
      L.items = ws.map((wd, i) => {
        const s = caps(wd.w), px = Math.min(S.h * 0.1, 100 * W * 0.6 / textW(s, BOLD(100))) * (r() < 0.25 ? 0.45 : 1);
        return { wd, s, thin: false, px, w: textW(s, BOLD(px)), x: S.cx - textW(s, BOLD(px)) / 2, y: S.cy + px * 0.36, enter: 'zoom', t0: wd.t,
                 until: i + 1 < n ? ws[i + 1].t : Infinity };
      });
    } else {   // block: big bold lines on the flat color
      const rows = n <= 2 ? [ws] : [ws.slice(0, Math.ceil(n / 2)), ws.slice(Math.ceil(n / 2))], px = fit(rows, 0.7, S.h * 0.2);
      const lh = px * 0.95, y0 = S.cy - (rows.length - 1) * lh / 2 + px * 0.36;
      rows.forEach((rw, i) => L.items.push(...row(rw, px, () => false, y0 + i * lh, 'center', S.cx, 'zoom')));
    }
    return L;
  }
  function buildCard() {
    const S = stage(), title = caps(track.title || 'MUSIC SYNC'), who = caps(track.artist || '');
    const px = Math.min(S.h * 0.12, 100 * W * 0.6 / textW(title, BOLD(100))), pw = px * 0.4;
    const it = (s, thin, p, y, t0) => ({ wd: null, s, thin, px: p, w: textW(s, (thin ? THIN : BOLD)(p)), x: S.cx - textW(s, (thin ? THIN : BOLD)(p)) / 2, y, enter: 'squeeze', t0 });
    return { card: true, flash: null, seed: 7, zoom: false, items: [it(who, true, pw, S.cy - px * 0.6, 0.1), it(title, false, px, S.cy + px * 0.5, 0.45)] };
  }

  // ---------- drawing ----------
  function item(it, t, a, ink, dx) {   // one word, arriving its own way; t = song time (scene age on the card)
    const app = clamp((t - it.t0 + 0.12) / 0.24, 0, 1);
    if (app <= 0 || a <= 0.004) return;
    const e = easeOut(app), cx = it.x + it.w / 2 + dx, cy = it.y - it.px * 0.35;
    ctx.save(); warp(cx, cy); punchAt(it.wd, t, cx, cy, it.px);
    ctx.font = (it.thin ? THIN : BOLD)(it.px); ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (it.enter === 'drop') {   // falls in from above, stretched like a motion blur
      const st = 1 + (1 - e) * 0.9;
      ctx.globalAlpha = a * Math.min(1, app * 2.5);
      ctx.translate(cx, it.y - (1 - e) * it.px * 1.5); ctx.scale(1 / Math.sqrt(st), st); ctx.fillText(it.s, 0, 0);
    } else if (it.enter === 'squeeze') {   // wide letter spacing closing up
      ctx.letterSpacing = `${(1 - e) * 0.6 * it.px}px`; ctx.globalAlpha = a * e; ctx.fillText(it.s, cx, it.y);
    } else if (it.enter === 'slide') {   // from the left with a fading trail
      const ox = -(1 - e) * W * 0.22;
      for (let k = 3; k >= 0; k--) { ctx.globalAlpha = a * (k ? 0.18 * (1 - e) : e); ctx.fillText(it.s, cx + ox - k * (1 - e) * 46, it.y); }
    } else {   // zoom: down from huge, with ghost copies
      const s = 1 + (1 - e) * 1.6;
      for (let k = 2; k >= 0; k--) {
        const sk = 1 + (s - 1) * (1 + k * 0.5);
        ctx.save(); ctx.globalAlpha = a * (k ? 0.22 * (1 - e) : Math.min(1, app * 2));
        ctx.translate(cx, cy); ctx.scale(sk, sk); ctx.translate(-cx, -cy); ctx.fillText(it.s, cx, it.y); ctx.restore();
      }
    }
    ctx.restore();
  }
  function words(sc, t, a, ink, dx = 0) {
    const L = sc.L, tt = sc.card ? sceneT - sc.at : t;
    ctx.save();
    if (L.zoom && sc.ph) {   // the stack keeps growing slowly while it's up
      const z = 1 + 0.12 * clamp((t - sc.ph.t0) / Math.max(1, sc.ph.t1 - sc.ph.t0), 0, 1), S = stage();
      ctx.translate(S.cx, S.cy); ctx.scale(z, z); ctx.translate(-S.cx, -S.cy);
    }
    if (L.type === 'band') {
      const S = stage(), cur = L.items.find(it => t >= it.t0 - 0.12 && t < it.until - 0.03) || (t < L.items[0].t0 ? null : L.items[L.items.length - 1]);
      ctx.globalAlpha = a; ctx.fillStyle = '#000'; const bh = S.h * 0.16;
      ctx.fillRect(0, S.cy - bh / 2, W, bh * easeOut((sceneT - sc.at) / 0.25));
      if (cur) item(cur, t, a, '#FFFFFF', dx);
    } else L.items.forEach(it => item(it, tt, a, ink, dx));
    ctx.restore();
  }

  let cutAt = -9, burstAt = -9, burstSeed = 1, frameAt = -9;
  LOOKS.push({
    id: 'space', name: 'Deep Space', exit: 0.35,
    reset() { cutAt = burstAt = frameAt = -9; },
    build, buildCard,
    enter(cur, prev, T) {
      if (cur.L.flash || (prev && prev.L.flash)) cutAt = T;   // a hard cut gets a white flash
      if (cur.L.flash) frameAt = T; else { burstAt = T; burstSeed = cur.L.seed; }
    },
    frame(T) {
      const d = direct(this, T), cur = d.cur, F = cur.L.flash;
      if (F) {
        ctx.fillStyle = F.bg; ctx.fillRect(-40, -40, W + 80, H + 80);
        streaks(T, 0, cur.L.seed, F.lines, true); diamonds(T, F.frame, frameAt);
      } else {
        sky(T); bodies(T);
        streaks(T, burstAt, burstSeed, 'rgba(220,210,255,0.8)', cur.card);
      }
      const ink = F ? F.ink : INK;
      if (d.prev) {   // the old line leaves with an RGB split, drifting apart
        const p = clamp((T - d.prev.out) / this.exit, 0, 1), ga = sceneFade * (1 - p), ox = 40 * easeOut(p);
        const pin = d.prev.L.flash ? d.prev.L.flash.ink : LILAC;
        words(d.prev, d.t, ga * 0.6, '#FF2A4D', -ox); words(d.prev, d.t, ga * 0.6, '#2AE0FF', ox); words(d.prev, d.t, ga, pin, 0);
      }
      words(cur, d.t, sceneFade, ink);
      if (T - cutAt < 0.14) { ctx.globalAlpha = 0.55 * (1 - (T - cutAt) / 0.14); ctx.fillStyle = '#FFF'; ctx.fillRect(-40, -40, W + 80, H + 80); }
      setAccent(F ? F.ink === '#111111' ? '#2AE0FF' : F.ink : '#B9A8FF');
    },
  });
})();
