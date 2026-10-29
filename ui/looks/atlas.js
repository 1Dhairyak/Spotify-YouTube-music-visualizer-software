// Look 5: Night Map (from the Maroon 5 "Maps" kinetic-typography video).
// Two scenes that take turns every few phrases: a teal night sky with drifting dust and clouds, where thin
// letter-spaced words wave in and the line-end word assembles from flying letters (candy-striped, white or teal);
// and a generated city map the camera glides and turns over, with each line written along a road and a pin dropping.
(() => {
  const thin = px => `300 ${px}px Bahnschrift, "Josefin Sans", sans-serif`;
  const bold = px => `${px}px "League Gothic"`;
  const round = px => `700 ${px}px "Josefin Sans"`;
  const road = px => `700 ${px}px "Josefin Sans"`;
  const SKY = { teal: ['#0F5A52', '#08362F', '#031A17', '#3AA595'], grey: ['#5E5E5E', '#2F2F2F', '#151515', '#BDBDBD'] };
  const GREENS = ['#7BC47F', '#5CAE73', '#2E8C6E', '#3A9A78', '#8FD08A'];

  let candy;
  function candyFill() {   // salmon and cream diagonal stripes, like the video's "CONVERSATION"
    if (!candy) {
      const c = document.createElement('canvas'); c.width = c.height = 14;
      const g = c.getContext('2d'); g.fillStyle = '#F6EDE7'; g.fillRect(0, 0, 14, 14);
      g.strokeStyle = '#E8786A'; g.lineWidth = 4.5;
      for (const o of [-14, 0, 14]) { g.beginPath(); g.moveTo(o, 14); g.lineTo(o + 14, 0); g.stroke(); }
      candy = ctx.createPattern(c, 'repeat');
    }
    return candy;
  }
  const measure = (s, font) => { ctx.font = font; return ctx.measureText(s).width; };

  // ---------- sky ----------
  const dust = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.4,
    vx: -0.002 - Math.random() * 0.004, vy: -0.001 + Math.random() * 0.002, ph: Math.random() * 6.28 }));
  let lastT = 0;
  function sky(T, tone, a = 1) {
    const c = SKY[tone];
    ctx.globalAlpha = a;
    ctx.drawImage(layer('atlas-sky-' + tone, g => {
      const gr = g.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, Math.hypot(W, H) * 0.6);
      gr.addColorStop(0, c[0]); gr.addColorStop(0.55, c[1]); gr.addColorStop(1, c[2]);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }), 0, 0, W, H);
    const dt = Math.min(0.05, T - lastT); lastT = T;
    ctx.fillStyle = '#E6FFF8';
    for (const d of dust) {   // drifting specks that twinkle
      d.x = (d.x + d.vx * dt * 10 + 1) % 1; d.y = (d.y + d.vy * dt * 10 + 1) % 1;
      ctx.globalAlpha = a * (0.25 + 0.45 * (0.5 + 0.5 * Math.sin(T * 1.7 + d.ph)));
      ctx.fillRect(d.x * W, d.y * H, d.s, d.s);
    }
    ctx.globalAlpha = 1;
  }
  function cloud(x, y, s, a) {
    ctx.globalAlpha = a;
    ctx.fillStyle = '#C9CCCB';
    ctx.beginPath();
    for (const [cx, cy, r] of [[-0.55, 0.05, 0.38], [-0.1, -0.22, 0.5], [0.38, -0.05, 0.42], [0.75, 0.12, 0.28]]) {
      ctx.moveTo(x + (cx + r) * s, y + cy * s); ctx.arc(x + cx * s, y + cy * s, r * s, 0, 6.29);
    }
    ctx.fill();
    ctx.fillRect(x - 0.85 * s, y + 0.05 * s, 1.85 * s, 0.33 * s);
    ctx.fillStyle = '#A7ABAA'; ctx.fillRect(x - 0.8 * s, y + 0.3 * s, 1.75 * s, 0.08 * s);
    ctx.strokeStyle = '#9AA09F'; ctx.lineWidth = Math.max(1.5, s * 0.04); ctx.beginPath();   // the swirl
    for (let i = 0; i <= 30; i++) { const t = i / 30 * 4.5, r = 0.04 + t * 0.045; ctx[i ? 'lineTo' : 'moveTo'](x - 0.1 * s + Math.cos(t) * r * s, y - 0.1 * s + Math.sin(t) * r * s); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }

  // ---------- map ----------
  let world = null, worldFor = null, roads = [];
  const WS = 2400;
  function makeWorld() {
    if (worldFor === track.title && world) return;
    worldFor = track.title;
    const r = rng(hash(track.title + ':map')), g0 = 300;
    world = world || document.createElement('canvas'); world.width = world.height = WS;
    const g = world.getContext('2d');
    g.fillStyle = '#1E2522'; g.fillRect(0, 0, WS, WS);
    const xs = [], ys = [];
    for (let v = 60; v < WS; v += g0) xs.push(v + (r() - 0.5) * 70);
    for (let v = 60; v < WS; v += g0) ys.push(v + (r() - 0.5) * 70);
    // blocks inside each cell
    for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
      const x0 = xs[i] + 20, y0 = ys[j] + 20, w = xs[i + 1] - xs[i] - 40, h = ys[j + 1] - ys[j] - 40;
      if (r() < 0.1) {   // a lake
        g.fillStyle = '#2A8C78'; g.beginPath(); g.ellipse(x0 + w / 2, y0 + h / 2, w * 0.48, h * 0.4, r(), 0, 6.29); g.fill();
        g.fillStyle = '#1F7666'; g.beginPath(); g.ellipse(x0 + w / 2, y0 + h / 2, w * 0.3, h * 0.22, r(), 0, 6.29); g.fill();
        continue;
      }
      const k = 1 + Math.floor(r() * 4);
      for (let b = 0; b < k; b++) {
        g.fillStyle = pickR(r, GREENS);
        const bw = w * (0.25 + r() * 0.5), bh = h * (0.2 + r() * 0.5);
        g.fillRect(x0 + r() * (w - bw), y0 + r() * (h - bh), bw, bh);
      }
    }
    // roads: two pale lines with dark tarmac between
    const roadW = 22;
    g.lineCap = 'round';
    const drawRoad = (x1, y1, x2, y2) => {
      g.strokeStyle = '#C8DE78'; g.lineWidth = roadW + 6; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.strokeStyle = '#1E2522'; g.lineWidth = roadW; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    };
    xs.forEach(x => drawRoad(x, 0, x, WS));
    ys.forEach(y => drawRoad(0, y, WS, y));
    const d = [0, WS * (0.25 + r() * 0.3), WS, WS * (0.55 + r() * 0.3)];
    drawRoad(...d);
    // segments the lyrics can be written along
    roads = [];
    ys.forEach((y, j) => { if (j && j < ys.length - 1) for (let i = 0; i + 4 < xs.length; i += 2) roads.push({ x1: xs[i], y1: y, x2: xs[i + 4], y2: y }); });
    xs.forEach((x, i) => { if (i && i < xs.length - 1) for (let j = 0; j + 4 < ys.length; j += 2) roads.push({ x1: x, y1: ys[j], x2: x, y2: ys[j + 4] }); });
    for (let f = 0.15; f < 0.8; f += 0.2) roads.push({ x1: lerp(d[0], d[2], f), y1: lerp(d[1], d[3], f), x2: lerp(d[0], d[2], f + 0.25), y2: lerp(d[1], d[3], f + 0.25) });
    const inside = v => v > 650 && v < WS - 650;   // keep the camera away from the edge of the city
    roads = roads.filter(s => inside((s.x1 + s.x2) / 2) && inside((s.y1 + s.y2) / 2));
  }
  const cam = { x: WS / 2, y: WS / 2, rot: 0, z: 0.6 };
  function mapView(T, a, scale = 1) {
    makeWorld();
    const S = stage();
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = '#1E2522'; ctx.fillRect(0, 0, W, H);   // same as the map ground, so its edge never shows
    ctx.translate(W / 2, S.cy); ctx.scale(scale, scale * 0.88); ctx.rotate(cam.rot); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    ctx.drawImage(world, 0, 0);
    return () => ctx.restore();
  }

  // ---------- layouts ----------
  function build(ph, r, sc) {
    const S = stage(), ws = ph.words, n = ws.length;
    const block = Math.floor(ph.i / 3), kind = block % 2 ? 'map' : 'sky';
    const tone = rng(hash(track.title + ':tone' + block))() < 0.25 ? 'grey' : 'teal';
    const L = { kind, tone, words: ws };
    if (kind === 'sky') {
      const emph = ws[n - 1];
      let cut = n - 1;
      while (cut > 0 && n - cut <= 3 && ws[cut - 1].w.length <= 3 && cut > 1) cut--;   // small words before the end: "all of the"
      const lead = ws.slice(0, Math.min(cut, n - 1)), mid = ws.slice(lead.length, n - 1);
      const leadS = lead.map(w => caps(w.w)).join(' '), midS = mid.map(w => w.w.toLowerCase()).join(' '), emS = caps(emph.w);
      ctx.letterSpacing = '0.08em';
      const pxL = leadS ? Math.min(100 * W * 0.5 / measure(leadS, thin(100)), S.h * 0.085) : 0;
      ctx.letterSpacing = '0px';
      const pxE = Math.min(100 * W * 0.46 / measure(emS, bold(100)), S.h * 0.22);
      const pxM = midS ? Math.min(pxE * 0.42, 100 * W * 0.4 / measure(midS, round(100))) : 0;
      const hTot = (pxL ? pxL * 1.1 : 0) + (pxM ? pxM * 1.05 : 0) + pxE * 0.82;
      ctx.letterSpacing = '0.08em';
      const wLead = leadS ? measure(leadS, thin(pxL)) : 0;
      ctx.letterSpacing = '0px';
      const wMax = Math.max(wLead, measure(emS, bold(pxE)), midS ? measure(midS, round(pxM)) : 0);
      const x = S.cx - wMax / 2 + (r() - 0.5) * W * 0.1;
      let y = S.cy - hTot / 2 + (r() - 0.5) * S.h * 0.15;
      if (pxL) { y += pxL; L.lead = { words: lead, x, y, px: pxL }; y += pxL * 0.1; }
      if (pxM) { y += pxM * 1.05; L.mid = { words: mid, x: x + 4, y, px: pxM, s: midS }; y += pxM * 0.3; }
      y += pxE * 0.86;
      L.emph = { wd: emph, s: emS, x, y, px: pxE, style: pickR(r, ['candy', 'candy', 'white', 'teal']),
                 scatter: [...emS].map(() => ({ dx: (r() - 0.5) * W * 0.5, dy: (r() - 0.5) * H * 0.4, rot: (r() - 0.5) * 3, d: r() * 0.15 })) };
      L.clouds = r() < 0.55 ? [0, 1, 2].map(() => ({ x: r() * W, y: S.y + r() * S.h, s: S.h * (0.06 + r() * 0.08), v: (r() - 0.3) * 18 })) : [];
    } else {
      makeWorld();
      const seg = roads[Math.floor(r() * roads.length)], ang = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
      const text = ws.map(w => caps(w.w)).join(' '), px = 64, len = measure(text, road(px));
      const z = clamp(S.h * 0.12 / px, 0.5, 2.4);   // close up: about three words fill the screen, like the video
      const tilt = (r() < 0.5 ? -1 : 1) * (0.25 + r() * 0.35);
      const mx = (seg.x1 + seg.x2) / 2, my = (seg.y1 + seg.y2) / 2, space = measure(' ', road(px));
      let off = -len / 2;
      const centers = ws.map(wd => { const w = measure(caps(wd.w), road(px)), c = off + w / 2; off += w + space; return c; });
      Object.assign(L, { seg, ang, text, px, len, mx, my, centers,
                         cam: { x: mx + Math.cos(ang) * centers[0], y: my + Math.sin(ang) * centers[0], rot: -ang + tilt, z } });
      if (Math.abs(((L.cam.rot + Math.PI) % (2 * Math.PI)) - Math.PI) > Math.PI / 2) L.cam.rot += Math.PI;   // keep text upright
    }
    return L;
  }
  function buildCard() {
    const S = stage(), lead = caps(track.artist || ''), emS = caps(track.title || 'MUSIC SYNC');
    const pxE = Math.min(100 * W * 0.5 / measure(emS, bold(100)), S.h * 0.2);
    ctx.letterSpacing = '0.08em';
    const pxL = lead ? Math.min(100 * W * 0.4 / measure(lead, thin(100)), S.h * 0.06) : 0;
    ctx.letterSpacing = '0px';
    const x = S.cx - measure(emS, bold(pxE)) / 2;
    return { card: true, kind: 'sky', tone: 'teal', lead, pxL, x, y: S.cy + pxE * 0.3, emS, pxE,
             scatter: [...emS].map(() => ({ dx: rand(-0.25, 0.25) * W, dy: rand(-0.2, 0.2) * H, rot: rand(-1.5, 1.5), d: rand(0, 0.15) })) };
  }

  // ---------- drawing ----------
  function waveWords(words, x, y, px, t, T, a, color, font, spacing, lower) {
    ctx.font = font; ctx.letterSpacing = spacing; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    let cx = x, i = 0;
    for (const wd of words) {
      const s = (lower ? wd.w.toLowerCase() : caps(wd.w)) + ' ', p = sung(wd, t, 0.2), age = t - wd.t;
      for (const ch of s) {
        const w = ctx.measureText(ch).width;
        if (p > 0) {   // letters arrive on a wave that settles
          const amp = px * 0.22 * Math.exp(-Math.max(0, age) * 2.2);
          const dy = Math.sin(i * 0.6 - age * 7) * amp, rot = Math.cos(i * 0.6 - age * 7) * amp / px * 0.6;
          ctx.save(); ctx.translate(cx, y + dy); ctx.rotate(rot);
          ctx.globalAlpha = a * p; ctx.fillStyle = color; ctx.fillText(ch, 0, 0); ctx.restore();
        }
        cx += w; i++;
      }
    }
    ctx.letterSpacing = '0px';
  }
  function emphasis(E, x, y, px, t0, t, a, style, s) {
    ctx.font = bold(px); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const fill = style === 'candy' ? candyFill() : style === 'white' ? '#FFFFFF' : '#3DBFA8';
    let cx = x;
    [...s].forEach((ch, i) => {
      const w = ctx.measureText(ch).width, sc = E[i] || { dx: 0, dy: 0, rot: 0, d: 0 };
      const p = easeOut((t - t0 - sc.d + 0.1) / 0.55);
      if (p > 0) {   // each letter flies in from its own scattered spot
        ctx.save(); ctx.translate(cx + w / 2 + sc.dx * (1 - p), y + sc.dy * (1 - p)); ctx.rotate(sc.rot * (1 - p));
        ctx.scale(0.4 + 0.6 * p, 0.4 + 0.6 * p);
        ctx.globalAlpha = a * clamp(p * 1.6, 0, 1); ctx.fillStyle = fill;
        if (style === 'candy') { ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowOffsetY = 3; ctx.shadowBlur = 4; }
        ctx.fillText(ch, -w / 2, 0); ctx.restore();
      }
      cx += w;
    });
  }

  function drawSky(sc, t, T, a) {
    const L = sc.L, c = SKY[L.tone];
    for (const cl of L.clouds || []) cloud(cl.x + (T - sc.at) * cl.v, cl.y, cl.s, a * 0.95 * easeOut((T - sc.at) / 0.6));
    if (L.lead) waveWords(L.lead.words, L.lead.x, L.lead.y, L.lead.px, t, T, a * 0.9, c[3], thin(L.lead.px), '0.08em');
    if (L.mid) waveWords(L.mid.words, L.mid.x, L.mid.y, L.mid.px, t, T, a, '#FFFFFF', round(L.mid.px), '0px', true);
    const E = L.emph;
    emphasis(E.scatter, E.x, E.y, E.px, E.wd.t, t, a, E.style, E.s);
  }

  function drawMapText(sc, t, T, a) {
    const L = sc.L;
    const done = mapView(T, 1);
    ctx.translate(L.mx, L.my); ctx.rotate(L.ang);
    ctx.font = road(L.px); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    let x = -L.len / 2;
    for (const wd of L.words) {
      const s = caps(wd.w), w = ctx.measureText(s).width, p = sung(wd, t, 0.2);
      ctx.globalAlpha = a * (0.45 + 0.55 * p);
      ctx.lineWidth = 7; ctx.strokeStyle = p > 0 ? '#FFFFFF' : '#3FBF9F'; ctx.strokeText(s, x, 0);
      ctx.fillStyle = p > 0 ? '#2FA88A' : '#16302A'; ctx.fillText(s, x, 0);
      if (wd.end && p > 0) {   // a map pin drops onto the line-end word
        const e = clamp((t - wd.t) / 0.5, 0, 1), py = -L.px * 1.1 - (1 - backOut(e)) * 260;
        ctx.save(); ctx.translate(x + w / 2, py); ctx.globalAlpha = a * clamp(e * 3, 0, 1);
        ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 6;
        ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(0, -26, 26, Math.PI * 0.85, Math.PI * 2.15);
        ctx.lineTo(0, 22); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.fillStyle = '#2FA88A'; ctx.beginPath(); ctx.arc(0, -26, 10, 0, 6.29); ctx.fill();
        ctx.restore();
      }
      x += w + ctx.measureText(' ').width;
    }
    done();
  }

  function drawCard(sc, T, a) {
    const L = sc.L, S = stage(), age = T - sc.at;
    if (L.lead) {
      ctx.font = thin(L.pxL); ctx.letterSpacing = '0.08em'; ctx.textAlign = 'center'; ctx.fillStyle = SKY.teal[3];
      ctx.globalAlpha = a * easeOut(age / 0.6); ctx.fillText(L.lead, S.cx, L.y - L.pxE * 0.95); ctx.letterSpacing = '0px';
    }
    emphasis(L.scatter, L.x, L.y, L.pxE, sc.at + 0.3, T, a, 'candy', L.emS);
  }

  const angLerp = (a, b, f) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * f;
  let kindNow = 'sky', kindAt = -9, kindPrev = 'sky';
  LOOKS.push({
    id: 'atlas', name: 'Night Map', exit: 0.45,
    reset() { kindNow = kindPrev = 'sky'; kindAt = -9; },
    build, buildCard,
    enter(cur, prev, T) {
      const k = cur.L.kind || 'sky';
      if (k !== kindNow) { kindPrev = kindNow; kindNow = k; kindAt = T; }
      if (k === 'map' && kindPrev !== 'map' && T - kindAt < 0.1) Object.assign(cam, cur.L.cam, { z: cur.L.cam.z * 0.45 });   // swoop down onto the map from higher up
    },
    frame(T) {
      const d = direct(this, T), cur = d.cur, L = cur.L;
      if (L.kind === 'map' && !cur.card) {   // camera glides along the road, following the word being sung
        const i = Math.max(0, L.words.findLastIndex(wd => wd.t <= d.t)), next = L.words[i + 1];
        const f = next ? clamp((d.t - L.words[i].t) / (next.t - L.words[i].t), 0, 1) : 0;
        const c = next ? lerp(L.centers[i], L.centers[i + 1], f) : L.centers[i];
        L.cam.x = L.mx + Math.cos(L.ang) * c; L.cam.y = L.my + Math.sin(L.ang) * c;
        cam.x = lerp(cam.x, L.cam.x, 0.06); cam.y = lerp(cam.y, L.cam.y, 0.06);
        cam.rot = angLerp(cam.rot, L.cam.rot, 0.045); cam.z = lerp(cam.z, L.cam.z, 0.05);
      }
      const p = clamp((T - kindAt) / 0.8, 0, 1);
      const drawKind = (k, alpha, scale) => {
        if (k === 'map') { const done = mapView(T, alpha, scale); done(); } else sky(T, L.tone || 'teal', alpha);
      };
      drawKind(kindNow, 1, 1);
      if (p < 1) drawKind(kindPrev, 1 - p, 1 + p * 0.5);   // the old scene zooms past and fades
      if (kindNow === 'map') {   // dark edges so the map reads as night
        ctx.globalAlpha = 1;
        ctx.drawImage(layer('atlas-vignette', g => {
          const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H);
          v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
          g.fillStyle = v; g.fillRect(0, 0, W, H);
        }), 0, 0, W, H);
      }
      if (d.prev) {
        const q = (T - d.prev.out) / this.exit;
        ctx.save(); ctx.filter = `blur(${q * 12}px)`; ctx.translate(0, q * 24);
        drawScene(d.prev, d.t, T, sceneFade * (1 - q)); ctx.restore();
      }
      drawScene(cur, d.t, T, sceneFade);
      setAccent(kindNow === 'map' ? '#C8DE78' : '#7DDCC8');
    },
  });
  function drawScene(sc, t, T, a) {
    if (sc.card) return drawCard(sc, T, a);
    if (sc.L.kind === 'map') return drawMapText(sc, t, T, a);
    drawSky(sc, t, T, a);
  }
})();
