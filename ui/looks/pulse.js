// Look 2: Pink Poster (from the BLACKPINK "Crazy Over You" kinetic-typography video).
// Morphing pink/maroon gradient blobs with film grain, extra-wide heavy caps that show as outline ghosts and fill in
// as they're sung, small edge captions, giant outline letters, echo rows, a lettered sphere and shattering glass.
(() => {
  const HOT = '#FF1F8E', LILAC = '#F48FD8', MAROON = '#2B1020';
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mixc = (a, b, f) => hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * f));
  const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const font = (px, it, wt = 900) => { ctx.font = `${it ? 'italic ' : ''}${wt} ${px}px Archivo`; ctx.fontStretch = 'expanded'; };
  const measure = (s, px, it, wt) => { font(px, it, wt); return ctx.measureText(s).width; };
  const fit = (s, maxW, maxPx, it) => Math.min(maxPx, 100 * maxW / measure(s, 100, it));

  // Background: a small canvas of soft blobs, scaled up to the screen (scaling does the blurring for free).
  const blob = document.createElement('canvas'); blob.width = 240; blob.height = 135;
  const bx = blob.getContext('2d');
  let mix = 0;   // 0 = light pink scene, 1 = dark scene
  let grainL, grainD;
  function background(T, dark) {
    mix += ((dark ? 1 : 0) - mix) * 0.05;
    bx.globalCompositeOperation = 'source-over';
    bx.fillStyle = css(mixc('#F27FBA', '#1A0A12', mix)); bx.fillRect(0, 0, 240, 135);
    const blobs = [[0.22, 0.5, 0.55, '#FF0A84', '#7A1446'], [0.78, 0.28, 0.5, '#FFF6FA', '#3A1426'],
                   [0.58, 0.9, 0.45, '#9E7C96', '#240C18'], [0.08, 0.08, 0.4, '#FF4FA6', '#5A1034'],
                   [0.9, 0.85, 0.35, '#FF1F8E', '#2E0F1E']];
    blobs.forEach(([x, y, r, a, b], i) => {
      const px = (x + 0.2 * Math.sin(T * 0.11 + i * 1.7)) * 240, py = (y + 0.22 * Math.cos(T * 0.09 + i * 2.3)) * 135;
      const pr = r * 240 * (1 + 0.18 * Math.sin(T * 0.13 + i));
      const c = mixc(a, b, mix), g = bx.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, css(c, 0.95)); g.addColorStop(1, css(c, 0));
      bx.fillStyle = g; bx.fillRect(0, 0, 240, 135);
    });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(blob, 0, 0, W, H);
  }
  function grain() {
    grainL = grainL || ctx.createPattern(noiseTile(220, true, 0.55), 'repeat');
    grainD = grainD || ctx.createPattern(noiseTile(220, false, 0.55), 'repeat');
    ctx.save();
    for (const [p, a] of [[grainL, 0.07], [grainD, 0.09]]) {
      ctx.globalAlpha = a; ctx.fillStyle = p;
      ctx.setTransform(1, 0, 0, 1, Math.random() * 220, Math.random() * 220);
      ctx.fillRect(-220, -220, W + 440, H + 440);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.drawImage(layer('pulse-vignette', g => {
      const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = v; g.fillRect(0, 0, W, H);
    }), 0, 0, W, H);
  }
  const ink = () => css(mixc(MAROON, '#FFFFFF', mix));   // text that reads on the current background

  // ---------- layouts ----------
  // Every layout is a list of word items {s, wd, x, y, px, it, fill, outline}; x is the left edge, y the baseline.
  function rowItems(words, x, y, px, it, fill, outline) {
    const space = measure(' ', px, it);
    return words.map(wd => {
      const s = caps(wd.w), w = measure(s, px, it);
      const item = { s, wd, x, y, px, it, fill, outline, w };
      x += w + space;
      return item;
    });
  }
  const rowWidth = (words, px, it) => measure(words.map(w => caps(w.w)).join(' '), px, it);

  function build(ph, r) {
    const S = stage(), ws = ph.words, n = ws.length, text = ws.map(w => caps(w.w)).join(' ');
    const longest = ws.reduce((a, b) => (b.w.length > a.w.length ? b : a));
    const dark = r() < 0.45;
    let type;
    if (n === 1) type = r() < 0.6 ? 'big' : 'echo';
    else if (n <= 3) type = pickR(r, ['echo', 'echo', 'sphere', 'stack', 'pair']);
    else if (n <= 5) type = pickR(r, text.length <= 18 ? ['stack', 'pair', 'echo', 'sphere'] : ['stack', 'pair', 'stack']);
    else type = pickR(r, ['stack', 'pair', 'stack']);
    const L = { type, dark, items: [], rows: [], exit: r() < 0.5 ? 'blur' : 'slice', marquee: r() < 0.28,
                edge: caps(longest.w), giant: caps(longest.w.replace(/[^a-z]/gi, '')).slice(0, 2) || 'O',
                giantX: pickR(r, [0.1, 0.62, 0.86]), shatter: r() < 0.45 };
    const ghostFill = dark ? 'grad' : 'dark';

    if (type === 'big') {
      const s = caps(ws[0].w), px = fit(s, W * 0.7, S.h * 0.42, false);
      const w = measure(s, px);
      L.items = [{ s, wd: ws[0], x: S.cx - w / 2, y: S.cy + px * 0.36, px, it: false, fill: 'white', big: true, w }];
      L.shatter = true;
    } else if (type === 'echo') {
      const s = n <= 3 ? text : caps(longest.w), px = fit(s, W * 0.74, S.h / 6.4, false), rows = 5;
      const y0 = S.cy - 2 * px * 1.02 + px * 0.36, x0 = S.cx - measure(s, px) / 2;
      L.echo = { s, px, rows, y0, x0 };
      L.items = n <= 3 ? rowItems(ws, x0, y0 + 2 * px * 1.02, px, false, 'white')
                       : [{ s, wd: longest, x: x0, y: y0 + 2 * px * 1.02, px, it: false, fill: 'white', w: measure(s, px) }];
    } else if (type === 'stack') {
      const rows = [];
      for (const wd of ws) {
        const last = rows[rows.length - 1];
        if (last && last.length === 1 && (last[0].w + wd.w).length <= 10 && r() < 0.75) last.push(wd);
        else rows.push([wd]);
      }
      while (rows.length > 5) { const a = rows.findIndex((x, i) => i + 1 < rows.length && x.length + rows[i + 1].length <= 3); rows.splice(a < 0 ? 0 : a, 2, rows[a < 0 ? 0 : a].concat(rows[(a < 0 ? 0 : a) + 1])); }
      const it = true;
      let px = Math.min(...rows.map(rw => 100 * W * 0.6 / rowWidth(rw, 100, it)), S.h * 0.78 / (rows.length * 0.95));
      const lh = px * 0.95, y0 = S.cy - (rows.length * lh) / 2 + lh * 0.78;
      rows.forEach((rw, i) => {
        const outline = rows.length > 2 && r() < 0.32;
        L.items.push(...rowItems(rw, S.cx - rowWidth(rw, px, it) / 2, y0 + i * lh, px, it, ghostFill, outline));
      });
    } else if (type === 'pair') {
      let cut = Math.ceil(n / 2);
      const a = ws.slice(0, cut), b = ws.slice(cut);
      const px1 = Math.min(100 * W * 0.84 / rowWidth(a, 100, false), S.h * 0.24);
      const px2 = Math.min(px1 * 0.64, b.length ? 100 * W * 0.84 / rowWidth(b, 100, false) : px1);
      const x = W * 0.07, h = px1 * 0.8 + (b.length ? px2 * 1.05 : 0), y1 = S.cy - h / 2 + px1 * 0.75;
      L.items = rowItems(a, x, y1, px1, false, dark ? 'grad' : 'grad', false)
        .concat(b.length ? rowItems(b, x, y1 + px2 * 1.1, px2, false, 'hot', false) : []);
      L.block = { y: y1 - px1 * 0.85, h: px1 * 1.05 };
    } else {   // sphere
      const px = S.h / 8.5, unit = text + '   ', reps = Math.ceil(W * 1.3 / measure(unit, px)) + 2;
      const R = S.h * 0.36;
      // letters of 5 bands around the ball, measured once here instead of every frame
      const bands = [-0.95, -0.5, 0, 0.5, 0.95].map(lat => {
        // repeat the phrase just enough to go once around the ball (smaller letters if even once is too long),
        // so letters never pile up
        const around = 2 * Math.PI * R * Math.cos(lat), chars = [];
        let bpx = R * 0.24 * (0.6 + 0.4 * Math.cos(lat));
        font(bpx, false);
        bpx *= Math.min(1, around * 0.95 / ctx.measureText(text + ' ').width);
        font(bpx, false);
        const reps = Math.max(1, Math.floor(around / ctx.measureText(text + ' ').width));
        let s = 0;
        for (let rep = 0; rep < reps; rep++) ws.forEach(wd => {
          for (const c of caps(wd.w) + ' ') { const cw = ctx.measureText(c).width; chars.push({ c, wd, at: s + cw / 2 }); s += cw; }
        });
        return { lat, px: bpx, chars };
      });
      L.sphere = { R, px, bands, rowsText: unit.repeat(reps), unitW: measure(unit, px) };
      L.items = [];
    }
    return L;
  }

  function buildCard() {
    const S = stage(), name = caps(track.artist || track.title || 'MUSIC SYNC');
    const px = fit(name, W * 0.62, S.h * 0.16, false);
    return { type: 'card', dark: true, px, name, sub: caps(track.title || ''), edge: caps(track.title || ''),
             giant: '', items: [], exit: 'blur' };
  }

  // ---------- drawing ----------
  function fillFor(item, a) {
    if (item.fill === 'white') return css([255, 255, 255], a);
    if (item.fill === 'hot') return css(hex(HOT), a);
    if (item.fill === 'dark') return css(hex(MAROON), a);
    const g = ctx.createLinearGradient(item.x, 0, item.x + item.w, 0);   // 'grad'
    g.addColorStop(0, mix > 0.5 ? '#FF2E95' : '#5A1032');
    g.addColorStop(1, mix > 0.5 ? '#FFD3E6' : '#FF4FA3');
    return g;
  }

  function drawItems(sc, t, T, alphaAll) {
    for (const it of sc.L.items) {
      const p = sung(it.wd, t, 0.12), q = easeOut(sung(it.wd, t, 0.35));
      const appear = easeOut((T - sc.at) / 0.35);
      font(it.px, it.it);
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      if (it.big && p > 0) {   // big word: lands with a short blur-in and settle
        const e = clamp((t - it.wd.t) / 0.3, 0, 1), sc2 = 1 + 0.12 * (1 - easeOut(e));
        ctx.save();
        ctx.translate(it.x + it.w / 2, it.y - it.px * 0.36); ctx.scale(sc2, sc2); ctx.translate(-it.x - it.w / 2, -it.y + it.px * 0.36);
        if (e < 1) ctx.filter = `blur(${(1 - e) * 10}px)`;
        ctx.globalAlpha = alphaAll * p; ctx.fillStyle = fillFor(it, 1); ctx.fillText(it.s, it.x, it.y);
        ctx.restore();
        continue;
      }
      // ghost outline until sung, then fill slides in
      ctx.lineWidth = Math.max(1, it.px / 70);
      ctx.strokeStyle = it.fill === 'white' ? 'rgba(255,255,255,0.8)' : ink();
      ctx.globalAlpha = alphaAll * appear * (it.outline ? 0.9 : 0.75 * (1 - p));
      ctx.strokeText(it.s, it.x, it.y);
      if (p > 0 && !it.outline) {
        ctx.globalAlpha = alphaAll * p;
        ctx.fillStyle = fillFor(it, 1);
        ctx.fillText(it.s, it.x - (1 - q) * 22, it.y);
      } else if (p > 0) {   // outline rows light up instead of filling
        ctx.globalAlpha = alphaAll * p; ctx.lineWidth = Math.max(1.5, it.px / 45);
        ctx.strokeStyle = mix > 0.5 ? '#FFFFFF' : MAROON; ctx.strokeText(it.s, it.x, it.y);
      }
    }
  }

  function drawEcho(sc, t, T, a) {
    const E = sc.L.echo, age = T - sc.at;
    font(E.px, false); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = Math.max(1, E.px / 70);
    for (let i = 0; i < E.rows; i++) {
      if (i === 2) continue;
      const d = Math.abs(i - 2), drift = (i % 2 ? 1 : -1) * age * 26;
      ctx.globalAlpha = a * easeOut((age - d * 0.06) / 0.3) * (d === 1 ? 0.7 : 0.4);
      ctx.strokeStyle = ink();
      ctx.strokeText(E.s, E.x0 + drift, E.y0 + i * E.px * 1.02);
    }
  }

  function drawSphere(sc, t, T, a) {
    const S = stage(), Sp = sc.L.sphere, ws = sc.ph.words, age = T - sc.at;
    // rows of the phrase behind the ball
    font(Sp.px, false); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineWidth = 1.2;
    const rows = 8;
    for (let i = 0; i < rows; i++) {
      const y = S.y + (i + 0.5) * S.h / rows, dir = i % 2 ? 1 : -1, x = -(((age * 40 * dir) % Sp.unitW) + Sp.unitW) % Sp.unitW - Sp.unitW;
      ctx.globalAlpha = a * 0.75;
      if (i % 2) { ctx.fillStyle = mix > 0.5 ? 'rgba(255,255,255,0.85)' : MAROON; ctx.fillText(Sp.rowsText, x, y); }
      else { ctx.strokeStyle = ink(); ctx.strokeText(Sp.rowsText, x, y); }
    }
    // the ball
    const R = Sp.R * backOut(age / 0.5), cx = S.cx, cy = S.cy;
    if (R <= 2) return;
    ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    g.addColorStop(0, '#3A1428'); g.addColorStop(1, '#0C0408');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.29); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.29); ctx.clip();
    const k = R / Sp.R, M = ctx.getTransform();   // the ball pops in by scaling the whole lettered surface
    Sp.bands.forEach((band, b) => {
      const rr = Sp.R * Math.cos(band.lat), y = Sp.R * Math.sin(band.lat);
      ctx.setTransform(M); font(band.px * k, false); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#FF9CCB'; ctx.lineWidth = 1;
      const spin = (b % 2 ? -1 : 1) * T * 0.55 + b;
      for (const ch of band.chars) {
        const lon = spin + ch.at / rr, cl = Math.cos(lon);
        if (cl < 0.06) continue;
        ctx.setTransform(M); ctx.translate(cx + rr * Math.sin(lon) * k, cy + y * k); ctx.scale(cl, 1);
        const lit = b === 2 && sung(ch.wd, t) > 0;
        ctx.globalAlpha = a * (0.35 + 0.65 * cl);
        if (b === 2 && !lit) ctx.strokeText(ch.c, 0, 0);
        else { ctx.fillStyle = lit ? HOT : (b % 2 ? '#FFFFFF' : '#FF9CCB'); ctx.fillText(ch.c, 0, 0); }
      }
    });
    ctx.setTransform(M);
    ctx.restore();
    // rim light
    ctx.globalAlpha = a * 0.5; ctx.strokeStyle = '#FF7AB8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.29); ctx.stroke();
  }

  function drawBlock(sc, T) {   // dark block sweeping right to left over a title pair, revealing it
    const B = sc.L.block, e = easeInOut((T - sc.at) / 0.55), bw = W * 0.55, x = W - e * (W + bw);
    if (e >= 1) return W + 1;
    ctx.globalAlpha = sceneFade; ctx.fillStyle = mix > 0.5 ? '#FF2E93' : '#1A0A12';
    ctx.fillRect(x, B.y, bw, B.h);
    return x + bw;   // text is revealed to the right of this
  }

  function drawGiant(sc, T) {
    const g = sc.L.giant; if (!g) return;
    const px = H * 0.5, x = W * sc.L.giantX;
    font(px, false, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 1.6; ctx.strokeStyle = ink();
    ctx.globalAlpha = 0.5 * sceneFade * easeOut((T - sc.at) / 0.6);
    const drift = Math.sin(T * 0.25) * 14;
    [...g].forEach((c, i) => ctx.strokeText(c, x, (i ? H * 0.82 : H * 0.18) + drift));
  }

  function drawEdges(sc, T, a) {
    const s = sc.L.edge || ''; if (!s) return;
    const px = clamp(W * 0.0085, 9, 15), top = TOP > 60 ? TOP - 6 : 26, bot = H - 22;
    font(px, false, 800); ctx.letterSpacing = '0.04em'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = a * 0.92;
    if (sc.L.marquee) {
      const unit = s + '        ', uw = measure(unit, px, false, 800), off = (T * 50) % uw;
      ctx.fillStyle = ink(); ctx.textAlign = 'left';
      const run = (len) => { for (let x = -off; x < len; x += uw) ctx.fillText(unit, x, 0); };
      ctx.save(); ctx.translate(0, top); run(W); ctx.restore();
      ctx.save(); ctx.translate(W, bot); ctx.rotate(Math.PI); run(W); ctx.restore();
      ctx.save(); ctx.translate(W - 18, top); ctx.rotate(Math.PI / 2); run(bot - top); ctx.restore();
      ctx.save(); ctx.translate(18, bot); ctx.rotate(-Math.PI / 2); run(bot - top); ctx.restore();
    } else {
      [[0.03, 'left'], [0.5, 'center'], [0.97, 'right']].forEach(([fx, al], i) => {
        ctx.textAlign = al; ctx.fillStyle = i ? ink() : HOT;
        ctx.fillText(s, W * fx, top); ctx.fillText(s, W * fx, bot);
      });
    }
    ctx.letterSpacing = '0px';
  }

  function drawCard(sc, T, a) {
    const S = stage(), L = sc.L, age = T - sc.at, im = art();
    if (im) {   // album art as a pink duotone photo, like the video's opening
      const k = Math.max(W / im.naturalWidth, H / im.naturalHeight) * 1.05, w = im.naturalWidth * k, h = im.naturalHeight * k;
      ctx.save(); ctx.globalAlpha = a * 0.85; ctx.filter = 'grayscale(1) contrast(1.15) brightness(0.75)';
      ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); ctx.filter = 'none';
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#FF6FC8'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * 0.35; ctx.fillStyle = '#0A0306'; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    font(L.px, false); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const y0 = S.cy - L.px * 1.2;
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = a * easeOut((age - i * 0.12) / 0.4) * (i ? 0.85 - i * 0.18 : 1);
      if (i === 0) { ctx.fillStyle = LILAC; ctx.fillText(L.name, S.cx, y0); }
      else { ctx.strokeStyle = LILAC; ctx.lineWidth = Math.max(1, L.px / 60); ctx.strokeText(L.name, S.cx, y0 + i * L.px * 0.92); }
    }
    font(clamp(W * 0.011, 11, 20), false, 800); ctx.letterSpacing = '0.06em';
    ctx.globalAlpha = a * easeOut((age - 0.5) / 0.4); ctx.fillStyle = LILAC;
    ctx.fillText(L.sub, S.cx, y0 + 4 * L.px * 0.92 + 10);
    ctx.letterSpacing = '0px';
  }

  // Shattered glass: shards burst from the word that just landed.
  let shards = [];
  function shatter(x, y, T) {
    for (let i = 0; i < 34; i++) {
      const a = rand(0, 6.28), v = rand(260, 900), n = 3 + Math.floor(rand(0, 3)), sz = rand(18, 90), pts = [];
      for (let k = 0; k < n; k++) { const t = k / n * 6.28 + rand(-0.4, 0.4); pts.push([Math.cos(t) * sz * rand(0.4, 1), Math.sin(t) * sz * rand(0.4, 1)]); }
      shards.push({ x: x + rand(-80, 80), y: y + rand(-40, 40), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120,
                    rot: rand(0, 6.28), spin: rand(-6, 6), pts, born: T, shade: rand(0.55, 1) });
    }
  }
  function drawShards(T) {
    shards = shards.filter(s => T - s.born < 1.2);
    for (const s of shards) {
      const age = T - s.born, x = s.x + s.vx * age, y = s.y + s.vy * age + 400 * age * age;
      ctx.save(); ctx.translate(x, y); ctx.rotate(s.rot + s.spin * age);
      ctx.globalAlpha = sceneFade * (1 - age / 1.2);
      const g = ctx.createLinearGradient(-40, -40, 40, 40);
      g.addColorStop(0, css([255, 255, 255], 0.95)); g.addColorStop(0.5, css(mixc('#F7C3DA', '#B98AA6', 1 - s.shade), 0.9));
      g.addColorStop(1, css([120, 90, 110], 0.85));
      ctx.fillStyle = g; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); s.pts.forEach(([px, py], k) => ctx[k ? 'lineTo' : 'moveTo'](px, py)); ctx.closePath();
      ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }

  function drawScene(sc, t, T, a) {
    if (sc.card) return drawCard(sc, T, a);
    const L = sc.L;
    if (L.type === 'echo') drawEcho(sc, t, T, a);
    if (L.type === 'sphere') return drawSphere(sc, t, T, a);
    let revealX = 0;
    if (L.block && T - sc.at < 0.6) revealX = drawBlock(sc, T);
    ctx.save();
    if (revealX) { ctx.beginPath(); ctx.rect(revealX, 0, W, H); ctx.clip(); }
    drawItems(sc, t, T, a);
    ctx.restore();
    if (revealX) drawBlock(sc, T);
  }

  function drawExit(sc, t, T, p) {
    const a = sceneFade * (1 - p);
    if (sc.L.exit === 'slice') {   // horizontal slices sliding apart
      const n = 6;
      for (let i = 0; i < n; i++) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, H * i / n, W, H / n + 1); ctx.clip();
        ctx.translate((i % 2 ? 1 : -1) * p * p * W * 0.25, 0);
        drawScene(sc, t, T, a); ctx.restore();
      }
    } else {
      ctx.save(); ctx.filter = `blur(${p * 18}px)`; ctx.translate(-p * 80, 0);
      drawScene(sc, t, T, a); ctx.restore();
    }
  }

  LOOKS.push({
    id: 'pulse', name: 'Pink Poster', exit: 0.4,
    reset() { shards = []; },
    build, buildCard,
    frame(T) {
      const d = direct(this, T), cur = d.cur, L = cur.L;
      background(T, L.dark);
      if (!cur.card) drawGiant(cur, T);
      if (d.prev) drawExit(d.prev, d.t, T, (T - d.prev.out) / this.exit);
      drawScene(cur, d.t, T, sceneFade);
      // shatter once when a big line-end word lands
      const hit = !cur.card && L.shatter && L.items.find(it => it.wd.end && sung(it.wd, d.t) > 0);
      if (hit && !cur.shattered) { cur.shattered = true; font(hit.px, hit.it); shatter(hit.x + hit.w / 2, hit.y - hit.px * 0.4, T); }
      drawShards(T);
      drawEdges(cur, T, sceneFade);
      grain();
      setAccent(cur.card ? LILAC : (L.dark ? '#FF7AC0' : MAROON));
    },
  });
})();
