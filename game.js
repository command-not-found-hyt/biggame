'use strict';

/* ============================================================
   环形殖民地 — game
   ============================================================ */

(() => {
  const $ = id => document.getElementById(id);
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mod = (v, n) => ((v % n) + n) % n;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
  const FONT_STACK = '"ZCOOL QingKe HuangYou", "Patrick Hand", "KaiTi", sans-serif';
  const font = (px, weight) => `${weight ? weight : ''} ${px}px ${FONT_STACK}`;

  function fmt(n) {
    n = Math.floor(n);
    if (n < 10000) return n.toLocaleString('en-US');
    if (n < 100000000) {
      const v = n / 10000;
      return (v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')) + '万';
    }
    return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
  }

  /* ---------------- save ---------------- */
  const SAVE_KEY = 'doodle-loop-save-v1';
  function loadMeta() {
    let m = DEFAULT_META();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        m = Object.assign(DEFAULT_META(), saved, { nodes: Object.assign({}, saved.nodes || {}) });
      }
    } catch (e) { m = DEFAULT_META(); }
    m.nodes.core = 1;
    return m;
  }
  let meta = loadMeta();
  function saveMeta() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(meta)); } catch (e) { /* private mode */ }
  }

  /* ---------------- canvas / layout ---------------- */
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  let W = 0, H = 0, DPR = 1, cx = 0, cy = 0, R = 220;
  let pathSize = 38, sideSize = 33, pathR = 0, innerSideR = 0, sideR = 0, playerR = 0;
  let slots = [], slotMap = new Map();
  let bgLayer = null;
  let boil = 0;

  function resize() {
    W = Math.max(320, window.innerWidth);
    H = Math.max(400, window.innerHeight);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const pxW = Math.round(W * DPR);
    const pxH = Math.round(H * DPR);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    const topPad = 50, bottomPad = 150;
    const availH = Math.max(260, H - topPad - bottomPad);
    cy = topPad + availH / 2;
    cx = W / 2;
    R = Math.min(W / 2 - 80, availH / 2 - 30);
    R = Math.max(104, R);
    const arc = TAU * R / CELLS;
    pathSize = clamp(arc * 0.82, 24, 60);
    sideSize = pathSize * 0.84;
    const gap = pathSize * 0.46 + sideSize * 0.46 + 7;
    pathR = R;
    innerSideR = R - gap;
    sideR = R + gap;
    playerR = pathR;
    slots = [];
    slotMap.clear();
    for (let i = 0; i < CELLS; i++) {
      const a = angleOfCell(i);
      const pi = ringPoint(a, innerSideR);
      const pp = ringPoint(a, pathR);
      const po = ringPoint(a, sideR);
      const innerSlot = { key: i + ':inner', cell: i, slot: 'inner', angle: a, x: pi.x, y: pi.y, r: innerSideR };
      const pathSlot = { key: i + ':path', cell: i, slot: 'path', angle: a, x: pp.x, y: pp.y, r: pathR };
      const sideSlot = { key: i + ':side', cell: i, slot: 'side', angle: a, x: po.x, y: po.y, r: sideR };
      slots.push(innerSlot, pathSlot, sideSlot);
      slotMap.set(innerSlot.key, innerSlot);
      slotMap.set(pathSlot.key, pathSlot);
      slotMap.set(sideSlot.key, sideSlot);
    }
    if (Art.spriteCache) Art.spriteCache.clear();
    buildBackground();
    render();
  }

  function angleOfCell(c) { return -Math.PI / 2 + (c / CELLS) * TAU; }
  function angleOfPos(p) { return -Math.PI / 2 + (p / CELLS) * TAU; }
  function ringPoint(a, r) { return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; }

  function nearestSlot(x, y) {
    let best = null, bestD = 1e18;
    for (const s of slots) {
      const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (!best) return null;
    const limit = Math.max(30, pathSize * 0.78) + 6;
    return bestD <= limit * limit ? best : null;
  }

  /* ---------------- background ---------------- */
  function buildBackground() {
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    const g = cv.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    Art.initCtx(g);
    paintPaper(g);
    paintAmbient(g);
    paintRing(g, 0);
    for (const s of slots) paintSlotBase(g, s);
    bgLayer = cv;
  }

  function paintSlotBase(g, s) {
    const isPath = s.slot === 'path';
    const w = (isPath ? pathSize : sideSize) * 1.04;
    const h = w * 0.78;
    const pts = isPath
      ? Art.roundRectPts(s.x, s.y, w, h, 5)
      : hexPts(s.x, s.y, w / 2, h / 2);
    g.save();
    Art.wash(g, pts, '#05090c', { alpha: 0.55, ox: 2, oy: 3, closed: true });
    Art.wash(g, pts, isPath ? '#101b20' : '#0f1a1f', { alpha: 1, ox: 0, oy: 0, closed: true });
    Art.sketch(g, pts, {
      seed: 120 + s.cell * 7 + (isPath ? 0 : 3), width: 1.25,
      color: '#25393f', closed: true, amp: 0.25
    });
    // recessed inner plate
    const inner = isPath
      ? Art.roundRectPts(s.x, s.y + 1, w - 7, h - 7, 3)
      : hexPts(s.x, s.y + 1, w / 2 - 3.5, h / 2 - 3.5);
    Art.wash(g, inner, isPath ? '#16252a' : '#142126', { alpha: 0.7, ox: 0, oy: 0, closed: true });
    // status tick
    g.globalAlpha = isPath ? 0.25 : 0.18;
    g.fillStyle = isPath ? '#63d6cc' : '#f0b23c';
    g.fillRect(s.x - 4, s.y + h * 0.3, 8, 1.6);
    // bolts
    g.globalAlpha = 0.85;
    Art.bolt(g, s.x - w * 0.4, s.y - h * 0.3, 1.3);
    Art.bolt(g, s.x + w * 0.4, s.y - h * 0.3, 1.3);
    Art.bolt(g, s.x - w * 0.4, s.y + h * 0.3, 1.3);
    Art.bolt(g, s.x + w * 0.4, s.y + h * 0.3, 1.3);
    g.restore();
  }

  function paintPaper(g) {
    g.fillStyle = '#080e12';
    g.fillRect(0, 0, W, H);

    // hull plating: big uneven panels under everything
    const cw = Math.max(180, W / 5);
    const ch = Math.max(140, H / 4);
    for (let ry = 0; ry < 5; ry++) {
      for (let rx = 0; rx < 7; rx++) {
        const x = rx * cw - 30 + (ry % 2) * 22;
        const y = ry * ch - 24;
        g.save();
        g.globalAlpha = 0.3 + Art.rand(rx * 17 + ry * 31) * 0.22;
        g.fillStyle = (rx + ry) % 2 ? '#132127' : '#0f1a1f';
        g.fillRect(x, y, cw - 8, ch - 8);
        g.globalAlpha = 0.35;
        g.strokeStyle = '#2a4046';
        g.lineWidth = 1;
        g.strokeRect(x + 0.5, y + 0.5, cw - 8, ch - 8);
        g.restore();
        if (Art.rand(rx * 71 + ry * 13) > 0.45) {
          Art.bolt(g, x + 9, y + 9, 1.4);
          Art.bolt(g, x + cw - 20, y + 9, 1.4);
        }
      }
    }

    // o2 / coolant bloom around the colony ring
    const glow = g.createRadialGradient(cx, cy, R * 0.1, cx, cy, Math.max(W, H) * 0.62);
    glow.addColorStop(0, 'rgba(52,150,144,.12)');
    glow.addColorStop(0.45, 'rgba(28,74,78,.06)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);

    // rivet seams across the void
    g.save();
    g.globalAlpha = 0.18;
    g.strokeStyle = '#3b5a60';
    g.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const y = Art.rand(i * 43 + 5) * H;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + (Art.rand(i * 47) - 0.5) * 26); g.stroke();
    }
    g.restore();

    // fine dust
    for (let i = 0; i < 240; i++) {
      const x = Art.rand(i * 19 + 3) * W;
      const y = Art.rand(i * 29 + 5) * H;
      const r = 0.4 + Art.rand(i * 37) * 0.9;
      g.save();
      g.globalAlpha = 0.05 + Art.rand(i * 53) * 0.12;
      g.fillStyle = i % 5 === 0 ? '#63d6cc' : i % 7 === 0 ? '#f0b23c' : '#9fb4ae';
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.restore();
    }

    // heavy vignette so the ring reads as the only lit place
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(3,7,9,0)');
    vg.addColorStop(1, 'rgba(3,7,9,.62)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  function paintAmbient(g) {
    // star field
    for (let i = 0; i < 46; i++) {
      const x = Art.rand(1200 + i * 23) * W;
      const y = Art.rand(1300 + i * 31) * H;
      const r = 0.6 + Art.rand(1400 + i * 17) * 1.5;
      g.save();
      g.globalAlpha = 0.3 + Art.rand(1500 + i * 11) * 0.5;
      g.fillStyle = i % 9 === 0 ? '#f0b23c' : i % 4 === 0 ? '#63d6cc' : '#dce9e4';
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.restore();
    }

    // distant planet, upper right
    const px = W - 108, py = 128, pr = 60;
    g.save();
    g.beginPath(); g.arc(px, py, pr, 0, TAU); g.clip();
    g.fillStyle = '#1d3a3c';
    g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    g.globalAlpha = 0.5;
    g.fillStyle = '#2d5a58';
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.ellipse(px, py - pr * 0.6 + i * pr * 0.34, pr * 1.05, pr * 0.1, -0.18, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 0.25;
    g.fillStyle = '#0a1418';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(px - 26 + i * 19, py - 18 + (i % 2) * 26, 7 + i * 2.6, 0, TAU);
      g.fill();
    }
    g.restore();
    Art.sketch(g, Art.circlePts(px, py, pr, pr, 22), {
      seed: 1601, width: 1.6, closed: true, color: 'rgba(99,214,204,.35)', amp: 0.7
    });
    g.save();
    g.globalAlpha = 0.2;
    g.strokeStyle = '#63d6cc';
    g.lineWidth = 1;
    g.beginPath(); g.ellipse(px, py, pr + 16, pr * 0.34, -0.35, 0, TAU); g.stroke();
    g.restore();

    // relay mast, lower left
    const mx = 54, my = H - 156;
    Art.pipe(g, mx, my + 30, mx, my - 42, 3);
    Art.line(g, mx, my - 42, mx + 20, my - 62, { seed: 1611, width: 1.6, color: '#5d767a' });
    Art.line(g, mx, my - 42, mx - 18, my - 58, { seed: 1612, width: 1.6, color: '#5d767a' });
    Art.light(g, mx, my - 66, 2, Art.AMBER);
    Art.light(g, mx + 20, my - 62, 1.4, Art.CYAN);
    g.save(); g.globalAlpha = 0.35;
    g.strokeStyle = '#63d6cc'; g.lineWidth = 1.2; g.setLineDash([2, 5]);
    g.beginPath(); g.arc(mx, my - 60, 18, -2.6, -0.5); g.stroke();
    g.beginPath(); g.arc(mx, my - 60, 30, -2.6, -0.5); g.stroke();
    g.restore();

    // coolant tanks, lower right
    const tx = W - 62, ty = H - 132;
    Art.roundRect(g, tx, ty, 30, 46, 8, { fill: '#1d3036', seed: 1620, width: 2.2 });
    Art.roundRect(g, tx - 24, ty + 12, 18, 28, 5, { fill: '#243b40', seed: 1621, width: 1.8 });
    Art.pipe(g, tx + 8, ty - 23, tx + 8, ty - 40, 2.4);
    Art.pipe(g, tx - 8, ty + 27, tx - 38, ty + 27, 2);
    Art.light(g, tx + 8, ty - 42, 1.4, Art.CYAN);
    Art.bolt(g, tx, ty - 16, 1.2); Art.bolt(g, tx, ty + 16, 1.2);

    // drifting motes
    for (let i = 0; i < 7; i++) {
      const x = Art.rand(1700 + i * 13) * W;
      const y = Art.rand(1800 + i * 17) * H;
      g.save(); g.globalAlpha = 0.2;
      Art.drawSparkle(g, x, y, 3 + Art.rand(i) * 4, 0, i % 2 ? '#63d6cc' : '#f0b23c');
      g.restore();
    }
  }

  function hexPts(x, y, rx, ry) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * TAU;
      pts.push([x + Math.cos(a) * rx, y + Math.sin(a) * ry]);
    }
    return pts;
  }

  function organicRingPts(cx0, cy0, radius, seed, amp, n = 84) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const wob = Math.sin(a * 3 + seed) * amp
        + Math.sin(a * 7 + seed * 1.7) * amp * 0.42
        + Math.sin(a * 11 + seed * 2.3) * amp * 0.18;
      pts.push([cx0 + Math.cos(a) * (radius + wob), cy0 + Math.sin(a) * (radius + wob)]);
    }
    return pts;
  }

  function fillPts(g, pts, fill, alpha = 1) {
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = fill;
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) g.moveTo(pts[i][0], pts[i][1]);
      else g.lineTo(pts[i][0], pts[i][1]);
    }
    g.closePath();
    g.fill();
    g.restore();
  }

  function fillBand(g, outerPts, innerPts, fill, alpha = 1, ox = 0, oy = 0) {
    g.save();
    g.globalAlpha = alpha;
    g.translate(ox, oy);
    g.fillStyle = fill;
    g.beginPath();
    for (let i = 0; i < outerPts.length; i++) {
      if (i === 0) g.moveTo(outerPts[i][0], outerPts[i][1]);
      else g.lineTo(outerPts[i][0], outerPts[i][1]);
    }
    for (let i = innerPts.length - 1; i >= 0; i--) g.lineTo(innerPts[i][0], innerPts[i][1]);
    g.closePath();
    g.fill();
    g.restore();
  }

  function hazardStrip(g, x, y, w, h, angle = 0, alpha = 0.9) {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.beginPath(); g.rect(-w / 2, -h / 2, w, h); g.clip();
    g.fillStyle = '#10181c'; g.fillRect(-w / 2, -h / 2, w, h);
    g.globalAlpha = alpha;
    g.fillStyle = '#f0b23c';
    for (let i = -h; i < w + h; i += 9) {
      g.beginPath();
      g.moveTo(-w / 2 + i, h / 2);
      g.lineTo(-w / 2 + i + 4.5, h / 2);
      g.lineTo(-w / 2 + i + 4.5 + h, -h / 2);
      g.lineTo(-w / 2 + i + h, -h / 2);
      g.closePath(); g.fill();
    }
    g.restore();
    g.save();
    g.strokeStyle = '#05090c'; g.lineWidth = 1.2;
    g.translate(x, y); g.rotate(angle);
    g.strokeRect(-w / 2, -h / 2, w, h);
    g.restore();
  }

  function tankDoodle(g, x, y, s, seed, b) {
    g.save();
    g.translate(x, y);
    g.scale(s / 60, s / 60);
    Art.roundRect(g, 0, 0, 30, 42, 8, { fill: '#22363c', seed, boil: b, width: 2.2 });
    Art.roundRect(g, 0, -25, 20, 12, 4, { fill: '#2b444a', seed: seed + 1, boil: b, width: 1.8 });
    g.save();
    g.beginPath(); g.rect(-11, -4, 22, 20); g.clip();
    g.fillStyle = '#2a8f8a'; g.globalAlpha = 0.7;
    g.fillRect(-12, 6, 24, 14);
    g.strokeStyle = '#63d6cc'; g.lineWidth = 1.4;
    g.beginPath();
    for (let i = -11; i <= 11; i += 2) {
      const yy = 5 + Math.sin(i * 0.7 + seed) * 1.2;
      if (i === -11) g.moveTo(i, yy); else g.lineTo(i, yy);
    }
    g.stroke();
    g.restore();
    Art.sketch(g, Art.roundRectPts(0, 0, 30, 42, 8), { seed: seed + 2, boil: b, width: 2.2, closed: true });
    Art.pipe(g, 8, -31, 8, -43, 2);
    Art.pipe(g, 15, 4, 30, 4, 2);
    Art.bolt(g, 0, -16, 1.3); Art.bolt(g, 0, 16, 1.3);
    Art.light(g, -15, -12, 1.6, Art.CYAN);
    g.restore();
  }

  function mastDoodle(g, x, y, s, seed, b) {
    g.save();
    g.translate(x, y);
    g.scale(s / 60, s / 60);
    Art.roundRect(g, 0, 16, 26, 8, 2, { fill: '#22343a', seed, boil: b, width: 1.8 });
    Art.line(g, 0, 14, 0, -18, { seed: seed + 1, boil: b, width: 2.6, color: '#5d767a' });
    const dish = [[-15, -16], [-8, -26], [0, -29], [8, -25], [14, -16], [0, -20]];
    Art.wash(g, dish, '#4a666b', { alpha: 0.98, ox: 0.8, oy: 1.2, closed: true });
    Art.sketch(g, dish, { seed: seed + 2, boil: b, width: 1.8, closed: true });
    Art.line(g, 0, -20, 0, -10, { seed: seed + 3, boil: b, width: 1.4 });
    Art.light(g, 0, -33, 1.8, Art.AMBER);
    Art.line(g, 6, -6, 12, -18, { seed: seed + 4, boil: b, width: 1.2, color: '#5d767a' });
    Art.bolt(g, -7, 14, 1.2); Art.bolt(g, 7, 14, 1.2);
    g.restore();
  }

  function crateDoodle(g, x, y, s, seed, b) {
    g.save();
    g.translate(x, y);
    g.scale(s / 50, s / 50);
    Art.roundRect(g, 0, 4, 26, 20, 3, { fill: '#26373d', seed, boil: b, width: 2 });
    Art.line(g, -12, 4, 12, 4, { seed: seed + 1, boil: b, width: 1.2, color: '#3a5258' });
    Art.bolt(g, -8, -2, 1.2); Art.bolt(g, 8, -2, 1.2);
    Art.roundRect(g, 0, -10, 18, 10, 2, { fill: '#2f444a', seed: seed + 2, boil: b, width: 1.6 });
    hazardStrip(g, 0, 4, 22, 4, 0, 0.7);
    g.restore();
  }

  function paintRing(g, b) {
    const sandHalf = pathSize * 0.62 + 7;
    const trailIn = R - sandHalf;
    const trailOut = R + sandHalf;
    const bankPad = clamp(R * 0.045, 6, 14);
    const gardenR = sideR + sideSize * 0.52 + bankPad;
    const centerR = innerSideR - sideSize * 0.52 - 8;
    const innerR = centerR;
    const gardenPts = organicRingPts(cx, cy, gardenR, 2.7, clamp(R * 0.012, 1.4, 3.4), 56);
    const loopOuter = organicRingPts(cx, cy, trailOut, 6.2, clamp(R * 0.008, 1.2, 2.6), 56);
    const loopInner = organicRingPts(cx, cy, trailIn, 9.1, clamp(R * 0.008, 1.2, 2.6), 56);

    // substrate plate shadow
    Art.wash(g, gardenPts, '#03070a', { alpha: 0.75, ox: 5, oy: 6 });
    fillPts(g, gardenPts, '#16262b', 1);

    // deck plate seams + concentric hull rings
    g.save();
    g.beginPath();
    for (let i = 0; i < gardenPts.length; i++) {
      if (i === 0) g.moveTo(gardenPts[i][0], gardenPts[i][1]);
      else g.lineTo(gardenPts[i][0], gardenPts[i][1]);
    }
    g.closePath();
    g.clip();
    g.strokeStyle = 'rgba(5,9,12,.75)';
    g.lineWidth = 2;
    for (let i = 0; i < CELLS; i++) {
      const a = angleOfCell(i) + Math.PI / CELLS;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (centerR - 4), cy + Math.sin(a) * (centerR - 4));
      g.lineTo(cx + Math.cos(a) * gardenR, cy + Math.sin(a) * gardenR);
      g.stroke();
    }
    g.strokeStyle = 'rgba(93,118,122,.18)';
    g.lineWidth = 1;
    for (const rr of [centerR, innerSideR, sideR, gardenR - 8]) {
      g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.stroke();
    }
    // panel bracing
    g.strokeStyle = 'rgba(93,118,122,.1)';
    for (let i = 0; i < CELLS; i += 2) {
      const a = angleOfCell(i);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (gardenR - 16), cy + Math.sin(a) * (gardenR - 16));
      g.lineTo(cx + Math.cos(a + 0.12) * (trailOut + 4), cy + Math.sin(a + 0.12) * (trailOut + 4));
      g.stroke();
    }
    g.restore();

    // outer rim: thick black contour + cyan light edge
    Art.sketch(g, gardenPts, { seed: 201, boil: b, width: 4.2, color: '#04080a', amp: 0.7, closed: true });
    Art.sketch(g, gardenPts, { seed: 202, boil: b, width: 1.2, color: 'rgba(99,214,204,.4)', amp: 0.7, closed: true });

    // walkway
    fillBand(g, loopOuter, loopInner, '#03070a', 0.9, 2, 4);
    fillBand(g, loopOuter, loopInner, '#2c4147', 1, 0, 0);
    // grated treads across the lane, every cell
    g.save();
    g.beginPath();
    for (let i = 0; i < loopOuter.length; i++) {
      if (i === 0) g.moveTo(loopOuter[i][0], loopOuter[i][1]);
      else g.lineTo(loopOuter[i][0], loopOuter[i][1]);
    }
    for (let i = loopInner.length - 1; i >= 0; i--) g.lineTo(loopInner[i][0], loopInner[i][1]);
    g.closePath();
    g.clip();
    g.strokeStyle = 'rgba(8,16,19,.55)';
    g.lineWidth = 1.1;
    for (let i = 0; i < CELLS; i++) {
      const a = angleOfCell(i) + Math.PI / CELLS;
      const ca = Math.cos(a), sa = Math.sin(a);
      g.beginPath();
      g.moveTo(cx + ca * trailIn, cy + sa * trailIn);
      g.lineTo(cx + ca * (trailOut + 2), cy + sa * (trailOut + 2));
      g.stroke();
    }
    g.strokeStyle = 'rgba(93,118,122,.13)';
    for (let k = 1; k <= 3; k++) {
      g.beginPath();
      g.arc(cx, cy, trailIn + (trailOut - trailIn) * (k / 4), 0, TAU);
      g.stroke();
    }
    // worn center strip
    g.globalAlpha = 0.18;
    g.strokeStyle = '#9fb4ae';
    g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, playerR, 0, TAU); g.stroke();
    g.restore();

    // lane edge trim
    Art.sketch(g, loopInner, { seed: 207, boil: b, width: 2.1, color: '#04080a', amp: 0.7, closed: true });
    Art.sketch(g, loopOuter, { seed: 208, boil: b, width: 2.3, color: '#04080a', amp: 0.7, closed: true });
    g.save();
    g.globalAlpha = 0.55;
    g.strokeStyle = '#63d6cc';
    g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, trailIn + 2.5, 0, TAU); g.stroke();
    g.beginPath(); g.arc(cx, cy, trailOut - 2.5, 0, TAU); g.stroke();
    g.restore();

    // cyan guide arrows on the lane
    for (let k = 0; k < 8; k++) {
      const a = -Math.PI / 2 + (k + 0.5) * TAU / 8;
      const p = ringPoint(a, playerR);
      const tg = a + Math.PI / 2;
      const tx = Math.cos(tg), ty = Math.sin(tg);
      const nx = -ty, ny = tx;
      g.save();
      g.globalAlpha = k % 2 ? 0.38 : 0.58;
      g.strokeStyle = '#63d6cc';
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(p.x - tx * 5 + nx * 5, p.y - ty * 5 + ny * 5);
      g.lineTo(p.x + tx * 5, p.y + ty * 5);
      g.lineTo(p.x - tx * 5 - nx * 5, p.y - ty * 5 - ny * 5);
      g.stroke();
      g.restore();
    }

    // inner island deck
    fillPts(g, organicRingPts(cx, cy, innerR, 11.7, clamp(R * 0.01, 1.2, 2.6), 48), '#0f1b1f', 1);
    Art.sketch(g, organicRingPts(cx, cy, innerR, 11.7, 1.6, 48), {
      seed: 206, boil: b, width: 2.2, color: '#3a5258', amp: 0.6, closed: true
    });
    // ring of service lights
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i / 8) * TAU + 0.2;
      const rr = innerR - 7;
      Art.light(g, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.2,
        i % 3 === 0 ? Art.AMBER : Art.CYAN);
    }

    // --- center console ---
    const bw = clamp(R * 0.84, 96, 300);
    const bh = clamp(R * 0.56, 78, 168);
    const boardPts = Art.roundRectPts(cx, cy, bw, bh, 10);
    Art.wash(g, boardPts, '#03070a', { alpha: 0.9, ox: 4, oy: 5 });
    Art.wash(g, boardPts, '#1c2c32', { alpha: 1, ox: 0, oy: 0 });
    Art.sketch(g, boardPts, { seed: 641, boil: b, width: 3, closed: true, color: '#05090c', amp: 0.55 });
    const boardInner = Art.roundRectPts(cx, cy, bw - 14, bh - 14, 7);
    Art.wash(g, boardInner, '#0b1519', { alpha: 1, ox: 0, oy: 0 });
    Art.sketch(g, boardInner, { seed: 642, boil: b, width: 1.4, closed: true, color: '#3f6066', amp: 0.5 });
    // corner bolts + rivet line
    const bxx = bw / 2 - 7, byy = bh / 2 - 7;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) Art.bolt(g, cx + sx * bxx, cy + sy * byy, 2);
    g.save();
    g.globalAlpha = 0.55;
    g.strokeStyle = '#2c444a';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cx - bxx + 6, cy - byy + 9);
    g.lineTo(cx + bxx - 6, cy - byy + 9);
    g.stroke();
    g.restore();
    // status lamps on console edge
    Art.light(g, cx - bxx + 6, cy - byy + 15, 1.4, Art.CYAN);
    Art.light(g, cx - bxx + 15, cy - byy + 15, 1.4, Art.BIO);
    Art.light(g, cx - bxx + 24, cy - byy + 15, 1.4, Art.AMBER);
    // bottom caution strip
    hazardStrip(g, cx, cy + byy - 7, bw - 24, 5, 0, 0.75);

    // --- airlock / start gate ---
    const ga = angleOfCell(0) - Math.PI / CELLS;
    const midR = (trailIn + trailOut) / 2;
    const gp = ringPoint(ga, midR);
    const halfRad = (trailOut - trailIn) / 2 + 2;
    hazardStrip(g, gp.x, gp.y, 16, halfRad * 2, ga + Math.PI / 2, 0.92);
    // pylons
    for (const rdist of [trailIn + 1, trailOut - 1]) {
      const pp = ringPoint(ga, rdist);
      g.save();
      g.translate(pp.x, pp.y);
      g.rotate(ga);
      Art.roundRect(g, 0, 0, 9, 15, 2, { fill: '#2a3d43', seed: 651, boil: b, width: 1.8 });
      hazardStrip(g, 0, 5, 9, 4, 0, 0.85);
      Art.light(g, 0, -6, 1.8, Art.AMBER);
      g.restore();
    }
    // overhead rail + cable
    const postIn = ringPoint(ga, trailIn + 6);
    const postOut = ringPoint(ga, trailOut - 6);
    Art.line(g, postIn.x, postIn.y, postOut.x, postOut.y, { seed: 653, boil: b, width: 2.6, color: '#05090c' });
    Art.line(g, postIn.x, postIn.y, postOut.x, postOut.y, { seed: 654, boil: b, width: 1.2, color: '#5d767a' });

    // start sign on the outer bank
    const signP = ringPoint(ga + 0.5, trailOut + 30);
    Art.line(g, signP.x, signP.y + 4, signP.x + 1, signP.y + 20, { seed: 658, boil: b, width: 2.2, color: '#3a5258' });
    g.save();
    g.translate(signP.x, signP.y);
    g.rotate(-0.04);
    const signPts = Art.roundRectPts(0, 0, 56, 30, 4);
    Art.wash(g, signPts, '#03070a', { alpha: 0.6, ox: 2, oy: 3 });
    Art.wash(g, signPts, '#1d2d33', { alpha: 0.99, ox: 0, oy: 0 });
    Art.sketch(g, signPts, { seed: 660, boil: b, width: 1.8, closed: true, color: '#05090c' });
    hazardStrip(g, 0, -11, 56, 4, 0, 0.85);
    g.font = font(14, true);
    g.textAlign = 'center';
    g.fillStyle = '#dce9e4';
    g.fillText('起点', 0, 9);
    g.restore();
    // floor chevrons at the gate
    g.save();
    g.globalAlpha = 0.5;
    g.strokeStyle = '#f0b23c';
    g.lineWidth = 1.6;
    const cp = ringPoint(ga, midR);
    g.translate(cp.x, cp.y);
    g.rotate(ga + Math.PI);
    g.beginPath(); g.moveTo(-6, -10); g.lineTo(0, -4); g.lineTo(-6, 2); g.stroke();
    g.beginPath(); g.moveTo(2, -10); g.lineTo(8, -4); g.lineTo(2, 2); g.stroke();
    g.restore();

    // outer service props, kept clear of slots
    if (R > 150) {
      tankDoodle(g, cx + Math.cos(-2.42) * (gardenR - 26), cy + Math.sin(-2.42) * (gardenR - 26), Math.max(30, R * 0.19), 701, b);
      mastDoodle(g, cx + Math.cos(0.58) * (gardenR - 26), cy + Math.sin(0.58) * (gardenR - 26), Math.max(28, R * 0.18), 711, b);
      crateDoodle(g, cx + Math.cos(2.5) * (gardenR - 22), cy + Math.sin(2.5) * (gardenR - 22), Math.max(24, R * 0.15), 721, b);
      // cable run along the outer rim
      g.save();
      g.globalAlpha = 0.35;
      g.strokeStyle = '#05090c';
      g.lineWidth = 3;
      g.beginPath(); g.arc(cx, cy, gardenR - 14, 0.3, 2.2); g.stroke();
      g.strokeStyle = '#3f6066';
      g.lineWidth = 1.2;
      g.beginPath(); g.arc(cx, cy, gardenR - 14, 0.3, 2.2); g.stroke();
      g.restore();
    }
  }

  /* ---------------- state ---------------- */
  let run = null;
  const MINION_CAP_BASE = typeof MINION_BASE_CAP !== 'undefined' ? MINION_BASE_CAP : 16;
  const state = {
    scene: 'start',
    overlay: null,
    hover: null,
    dragging: null,
    selectedCard: -1,
    mouse: { x: 0, y: 0 },
    speed: 1,
    time: 0,
    hudTimer: 0,
    handDirty: true,
    popIndex: -1,
    hurtFlash: 0,
    treeReturn: 'start',
    treeSelected: 'core',
    treeView: { x: 0, y: 0, scale: 1, ready: false },
    codexReturn: 'start',
    confirmAction: null,
    dragMove: null,
    dragUp: null
  };
  let ovStack = ['startOverlay'];

  function anyOverlay() { return ovStack.length > 0; }
  function isPlaying() { return state.scene === 'run' && run && !run.over && !anyOverlay(); }
  function topOv() { return ovStack[ovStack.length - 1] || null; }

  function openOv(id, keepBelow) {
    hideTooltip();
    if (!keepBelow) {
      for (const o of ovStack) $(o).classList.remove('show');
      ovStack = [];
    }
    if (!ovStack.includes(id)) ovStack.push(id);
    $(id).classList.add('show');
    afterOverlay();
  }
  function closeOv(id) {
    if (id) {
      const i = ovStack.indexOf(id);
      if (i >= 0) ovStack.splice(i, 1);
      $(id).classList.remove('show');
    } else {
      const top = ovStack.pop();
      if (top) $(top).classList.remove('show');
    }
    if (state.confirmAction && !ovStack.includes('confirmOverlay')) state.confirmAction = null;
    afterOverlay();
  }
  function closeAllOv() {
    for (const o of ovStack) $(o).classList.remove('show');
    ovStack = [];
    afterOverlay();
  }
  function afterOverlay() {
    // 全屏资料页遮住整张画布，顺便避开 Chromium 合成层把动态 canvas 盖到弹层上的问题
    const hideCanvas = ovStack.includes('treeOverlay') || ovStack.includes('codexOverlay');
    $('game').style.visibility = hideCanvas ? 'hidden' : '';
    updateVisibility();
    updateHud();
  }

  function updateVisibility() {
    $('hud').classList.toggle('hidden', state.scene === 'start');
    $('handBar').classList.toggle('hidden', state.scene !== 'run');
    $('extractWrap').classList.toggle('hidden', !(state.scene === 'run' && run && !run.over && !anyOverlay()));
  }

  /* ---------------- stats & run ---------------- */
  function lv(id) { return meta.nodes[id] || 0; }
  function computeStats() {
    const agg = {};
    for (const node of SKILL_NODES) {
      const level = lv(node.id);
      if (!level || !node.stat) continue;
      agg[node.stat] = (agg[node.stat] || 0) + node.per * level;
    }
    const pct = (key, cap) => Math.min(cap === undefined ? Infinity : cap, (agg[key] || 0) / 100);
    return {
      maxHp: 70 + (agg.maxHp || 0),
      dmg: 10 * (1 + pct('dmgPct')),
      move: 1.6 * (1 + pct('movePct')),
      speed: Math.min(3, 1 + pct('speedPct')),
      gold: 1 + pct('goldPct'),
      cardChance: 0.12 + pct('cardChancePct'),
      startCards: 3 + (agg.startCards || 0),
      minion: 1 + pct('minionPct'),
      recruit: 1 + pct('recruitPct'),
      craft: 1 + pct('craftPct'),
      buffPower: 1 + pct('buffPowerPct'),
      persist: agg.persistCells || 0,
      armor: pct('armorPct', 0.8),
      deathKeep: Math.min(0.9, 0.2 + pct('deathKeepPct')),
      offKeep: Math.min(0.95, 0.6 + pct('offKeepPct')),
      attackSpeed: pct('attackSpeedPct'),
      crit: pct('critPct', 0.8),
      critDmg: pct('critDmgPct', 1.5),
      cardLimit: Math.min(20, CARD_LIMIT + (agg.handSize || 0)),
      valueGain: pct('valueGainPct'),
      minionCap: agg.minionCap || 0,
      splash: pct('splashPct', 1),
      regen: agg.regen || 0,
      revive: (agg.revive || 0) > 0
    };
  }

  function randomCard() {
    if (Math.random() < 0.55) {
      const ids = Object.keys(TERRAINS);
      return { typeId: pick(ids), kind: 'terrain' };
    }
    const ids = Object.keys(BUILDINGS);
    return { typeId: pick(ids), kind: 'building' };
  }

  function makeRun() {
    const stats = computeStats();
    state.speed = stats.speed;
    const r = {
      time: 0,
      pos: 0.6,
      lap: 1,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      stats,
      gold: 0,
      kills: 0,
      cards: [],
      tiles: new Map(),
      combos: [],
      comboCells: new Set(),
      activeBuildingKeys: new Set(),
      spawnerMap: new Map(),
      minions: [],
      monsters: [],
      buffs: [],
      floats: [],
      coins: [],
      projectiles: [],
      slashes: [],
      sparkles: [],
      monsterTimer: 1.6,
      playerAtkTimer: 0.5,
      healAcc: 0,
      lastCell: 0,
      hurtFlash: 0,
      hurtCd: 0,
      swing: 0,
      pendingBoss: null,
      cardLimit: stats.cardLimit,
      maxMinions: MINION_CAP_BASE + stats.minionCap,
      revived: false,
      banner: null,
      over: false,
      finished: false
    };
    const terrainIds = Object.keys(TERRAINS);
    const buildingIds = Object.keys(BUILDINGS);
    r.cards.push({ typeId: pick(terrainIds), kind: 'terrain' });
    r.cards.push({ typeId: pick(buildingIds), kind: 'building' });
    const extras = Math.min(stats.cardLimit - 2, Math.max(0, stats.startCards - 2));
    for (let i = 0; i < extras; i++) r.cards.push(randomCard());
    return r;
  }

  function startRun() {
    closeAllOv();
    run = makeRun();
    state.scene = 'run';
    state.selectedCard = -1;
    state.dragging = null;
    state.hover = null;
    state.handDirty = true;
    state.popIndex = -1;
    updateVisibility();
    updateHud();
    renderHand();
    sfx('start');
    toast('开跑！地形放中间，设备放两侧，才会联动', 'good');
  }

  /* ---------------- combos ---------------- */
  function cellEntries(cell) {
    const entries = [];
    for (const slot of ['inner', 'path', 'side']) {
      const t = run.tiles.get(cell + ':' + slot);
      if (t) entries.push({ slot, key: cell + ':' + slot, typeId: t.typeId, kind: t.kind, level: t.level });
    }
    return entries;
  }

  function evaluateCellEntries(entries, cell) {
    const bySlot = {};
    entries.forEach(e => { bySlot[e.slot] = e; });
    if (entries.length === 3) {
      const buildings = entries.filter(e => e.kind === 'building');
      const terrains = entries.filter(e => e.kind === 'terrain');
      const center = bySlot.path;
      const centerShape = center && (
        (buildings.length === 2 && terrains.length === 1 && center.kind === 'terrain') ||
        (buildings.length === 1 && terrains.length === 2 && center.kind === 'building')
      );
      const key = centerShape ? tripleKeyFor(buildings.map(e => e.typeId), terrains.map(e => e.typeId)) : null;
      const recipe = key ? TRIPLE_COMBOS[key] : null;
      if (recipe) {
        return {
          triple: {
            cell,
            triple: true,
            key: 't' + cell,
            result: recipe,
            slots: entries.map(e => e.key),
            buildingKeys: buildings.map(e => e.key),
            terrainKeys: terrains.map(e => e.key),
            buildings: buildings.map(e => e.typeId),
            terrains: terrains.map(e => e.typeId),
            effLevel: entries.reduce((n, e) => n + e.level, 0) - 2
          },
          pairs: []
        };
      }
    }
    const pairs = [];
    for (const [s1, s2] of [['inner', 'path'], ['path', 'side']]) {
      const a = bySlot[s1], b = bySlot[s2];
      if (!a || !b || a.kind === b.kind) continue;
      const bldg = a.kind === 'building' ? a : b;
      const ter = a.kind === 'terrain' ? a : b;
      const recipe = COMBOS[bldg.typeId] && COMBOS[bldg.typeId][ter.typeId];
      if (!recipe) continue;
      pairs.push({
        cell,
        triple: false,
        key: 'p' + cell + '-' + s1 + '_' + s2,
        result: recipe,
        slots: [bldg.key, ter.key],
        buildingKey: bldg.key,
        terrainKey: ter.key,
        building: bldg.typeId,
        terrain: ter.typeId,
        bLv: bldg.level,
        tLv: ter.level,
        effLevel: bldg.level + ter.level - 1,
        link: [s1, s2]
      });
    }
    return { triple: null, pairs };
  }

  function recomputeCombos() {
    const prevKeys = new Set(run.combos.map(c => c.key));
    run.combos = [];
    run.comboCells = new Set();
    run.activeBuildingKeys = new Set();
    for (let c = 0; c < CELLS; c++) {
      const entries = cellEntries(c);
      if (!entries.length) continue;
      const ev = evaluateCellEntries(entries, c);
      if (ev.triple) {
        ev.triple._isNew = !prevKeys.has(ev.triple.key);
        run.combos.push(ev.triple);
        ev.triple.buildingKeys.forEach(k => run.activeBuildingKeys.add(k));
        run.comboCells.add(c);
      } else {
        for (const pair of ev.pairs) {
          pair._isNew = !prevKeys.has(pair.key);
          run.combos.push(pair);
          run.activeBuildingKeys.add(pair.buildingKey);
          run.comboCells.add(c);
        }
      }
    }
  }

  function comboName(recipe) {
    return recipe.type === 'minion' ? MINIONS[recipe.id].name : recipe.label;
  }

  function comboDescriptor(c) {
    if (c.triple) {
      const b = c.buildings.map(id => BUILDINGS[id].name).join(' + ');
      const t = c.terrains.map(id => TERRAINS[id].name).join(' + ');
      return `${b} + ${t}`;
    }
    return `${BUILDINGS[c.building].name} × ${TERRAINS[c.terrain].name}`;
  }

  /* ---------------- placement ---------------- */
  function targetInfo(slot, drag) {
    if (!slot) return { valid: false, reason: '这里放不下' };
    const existing = run.tiles.get(slot.key);
    if (!existing) return { valid: true, merge: false, existing: null, newLevel: 1 };
    if (existing.typeId === drag.typeId) {
      const add = drag.source === 'card' ? 1 : drag.level;
      return { valid: true, merge: true, existing, newLevel: existing.level + add };
    }
    return { valid: false, existing, reason: '不同名不可叠放' };
  }

  function afterTilesChanged() {
    recomputeCombos();
    const fresh = run.combos.find(c => c._isNew);
    if (fresh) {
      toast(`${fresh.triple ? '三件套联动' : '联动成功'}：${comboDescriptor(fresh)} → ${comboName(fresh.result)}`, 'good');
      const slot = slotMap.get(fresh.cell + ':path');
      if (slot) run.sparkles.push({ x: slot.x, y: slot.y - 8, life: 0.8, max: 0.8, color: '#f0b23c', r: 16 });
    }
    state.hover = null;
    updateHud();
  }

  function commitDrag(drag, slot) {
    const info = targetInfo(slot, drag);
    if (!info.valid) {
      toast(info.reason || '这里放不下', 'bad');
      return false;
    }
    if (info.merge) info.existing.level += (drag.source === 'card' ? 1 : drag.level);
    else run.tiles.set(slot.key, { typeId: drag.typeId, kind: drag.kind, level: drag.source === 'card' ? 1 : drag.level });
    if (drag.source === 'tile') run.tiles.delete(drag.key);
    if (drag.source === 'card') {
      run.cards.splice(drag.index, 1);
      state.selectedCard = -1;
      state.handDirty = true;
      state.popIndex = -1;
    }
    afterTilesChanged();
    sfx(info.merge ? 'upgrade' : 'place');
    if (info.merge) toast(`叠放升级 → Lv ${info.newLevel}`, 'good');
    return true;
  }

  function resolveDrag(x, y) {
    const drag = state.dragging;
    state.dragging = null;
    state.dragMove = null;
    state.dragUp = null;
    hideTooltip();
    if (!drag) return;
    state.hover = null;
    const slot = nearestSlot(x, y);
    if (!slot) { updateHandClasses(); return; }
    if (drag.source === 'tile' && slot.key === drag.key) { updateHandClasses(); return; }
    const ok = commitDrag(drag, slot);
    updateHandClasses();
    if (!ok) updateHud();
  }

  function startPointerDrag(drag) {
    state.dragging = drag;
    state.selectedCard = -1;
    state.hover = nearestSlot(drag.px, drag.py);
    const move = ev => {
      drag.px = ev.clientX; drag.py = ev.clientY;
      state.mouse.x = ev.clientX;
      state.mouse.y = ev.clientY;
      state.hover = nearestSlot(ev.clientX, ev.clientY);
      updateDragTooltip();
    };
    const up = ev => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const x = ev.clientX, y = ev.clientY;
      resolveDrag(x, y);
    };
    state.dragMove = move;
    state.dragUp = up;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    updateDragTooltip();
  }

  function tryPlaceSelected(slot) {
    if (state.selectedCard < 0 || !run) return;
    const card = run.cards[state.selectedCard];
    if (!card) { state.selectedCard = -1; return; }
    const drag = { source: 'card', index: state.selectedCard, typeId: card.typeId, kind: card.kind, level: 1 };
    commitDrag(drag, slot);
    updateHandClasses();
  }

  /* ---------------- movement & buffs ---------------- */
  function buffSum(type) {
    let s = 0;
    for (const b of run.buffs) if (b.type === type) s += b.power;
    return s;
  }

  function applyBuff(type, power, cells, label) {
    power = power * run.stats.craft * run.stats.buffPower;
    if (type !== 'heal') power = power * 1;
    const totalCells = Math.ceil(cells + run.stats.persist);
    const cur = run.buffs.find(b => b.type === type);
    if (cur) {
      cur.power = Math.max(cur.power, power);
      cur.cellsLeft = Math.max(cur.cellsLeft, totalCells);
      cur.maxCells = Math.max(cur.maxCells, totalCells);
    } else {
      run.buffs.push({ type, power, cellsLeft: totalCells, maxCells: totalCells });
    }
    const pp = playerPos();
    const def = BUFFDEFS[type];
    run.floats.push({ x: pp.x, y: pp.y - 54, text: '' + def.name + (type === 'heal' ? '' : ' +'), color: def.color, life: 0.9, max: 0.9, size: 14 });
    sfx('buff');
  }

  function onCellEnter(cell) {
    const tile = run.tiles.get(cell + ':path');
    if (tile && tile.kind === 'terrain') {
      const def = TERRAINS[tile.typeId];
      const power = def.walk.power * (1 + 0.5 * (tile.level - 1));
      applyBuff(def.walk.type, power, def.walk.cells, def.name);
    }
    const buffs = run.combos.filter(c => c.cell === cell && c.result.type === 'buff');
    for (const combo of buffs) {
      const lvScale = 1 + 0.5 * (combo.effLevel - 1);
      const power = combo.result.power * lvScale;
      applyBuff(combo.result.buff, power, combo.result.cells + (combo.effLevel - 1), combo.result.label);
    }
  }

  function atStart() {
    return !!run && Math.min(run.pos, CELLS - run.pos) <= 1.4;
  }

  function handleLap() {
    if (!run || run.over || run.finished) return;
    const done = run.lap;
    run.lap += 1;
    const bonus = Math.round(7 + run.lap * 5);
    run.gold += bonus;
    const got = [];
    for (let i = 0; i < 2; i++) {
      const c = giveRandomCard(true);
      if (c) got.push(c);
    }
    const fullCount = 2 - got.length;
    const heal = Math.round(run.maxHp * 0.12);
    run.hp = Math.min(run.maxHp, run.hp + heal);
    const bossKind = (run.lap === 50 || run.lap === 100) ? 'mega' : (run.lap % 10 === 0 ? 'boss' : null);
    run.pendingBoss = bossKind;
    const chips = [`<span class="reward-chip">金币 <b>+${bonus}</b></span>`, `<span class="reward-chip">回血 <b>+${heal}</b></span>`];
    for (const c of got) {
      const def = c.kind === 'terrain' ? TERRAINS[c.typeId] : BUILDINGS[c.typeId];
      chips.push(`<span class="reward-chip ${c.kind}">${c.kind === 'terrain' ? '地形' : '设备'} <b>${def.name}</b></span>`);
    }
    if (fullCount > 0) chips.push(`<span class="reward-chip">手牌满 <b>+${fullCount * 5} 金币</b></span>`);
    if (bossKind) chips.push(`<span class="reward-chip">警告 <b>${bossKind === 'mega' ? '深核暴君' : '污染巨兽'}</b></span>`);
    $('lapTitle').textContent = `跑完第 ${done} 圈`;
    const bossNote = bossKind === 'mega'
      ? ` · 第 ${run.lap} 圈的大boss「深核暴君」在等你`
      : bossKind ? ` · 第 ${run.lap} 圈的污染巨兽在等你` : '';
    $('lapSub').textContent = `第 ${run.lap} 圈开始 · 路上的污染生物更凶了${bossNote}`;
    $('lapRewards').innerHTML = chips.join('');
    updateHud();
    openOv('lapOverlay');
    sfx('lap');
  }

  function updateRun(dt) {
    if (!run || run.over) return;
    run.time += dt;

    // movement
    const fleet = buffSum('fleet');
    const step = run.stats.move * (1 + fleet) * dt;
    run.pos += step;
    run.cellsMoved = (run.cellsMoved || 0) + step;

    // buff cell countdown
    for (const b of run.buffs) b.cellsLeft -= step;
    run.buffs = run.buffs.filter(b => b.cellsLeft > 0);

    // heal: buff + passive regen
    const healPerCell = buffSum('heal') + run.stats.regen;
    if (healPerCell > 0) {
      run.healAcc += healPerCell * step;
      if (run.healAcc >= 1) {
        const h = Math.floor(run.healAcc);
        run.healAcc -= h;
        run.hp = Math.min(run.maxHp, run.hp + h);
      }
    }

    // lap & cells
    if (run.pos >= CELLS) {
      const prevCell = run.lastCell;
      run.pos -= CELLS;
      for (let c = prevCell + 1; c < CELLS; c++) onCellEnter(c);
      onCellEnter(0);
      run.lastCell = 0;
      handleLap();
      if (run.over || run.finished) return;
    } else {
      const cell = Math.floor(run.pos);
      if (cell !== run.lastCell) {
        for (let c = run.lastCell + 1; c <= cell; c++) onCellEnter(c);
        run.lastCell = cell;
      }
    }

    // monster spawning
    run.monsterTimer -= dt;
    if (run.monsterTimer <= 0 && run.monsters.length < 16) {
      spawnMonster(randomMonsterType());
      run.monsterTimer = Math.max(0.95, 3.0 - run.lap * 0.16) * (0.85 + Math.random() * 0.3);
    }

    updateSpawners(dt);

    // player auto attack
    run.playerAtkTimer -= dt;
    if (run.playerAtkTimer <= 0) {
      const target = nearestMonster(3.0);
      if (target) {
        doPlayerAttack(target);
        run.playerAtkTimer = 1 / (1.25 * (1 + buffSum('haste') + run.stats.attackSpeed));
      } else {
        run.playerAtkTimer = 0.15;
      }
    }

    updateMinions(dt);
    updateMonsters(dt);
    run.monsters = run.monsters.filter(m => !m.dead);

    // effect lifetimes
    for (const f of run.floats) f.life -= dt;
    run.floats = run.floats.filter(f => f.life > 0);
    for (const s of run.slashes) s.life -= dt;
    run.slashes = run.slashes.filter(s => s.life > 0);
    for (const p of run.projectiles) p.t += dt;
    run.projectiles = run.projectiles.filter(p => p.t < p.dur);
    for (const sp of run.sparkles) sp.life -= dt;
    run.sparkles = run.sparkles.filter(sp => sp.life > 0);
    for (const c of run.coins) c.t += dt;
    run.coins = run.coins.filter(c => c.t < c.dur);
    run.hurtFlash = Math.max(0, run.hurtFlash - dt);
    run.hurtCd = Math.max(0, run.hurtCd - dt);
    run.swing = Math.max(0, run.swing - dt * 5);
    if (run.banner) {
      run.banner.life -= dt;
      if (run.banner.life <= 0) run.banner = null;
    }
  }

  function updateSpawners(dt) {
    const recruit = run.stats.recruit;
    for (const c of run.combos) {
      if (c.result.type !== 'minion') continue;
      const key = 'c' + c.key;
      let t = (run.spawnerMap.get(key) || 0) + dt;
      const cd = Math.max(1.1, 3.4 - c.effLevel * 0.22 - run.lap * 0.04) / recruit;
      if (t >= cd) {
        if (run.minions.length < run.maxMinions) {
          spawnMinion(c.result.id, c.effLevel, angleOfCell(c.cell));
          t = 0;
        } else {
          t = cd;
        }
      }
      run.spawnerMap.set(key, t);
    }
    for (const [key, tile] of run.tiles) {
      if (tile.kind !== 'building') continue;
      if (run.activeBuildingKeys.has(key)) continue;
      const cell = parseInt(key, 10);
      const sk = 'b' + key;
      let t = (run.spawnerMap.get(sk) || 0) + dt;
      const cd = 8.2 / recruit;
      if (t >= cd) {
        if (run.minions.length < run.maxMinions) {
          spawnMinion('militia', 1, angleOfCell(cell));
          t = 0;
        } else {
          t = cd;
        }
      }
      run.spawnerMap.set(sk, t);
    }
  }

  function spawnMinion(defId, effLevel, angle) {
    const def = MINIONS[defId];
    const dmg = def.dmg
      * (1 + 0.25 * (run.lap - 1))
      * (1 + 0.5 * (effLevel - 1))
      * run.stats.minion;
    run.minions.push({
      defId,
      dmg,
      rate: def.rate,
      range: def.range,
      phase: (run.minions.length * 2.3999) % TAU + Math.random() * 0.25,
      ready: 0.4 + Math.random() * 0.6,
      born: run.time
    });
    const p = ringPoint(angle, playerR);
    run.sparkles.push({ x: p.x, y: p.y, life: 0.5, max: 0.5, color: def.color, r: 12 });
  }

  /* ---------------- monsters & combat ---------------- */
  function wrapDist(a, b) {
    const d = Math.abs(a - b) % CELLS;
    return Math.min(d, CELLS - d);
  }
  function shortDir(a, b) {
    let d = mod(b - a + CELLS / 2, CELLS) - CELLS / 2;
    return d >= 0 ? 1 : -1;
  }

  function showBanner(text, sub, color) {
    if (!run) return;
    run.banner = { text, sub: sub || '', color: color || '#ef6a5b', life: 2.6, max: 2.6 };
  }

  function randomMonsterType() {
    const r = Math.random();
    if (run.lap >= 4 && r < 0.3) return 'thorn';
    if (run.lap >= 2 && r < 0.58) return 'bat';
    return 'slime';
  }

  function spawnMonster(type, angleOverride, opts = {}) {    if (!run || run.over) return;
    if (!opts.force && run.monsters.length >= 16) return;
    const def = MONSTER_TYPES[type] || MONSTER_TYPES.slime;
    const lap = run.lap;
    let angle;
    if (angleOverride != null) angle = mod(angleOverride, CELLS);
    else {
      const ahead = Math.random() < 0.55;
      const off = (1.6 + Math.random() * 5) * (ahead ? 1 : -1);
      angle = mod(run.pos + off, CELLS);
    }
    const elite = !def.boss && lap >= 2 && Math.random() < 0.18;
    const hpMul = def.hp * (elite ? 2.4 : 1) * (1 + Math.random() * 0.2);
    const goldMul = def.gold * (elite ? 2.4 : 1);
    const baseHp = 16 + lap * 10.5;
    const baseDmg = 4 + lap * 1.3;
    const m = {
      type,
      angle,
      hp: baseHp * hpMul,
      maxHp: baseHp * hpMul,
      dmg: baseDmg * (elite ? 1.5 : 1) * (def.boss ? 1.8 : 1),
      gold: (3 + lap * 1.6) * goldMul,
      speed: (0.26 + lap * 0.012) * (def.boss ? 0.7 : 1) * (elite ? 0.9 : 1),
      elite,
      boss: !!def.boss,
      mega: !!def.mega,
      phase: Math.random() * TAU,
      hurtT: 0,
      slowT: 0,
      atkTimer: 0.6 + Math.random() * 0.5,
      lane: (Math.random() - 0.5) * 12
    };
    run.monsters.push(m);
    const p = monsterPos(m);
    run.sparkles.push({ x: p.x, y: p.y, life: 0.5, max: 0.5, color: '#ef6a5b', r: 14 });
  }

  function nearestMonster(range, exclude) {
    let best = null, bestD = 1e9;
    for (const m of run.monsters) {
      if (m.dead || m === exclude) continue;
      const d = wrapDist(m.angle, run.pos);
      if (d < bestD && d <= range) { bestD = d; best = m; }
    }
    return best;
  }

  function doPlayerAttack(target) {
    const crit = Math.random() < run.stats.crit;
    const power = run.stats.dmg * (1 + buffSum('strength')) * (crit ? 2 + run.stats.critDmg : 1);
    dealDamage(target, power, true);
    const pp = playerPos();
    const mp = monsterPos(target);
    if (crit) {
      run.floats.push({ x: mp.x, y: mp.y - 44, text: '暴击!', color: '#f0b23c', life: 0.9, max: 0.9, size: 19 });
    }
    run.slashes.push({ x: pp.x, y: pp.y, ang: Math.atan2(mp.y - pp.y, mp.x - pp.x), life: 0.2, max: 0.2 });
    run.swing = 1;
  }

  function updateMinions(dt) {
    const haste = 1 + buffSum('haste') + run.stats.attackSpeed * 0.35;
    const strength = 1 + buffSum('strength');
    run.minions.forEach((m, i) => {
      m.ready -= dt;
      if (m.ready > 0) return;
      const def = MINIONS[m.defId];
      const target = nearestMonster(def.range);
      if (target) {
        const primaryDmg = m.dmg * strength;
        dealDamage(target, primaryDmg, false);
        m.ready = 1 / (def.rate * haste);
        const from = minionScreen(i, m);
        const to = monsterPos(target);
        run.projectiles.push({ x0: from.x, y0: from.y, x1: to.x, y1: to.y, t: 0, dur: 0.22, color: def.color });
        if (def.slow && !target.dead) target.slowT = 1.2;
        if (run.stats.splash > 0 && !target.dead) {
          const second = nearestMonster(def.range, target);
          if (second) {
            dealDamage(second, primaryDmg * run.stats.splash, false);
            const to2 = monsterPos(second);
            run.projectiles.push({ x0: from.x, y0: from.y, x1: to2.x, y1: to2.y, t: 0, dur: 0.26, color: '#f0b23c' });
          }
        }
      } else {
        m.ready = 0.2;
      }
    });
  }

  function updateMonsters(dt) {
    for (const m of run.monsters) {
      if (m.dead) continue;
      m.hurtT = Math.max(0, m.hurtT - dt);
      m.slowT = Math.max(0, m.slowT - dt);
      const d = wrapDist(m.angle, run.pos);
      if (d < 0.9) {
        m.atkTimer -= dt;
        if (m.atkTimer <= 0) {
          damagePlayer(m.dmg);
          m.atkTimer = 1.3 + Math.random() * 0.4;
        }
      } else {
        const dir = shortDir(m.angle, run.pos);
        const sp = m.speed * (m.slowT > 0 ? 0.45 : 1) * dt;
        m.angle = mod(m.angle + dir * sp, CELLS);
      }
    }
  }

  function dealDamage(m, amount, byPlayer) {
    if (!m || m.dead) return;
    m.hp -= amount;
    m.hurtT = 0.22;
    const p = monsterPos(m);
    if (run.floats.length < 34) {
      run.floats.push({
        x: p.x + (Math.random() - 0.5) * 14,
        y: p.y - 22,
        text: '' + Math.max(1, Math.round(amount)),
        color: byPlayer ? '#dce9e4' : '#63d6cc',
        life: 0.7, max: 0.7, size: 15
      });
    }
    if (m.hp <= 0) killMonster(m);
  }

  function goldMultiplier() {
    let upgrades = 0;
    for (const [, t] of run.tiles) upgrades += t.level - 1;
    return run.stats.gold * (1 + buffSum('bounty')) * (1 + 0.05 * upgrades);
  }

  function killMonster(m) {
    if (m.dead) return;
    m.dead = true;
    run.kills += 1;
    const mult = goldMultiplier();
    const gold = Math.max(1, Math.round(m.gold * mult));
    run.gold += gold;
    const p = monsterPos(m);
    run.floats.push({ x: p.x, y: p.y - 30, text: '+' + fmt(gold), color: '#f0b23c', life: 0.85, max: 0.85, size: 16 });
    for (let i = 0; i < 3; i++) {
      run.coins.push({
        x: p.x + (Math.random() - 0.5) * 18,
        y: p.y + (Math.random() - 0.5) * 12,
        t: 0, dur: 0.55 + Math.random() * 0.25,
        tx: 44, ty: 118,
        r: 6 + Math.random() * 2
      });
    }
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * TAU;
      run.sparkles.push({
        x: p.x, y: p.y,
        vx: Math.cos(a) * 40, vy: Math.sin(a) * 40,
        life: 0.5, max: 0.5, color: i % 2 ? '#f0b23c' : '#dce9e4', r: 4
      });
    }
    sfx('kill');
    if (m.mega) {
      for (let i = 0; i < 6; i++) giveRandomCard();
      run.floats.push({ x: p.x, y: p.y - 60, text: '深核暴君被打败了！', color: '#f0b23c', life: 1.8, max: 1.8, size: 22 });
      showBanner('深核暴君被打败了', '大boss倒下了 · 金币 +' + fmt(gold), '#63d6cc');
    } else if (m.boss) {
      for (let i = 0; i < 3; i++) giveRandomCard();
      run.floats.push({ x: p.x, y: p.y - 50, text: '污染巨兽倒下了！', color: '#ef6a5b', life: 1.4, max: 1.4, size: 18 });
      showBanner('污染巨兽倒下了', '金币 +' + fmt(gold), '#63d6cc');
    } else if (m.elite) {
      giveRandomCard();
    } else if (Math.random() < run.stats.cardChance) {
      giveRandomCard();
    }
  }

  function damagePlayer(amount) {
    if (!run || run.over) return;
    const guard = Math.min(0.25, run.minions.filter(m => MINIONS[m.defId].aura).length * 0.05);
    const reduction = Math.min(0.8, run.stats.armor + buffSum('ironwall') + guard);
    const dmg = amount * (1 - reduction);
    run.hp -= dmg;
    if (run.hurtCd <= 0) {
      run.hurtFlash = 0.3;
      run.hurtCd = 0.55;
    }
    const pp = playerPos();
    run.floats.push({ x: pp.x + (Math.random() - .5) * 10, y: pp.y - 44, text: '-' + Math.max(1, Math.round(dmg)), color: '#ef6a5b', life: 0.8, max: 0.8, size: 16 });
    sfx('hurt');
    if (run.hp <= 0) {
      if (run.stats.revive && !run.revived) {
        run.revived = true;
        run.hp = Math.round(run.maxHp * 0.3);
        run.hurtFlash = 0.45;
        run.floats.push({ x: pp.x, y: pp.y - 64, text: '不屈!', color: '#f0b23c', life: 1.2, max: 1.2, size: 22 });
        toast('「不屈」发动 · 你撑住了！', 'good');
        sfx('win');
        return;
      }
      run.hp = 0;
      die();
    }
  }

  function die() {
    if (!run || run.finished) return;
    finishRun('death');
  }

  /* ---------------- cards ---------------- */
  function giveCard(typeId, kind, quiet) {
    if (!run) return null;
    if (run.cards.length >= run.cardLimit) {
      run.gold += 5;
      if (!quiet) toast('手牌满了 · 换成 <b>5</b> 金币', 'bad');
      updateHud();
      return null;
    }
    const card = { typeId, kind };
    run.cards.push(card);
    state.handDirty = true;
    state.popIndex = run.cards.length - 1;
    if (!quiet) {
      const def = kind === 'terrain' ? TERRAINS[typeId] : BUILDINGS[typeId];
      toast(`掉了一张「${def.name}」`, 'good');
      sfx('card');
    }
    updateHud();
    return card;
  }

  function giveRandomCard(quiet) {
    const c = randomCard();
    return giveCard(c.typeId, c.kind, quiet);
  }

  /* ---------------- ending ---------------- */
  function finishRun(reason) {
    if (!run || run.finished) return;
    run.finished = true;
    run.over = true;
    let pct;
    if (reason === 'death') pct = run.stats.deathKeep;
    else if (reason === 'abandon') pct = 0;
    else pct = atStart() ? 1 : run.stats.offKeep;
    pct = clamp(pct, 0, 1);
    const bonus = 1 + run.stats.valueGain;
    const kept = Math.floor(run.gold * pct * bonus);
    meta.gold += kept;
    meta.runs += 1;
    meta.totalGold += kept;
    meta.bestLap = Math.max(meta.bestLap, run.lap);
    saveMeta();
    closeAllOv();
    state.scene = 'end';
    state.dragging = null;
    state.selectedCard = -1;
    hideTooltip();
    updateVisibility();
    const title = reason === 'death' ? '你倒下了…' : reason === 'abandon' ? '这圈先算了' : '撤离成功';
    $('endTitle').textContent = title;
    $('endSub').textContent = `第 ${run.lap} 圈 · 击倒 ${run.kills} 只 · ${
      reason === 'death' ? '阵亡只保住 ' + Math.round(pct * 100) + '% 金币' :
      reason === 'abandon' ? '主动撒手，金币归零' :
      '带回 ' + Math.round(pct * 100) + '% 金币'} · 无人机 ${run.minions.length} 只`;
    const rows = [
      ['本轮攒下', fmt(run.gold)],
      ['保留倍率', Math.round(pct * 100) + '%'],
      ['入账', '+' + fmt(kept)],
      ['存钱罐', fmt(meta.gold)]
    ];
    if (run.stats.valueGain > 0) {
      rows.splice(2, 0, ['额外溢价', '+' + Math.round(run.stats.valueGain * 100) + '%']);
    }
    $('endReceipt').innerHTML = rows.map(r => `<div class="receipt-row"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')
      + `<div class="receipt-row total"><span>带回金币</span><b>+${fmt(kept)}</b></div>`
      + `<div class="receipt-stamp">${reason === 'death' ? '下次小心' : '已入账'}</div>`;
    openOv('endOverlay');
    updateStartStats();
    updateHud();
    sfx(reason === 'death' ? 'lose' : 'win');
  }

  /* ---------------- tooltip & hover ---------------- */
  const tipEl = () => $('tooltip');
  function setTooltip(html, x, y) {
    const tip = tipEl();
    tip.innerHTML = html;
    tip.classList.add('show');
    let left = x + 16, top = y + 18;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    if (left + tw > W - 12) left = x - tw - 14;
    if (top + th > H - 12) top = y - th - 12;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
  }
  function hideTooltip() { tipEl().classList.remove('show'); }

  function previewEntries(cell, targetSlot, drag) {
    const entries = [];
    for (const slot of ['inner', 'path', 'side']) {
      const key = cell + ':' + slot;
      if (drag.source === 'tile' && drag.key === key && slot !== targetSlot) continue;
      let tile = run.tiles.get(key);
      if (slot === targetSlot) {
        const add = drag.source === 'card' ? 1 : drag.level;
        if (tile && tile.typeId !== drag.typeId) return null;
        tile = tile
          ? { typeId: tile.typeId, kind: tile.kind, level: tile.level + add }
          : { typeId: drag.typeId, kind: drag.kind, level: drag.source === 'card' ? 1 : drag.level };
      }
      if (tile) entries.push({ slot, key, typeId: tile.typeId, kind: tile.kind, level: tile.level });
    }
    return entries;
  }

  function comboPreviewHtml(ev) {
    let html = '';
    if (!ev) return html;
    if (ev.triple) {
      html += `<div class="tip-combo">三件套联动：${comboDescriptor(ev.triple)} → <b>${comboName(ev.triple.result)}</b></div>`;
    } else {
      for (const p of ev.pairs) {
        html += `<div class="tip-combo">会联动：${BUILDINGS[p.building].name} × ${TERRAINS[p.terrain].name} → <b>${comboName(p.result)}</b></div>`;
      }
    }
    return html;
  }

  function slotLabel(slot) {
    return slot.slot === 'path' ? '中间跑道' : slot.slot === 'inner' ? '里侧路边' : '外侧路边';
  }

  function comboPreview(typeId, kind, slot) {
    const entries = [];
    const otherSlots = slot.slot === 'path' ? ['inner', 'side'] : ['path'];
    for (const s of otherSlots) {
      const other = run.tiles.get(slot.cell + ':' + s);
      if (!other) continue;
      let bId = null, tId = null;
      if (kind === 'building' && other.kind === 'terrain') { bId = typeId; tId = other.typeId; }
      else if (kind === 'terrain' && other.kind === 'building') { tId = typeId; bId = other.typeId; }
      if (bId && tId) {
        const recipe = COMBOS[bId] && COMBOS[bId][tId];
        if (recipe) return { recipe, building: bId, terrain: tId };
      }
    }
    return null;
  }

  function dragTooltipHtml(drag, slot) {
    const info = targetInfo(slot, drag);
    const def = drag.kind === 'terrain' ? TERRAINS[drag.typeId] : BUILDINGS[drag.typeId];
    let html = `<div class="tip-title">${def.name} <span class="tip-lv">Lv ${drag.level}</span></div>`;
    if (drag.source === 'tile' && drag.key === slot.key) {
      html += `<div style="color:#9db3ae">松手就放回原处</div>`;
      return html;
    }
    if (!info.valid) {
      html += `<div class="tip-bad">${info.reason}</div>`;
      return html;
    }
    if (info.merge) html += `<div>同名叠放 → <b>Lv ${info.newLevel}</b></div>`;
    else html += `<div>${slotLabel(slot)}</div>`;
    const entries = previewEntries(slot.cell, slot.slot, drag);
    const ev = entries ? evaluateCellEntries(entries, slot.cell) : null;
    const combosHtml = comboPreviewHtml(ev);
    if (combosHtml) html += combosHtml;
    else if (drag.kind === 'terrain') {
      html += slot.slot === 'path'
        ? '<div>中间地形会被角色踩过；两侧各放一个设备即可分别联动</div>'
        : '<div>地形放中间跑道，最能吃到联动</div>';
    } else {
      html += slot.slot === 'path'
        ? '<div>中间一般是地形跑道；设备也能和两侧地形联动</div>'
        : '<div>把地形放在中间跑道，设备放在两侧即可联动；两边都配好还能触发三件套</div>';
    }
    html += `<div style="color:#9db3ae;margin-top:3px">松手放下 · 拖回原格取消</div>`;
    return html;
  }

  function updateDragTooltip() {
    const drag = state.dragging;
    if (!drag) return;
    const slot = nearestSlot(drag.px, drag.py);
    state.hover = slot;
    if (!slot) { setTooltip('拖到圈上的格子里', drag.px, drag.py); return; }
    setTooltip(dragTooltipHtml(drag, slot), drag.px, drag.py);
  }

  function tileTooltip(tile, slot) {
    const isTerrain = tile.kind === 'terrain';
    const def = isTerrain ? TERRAINS[tile.typeId] : BUILDINGS[tile.typeId];
    let html = `<div class="tip-title">${def.name} <span class="tip-lv">Lv ${tile.level}</span></div>`;
    html += `<div>${isTerrain ? '地形' : '设备'} · ${slotLabel(slot)}</div>`;
    if (isTerrain && slot.slot === 'path') {
      const walk = TERRAINS[tile.typeId].walk;
      const cells = walk.cells + run.stats.persist;
      html += `<div>踩过：${BUFFDEFS[walk.type].fmt(walk.power * (1 + 0.5 * (tile.level - 1)) * run.stats.craft * run.stats.buffPower)} · ${cells} 格</div>`;
    } else if (isTerrain) {
      html += `<div>放在中间跑道时，角色踩过会给 buff</div>`;
    }
    const combos = run.combos.filter(c => c.slots.includes(slot.key));
    if (combos.length) {
      for (const combo of combos) {
        const tag = combo.triple ? '三件套联动中' : '联动中';
        html += `<div class="tip-combo">${tag}：${comboDescriptor(combo)} → <b>${comboName(combo.result)}</b>（强度 Lv ${combo.effLevel}）</div>`;
      }
    } else {
      if (!isTerrain) {
        html += `<div>单独放：约 8 秒召一名民兵</div>`;
        html += slot.slot === 'path'
          ? '<div>把地形放两侧路边，就能和它联动</div>'
          : '<div>把地形放中间跑道，就能联动；两侧都配好还能三件套</div>';
      } else {
        html += slot.slot === 'path'
          ? '<div>两侧各放一个设备即可分别联动；两边凑齐配方会出三件套联动</div>'
          : '<div>地形放中间跑道，角色会踩过并吃 buff</div>';
      }
    }
    html += `<div style="color:#9db3ae;margin-top:3px">按住拖动可搬家 / 同名叠放升级</div>`;
    return html;
  }

  /* ---------------- rendering ---------------- */
  function playerPos() { return ringPoint(angleOfPos(run.pos), playerR); }
  function monsterPos(m) { return ringPoint(angleOfPos(m.angle), playerR + (m.lane || 0) * 0.35); }
  function minionScreen(i, m) {
    const pp = playerPos();
    const scale = clamp(R / 220, 0.7, 1.08);
    const orbit = (30 + (i % 5) * 11) * scale;
    const a = m.phase + state.time * 0.35;
    return {
      x: pp.x + Math.cos(a) * orbit,
      y: pp.y - 8 * scale + Math.sin(a) * orbit * 0.55 + Math.sin(state.time * 7 + m.phase) * 1.5
    };
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (bgLayer) ctx.drawImage(bgLayer, 0, 0, W, H);
    else { ctx.fillStyle = '#080e12'; ctx.fillRect(0, 0, W, H); }
    boil = Math.floor(state.time / 0.17) % 3;
    if (state.scene === 'start') {
      drawDemoScene();
      return;
    }
    if (!run) return;
    drawSlotGuides();
    drawTiles();
    drawComboLinks();
    drawMonsters();
    drawProjectiles();
    drawMinions();
    drawPlayer();
    drawEffects();
    drawCenterInfo();
    drawBanner();
    drawExtractionReady();
    drawDragGhost();
    drawHurt();
  }

  function activeDrag() { return state.dragging; }

  function currentDragFor(slot) {
    const d = state.dragging;
    if (d) return d;
    if (state.selectedCard >= 0 && run.cards[state.selectedCard]) {
      const c = run.cards[state.selectedCard];
      return { source: 'card', index: state.selectedCard, typeId: c.typeId, kind: c.kind, level: 1 };
    }
    return null;
  }

  function drawSlotGuides() {
    if (!run || run.over) return;
    const d = currentDragFor();
    ctx.save();
    for (const s of slots) {
      const isPath = s.slot === 'path';
      // empty bases are baked into the background layer
      // drag / selection feedback
      if (d) {
        const info = targetInfo(s, d);
        const isHover = state.hover && state.hover.key === s.key;
        const col = info.valid ? (info.merge ? '#f0b23c' : '#63d6cc') : '#ef6a5b';
        const rad = (isPath ? pathSize : sideSize) * 0.52 + 3;
        ctx.globalAlpha = isHover ? 0.85 : (info.valid ? 0.48 : 0.18);
        ctx.strokeStyle = col;
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = isHover ? 2.4 : 1.4;
        ctx.beginPath();
        ctx.arc(s.x, s.y, rad, 0, TAU);
        ctx.stroke();
        if (isHover) {
          ctx.globalAlpha = 0.75;
          ctx.setLineDash([]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(s.x, s.y, rad + 4, 0, TAU);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  function drawComboLinks() {
    if (!run) return;
    for (const c of run.combos) {
      const col = c.result.type === 'minion' ? MINIONS[c.result.id].color : BUFFDEFS[c.result.buff].color;
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = c.triple ? 2 : 1.5;
      ctx.globalAlpha = c.triple ? 0.85 : 0.68;
      ctx.setLineDash(c.triple ? [3, 4] : [2, 4]);
      if (c.triple) {
        const p = slotMap.get(c.cell + ':path');
        for (const s of ['inner', 'side']) {
          const q = slotMap.get(c.cell + ':' + s);
          if (!p || !q) continue;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
        ctx.restore();
        if (p) {
          Art.drawSparkle(ctx, p.x, p.y - 6, 9, state.time + c.cell, '#f0b23c');
          Art.drawSparkle(ctx, p.x, p.y - 6, 5, state.time + c.cell + 1.3, col);
        }
      } else {
        const a = slotMap.get(c.slots[0]);
        const b = slotMap.get(c.slots[1]);
        if (!a || !b) { ctx.restore(); continue; }
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.restore();
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        Art.drawSparkle(ctx, mid.x, mid.y, 5.5, state.time + c.cell, col);
      }
    }
  }

  function drawLevelTag(x, y, level, size, alpha = 1) {
    if (level <= 1) return;
    const bx = x + size * 0.4, by = y + size * 0.35;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(bx, by, 8.5, 0, TAU);
    ctx.fillStyle = '#0b1519'; ctx.fill();
    ctx.lineWidth = 1.3; ctx.strokeStyle = '#63d6cc'; ctx.stroke();
    ctx.fillStyle = '#dce9e4';
    ctx.font = font(12, true);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('' + level, bx, by + 0.5);
    ctx.restore();
  }

  function drawTiles() {
    if (!run) return;
    const d = state.dragging;
    for (const [key, tile] of run.tiles) {
      if (d && d.source === 'tile' && d.key === key) continue;
      const slot = slotMap.get(key);
      if (!slot) continue;
      const size = (slot.slot === 'path' ? pathSize : sideSize) * 1.12;
      Art.drawTileAt(ctx, tile.typeId, tile.kind, tile.level, slot.x, slot.y, size, boil, slot.slot);
      drawLevelTag(slot.x, slot.y, tile.level, size);
    }
  }

  function drawMonsters() {
    if (!run) return;
    const scale = clamp(R / 220, 0.75, 1.12);
    for (const m of run.monsters) {
      if (m.dead) continue;
      const p = monsterPos(m);
      const size = (m.mega ? 96 : m.boss ? 58 : 38) * (m.elite ? 1.15 : 1) * scale;
      Art.drawMonster(ctx, p.x, p.y, size, m.type, state.time, boil, { phase: m.phase, hurt: m.hurtT > 0 });
      if (m.slowT > 0) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#63d6cc';
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(p.x, p.y, size * 0.55, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      // name tag for bosses
      if (m.boss) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.font = font(Math.max(12, size * 0.24), true);
        ctx.textAlign = 'center';
        ctx.fillStyle = m.mega ? '#f0b23c' : '#dce9e4';
        ctx.strokeStyle = 'rgba(6,11,14,.85)';
        ctx.lineWidth = 3;
        const name = MONSTER_TYPES[m.type].name;
        const labelY = p.y - size * 0.9 - 24;
        ctx.strokeText(name, p.x, labelY);
        ctx.fillText(name, p.x, labelY);
        ctx.restore();
      }
      // hp bar
      const ratio = clamp(m.hp / m.maxHp, 0, 1);
      const w = Math.max(26, size * 0.82), h = m.boss ? 7 : 5;
      const bx = p.x - w / 2, by = p.y - size * 0.62 - 10;
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = '#0a1216';
      ctx.fillRect(bx, by, w, h);
      ctx.fillStyle = ratio > 0.45 ? '#ef6a5b' : '#b43f33';
      ctx.fillRect(bx, by, w * ratio, h);
      ctx.strokeStyle = 'rgba(220,233,228,.55)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(bx, by, w, h);
      ctx.restore();
      if (m.elite) {
        Art.drawIcon(ctx, 'star', p.x, by - 8, 13, { color: '#f0b23c' });
      }
    }
  }

  function drawProjectiles() {
    if (!run) return;
    for (const p of run.projectiles) {
      const k = p.t / p.dur;
      const x = p.x0 + (p.x1 - p.x0) * k;
      const y = p.y0 + (p.y1 - p.y0) * k;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - (p.x1 - p.x0) * 0.06, y - (p.y1 - p.y0) * 0.06);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fillStyle = p.color; ctx.fill();
      ctx.restore();
    }
  }

  function drawSlashes() {
    if (!run) return;
    for (const s of run.slashes) {
      const k = s.life / s.max;
      ctx.save();
      ctx.globalAlpha = k * 0.9;
      ctx.strokeStyle = '#dce9e4';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 34 + (1 - k) * 10, s.ang - 0.5, s.ang + 0.5);
      ctx.stroke();
      ctx.strokeStyle = '#63d6cc';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 34 + (1 - k) * 10 + 3, s.ang - 0.45, s.ang + 0.45);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPlayer() {
    if (!run) return;
    const a = angleOfPos(run.pos);
    const p = ringPoint(a, playerR);
    const flip = -Math.sin(a) < 0;
    const heroSize = clamp(R * 0.22, 34, 50);
    drawSlashes();
    Art.drawHero(ctx, p.x, p.y, heroSize, state.time, boil, { flip, swing: run.swing });
    // buff badges
    const active = run.buffs.slice(0, 6);
    const spacing = heroSize * 0.64;
    const startX = p.x - (active.length - 1) * spacing / 2;
    const by = p.y - heroSize * 1.22;
    for (let i = 0; i < active.length; i++) {
      const b = active[i];
      const def = BUFFDEFS[b.type];
      const bx = startX + i * spacing;
      ctx.save();
      ctx.beginPath(); ctx.arc(bx, by, 10, 0, TAU);
      ctx.fillStyle = '#0b1519'; ctx.fill();
      ctx.strokeStyle = def.color; ctx.lineWidth = 1.8; ctx.stroke();
      Art.drawIcon(ctx, def.icon, bx, by - 1, 12, { color: def.color });
      // countdown arc
      ctx.beginPath();
      ctx.arc(bx, by, 12.5, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(b.cellsLeft / b.maxCells, 0, 1));
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#9db3ae';
      ctx.font = font(10, true);
      ctx.textAlign = 'center';
      ctx.fillText(Math.max(1, Math.ceil(b.cellsLeft)) + '格', bx, by + 19);
      ctx.restore();
    }
  }

  function drawMinions() {
    if (!run) return;
    const size = clamp(R * 0.11, 18, 26);
    run.minions.forEach((m, i) => {
      const s = minionScreen(i, m);
      const def = MINIONS[m.defId];
      Art.drawMinion(ctx, s.x, s.y, size, def, state.time, boil, { phase: m.phase });
    });
  }

  function drawEffects() {
    if (!run) return;
    for (const f of run.floats) {
      const k = f.life / f.max;
      ctx.save();
      ctx.globalAlpha = clamp(k * 1.4, 0, 1);
      ctx.font = font(f.size, true);
      ctx.textAlign = 'center';
      ctx.fillStyle = f.color;
      ctx.strokeStyle = 'rgba(5,9,12,.9)';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y - (1 - k) * 22);
      ctx.fillText(f.text, f.x, f.y - (1 - k) * 22);
      ctx.restore();
    }
    for (const sp of run.sparkles) {
      const k = sp.life / sp.max;
      ctx.save();
      ctx.globalAlpha = k;
      const dx = (sp.vx || 0) * (1 - k) * 0.3;
      const dy = (sp.vy || 0) * (1 - k) * 0.3;
      Art.drawSparkle(ctx, sp.x + dx, sp.y + dy, (sp.r || 6) * (0.4 + k * 0.6), state.time, sp.color || '#f0b23c');
      ctx.restore();
    }
    for (const c of run.coins) {
      const k = clamp(c.t / c.dur, 0, 1);
      const e = k * k * (3 - 2 * k);
      const x = c.x + (c.tx - c.x) * e;
      const y = c.y + (c.ty - c.y) * e - Math.sin(k * Math.PI) * 40;
      ctx.save();
      ctx.globalAlpha = 0.4 + 0.6 * (1 - k);
      Art.drawCoin(ctx, x, y, c.r * (1 - k * 0.4), state.time + c.x, boil);
      ctx.restore();
    }
  }

  function drawCenterInfo() {
    if (!run || state.scene !== 'run') return;
    const small = R < 150;
    const lapFont = clamp(R * 0.24, 20, 58);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.globalAlpha = 1;
    ctx.shadowColor = 'rgba(99,214,204,.35)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#dce9e4';
    ctx.font = font(lapFont, true);
    ctx.fillText(`第 ${run.lap} 圈`, cx, cy + lapFont * 0.12);
    ctx.shadowBlur = 0;
    Art.sketch(ctx, [[cx - lapFont * 1.1, cy + lapFont * 0.3], [cx - 12, cy + lapFont * 0.36], [cx + 18, cy + lapFont * 0.28], [cx + lapFont * 1.1, cy + lapFont * 0.34]],
      { seed: 880, boil, width: 1.6, color: 'rgba(99,214,204,.55)', amp: 1, passes: 1, alpha: 0.65 });
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#9db3ae';
    const fsize = small ? 9 : 13;
    ctx.font = font(fsize, true);
    const statsY = cy + lapFont * (small ? 0.55 : 0.72);
    ctx.fillText(`击倒 ${run.kills} · 无人机 ${run.minions.length}/${run.maxMinions}`, cx, statsY);
    // danger meter
    const danger = clamp((run.lap - 1) / 30, 0, 1);
    const barW = clamp(R * 0.5, small ? 58 : 74, 146);
    const bx = cx - barW / 2;
    const by = statsY + (small ? 11 : 13);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#050b0e';
    ctx.fillRect(bx - 2, by - 2, barW + 4, 9);
    ctx.fillStyle = '#ef6a5b';
    ctx.fillRect(bx, by, barW * danger, 5);
    ctx.strokeStyle = 'rgba(220,233,228,.4)';
    ctx.lineWidth = 1.1;
    ctx.strokeRect(bx - 2, by - 2, barW + 4, 9);
    if (!small) {
      ctx.fillStyle = '#9db3ae';
      ctx.font = font(10, true);
      ctx.textAlign = 'left';
      ctx.fillText('威胁', bx - 34, by + 6);
    }
    ctx.restore();
    ctx.restore();
  }

  function drawBanner() {
    if (!run || !run.banner) return;
    const bn = run.banner;
    const k = clamp(bn.life / bn.max, 0, 1);
    const alpha = Math.min(1, k * 2.4);
    const bw = clamp(R * 1.05, 210, 420);
    const bh = clamp(R * 0.25, 54, 82);
    const by = cy - R * 0.46;
    ctx.save();
    ctx.globalAlpha = alpha;
    const pts = Art.roundRectPts(cx, by, bw, bh, 8);
    Art.wash(ctx, pts, '#03070a', { alpha: 0.85, ox: 3, oy: 4 });
    Art.wash(ctx, pts, '#18272d', { alpha: 0.98, ox: 0, oy: 0 });
    Art.sketch(ctx, pts, { seed: 990, boil, width: 2.4, closed: true, amp: 0.6, color: '#05090c' });
    // amber warning bar and bolts
    ctx.fillStyle = 'rgba(240,178,60,.9)';
    ctx.fillRect(cx - bw / 2 + 10, by - bh / 2 + 7, bw - 20, 3);
    Art.bolt(ctx, cx - bw / 2 + 10, by + bh / 2 - 9, 1.8);
    Art.bolt(ctx, cx + bw / 2 - 10, by + bh / 2 - 9, 1.8);
    ctx.textAlign = 'center';
    ctx.fillStyle = bn.color;
    ctx.font = font(clamp(R * 0.095, 20, 32), true);
    ctx.strokeStyle = 'rgba(3,7,9,.9)';
    ctx.lineWidth = 3.5;
    ctx.strokeText(bn.text, cx, by + 2);
    ctx.fillText(bn.text, cx, by + 2);
    if (bn.sub) {
      ctx.fillStyle = '#9db3ae';
      ctx.font = font(clamp(R * 0.05, 11, 14), true);
      ctx.fillText(bn.sub, cx, by + bh * 0.3);
    }
    ctx.restore();
  }

  function drawExtractionReady() {
    if (!run || !atStart() || anyOverlay()) return;
    const ga = angleOfCell(0) - Math.PI / CELLS;
    const sandHalf = pathSize * 0.62 + 7;
    const p = ringPoint(ga - 0.5, R + sandHalf + 30);
    const pulse = 0.5 + Math.sin(state.time * 3) * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.35 + pulse * 0.4;
    ctx.strokeStyle = '#f0b23c';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 22 + pulse * 6, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#a6cf5a';
    ctx.font = font(13, true);
    ctx.textAlign = 'left';
    ctx.fillText('可撤离 100%', p.x + 34, p.y + 4);
    ctx.restore();
  }

  function drawDragGhost() {
    const d = state.dragging;
    if (!d) return;
    const hover = nearestSlot(d.px, d.py);
    const size = hover && hover.slot !== 'path' ? sideSize : pathSize;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.translate(d.px, d.py);
    ctx.rotate(Math.sin(state.time * 4) * 0.05);
    Art.drawTileAt(ctx, d.typeId, d.kind, d.level, 0, 0, size, boil, hover ? hover.slot : 'path');
    ctx.restore();
  }

  function drawHurt() {
    if (!run || run.hurtFlash <= 0) return;
    const k = clamp(run.hurtFlash / 0.3, 0, 1);
    const pp = playerPos();
    const rr = clamp(R * 0.62, 90, 210);
    ctx.save();
    ctx.globalAlpha = k * k * 0.24;
    const grd = ctx.createRadialGradient(pp.x, pp.y, 0, pp.x, pp.y, rr);
    grd.addColorStop(0, 'rgba(239,106,91,.8)');
    grd.addColorStop(0.6, 'rgba(239,106,91,.2)');
    grd.addColorStop(1, 'rgba(239,106,91,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, rr, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* ---------------- demo (start screen) ---------------- */
  function makeDemoTiles() {
    return new Map([
      ['4:path', { typeId: 'barracks', kind: 'building', level: 1 }],
      ['4:side', { typeId: 'forest', kind: 'terrain', level: 1 }],
      ['9:path', { typeId: 'meadow', kind: 'terrain', level: 1 }],
      ['9:side', { typeId: 'shrine', kind: 'building', level: 2 }],
      ['15:path', { typeId: 'tower', kind: 'building', level: 1 }],
      ['15:side', { typeId: 'lake', kind: 'terrain', level: 2 }],
      ['21:path', { typeId: 'rock', kind: 'terrain', level: 1 }],
      ['21:side', { typeId: 'forge', kind: 'building', level: 1 }]
    ]);
  }
  const demoTiles = makeDemoTiles();

  function drawDemoScene() {
    for (const [key, tile] of demoTiles) {
      const slot = slotMap.get(key);
      if (!slot) continue;
      const size = (slot.slot === 'path' ? pathSize : sideSize) * 1.12;
      Art.drawTileAt(ctx, tile.typeId, tile.kind, tile.level, slot.x, slot.y, size, boil, slot.slot);
    }
    const pos = (2 + state.time * 0.55) % CELLS;
    const a = angleOfPos(pos);
    const p = ringPoint(a, playerR);
    Art.drawHero(ctx, p.x, p.y, 46, state.time, boil, { flip: -Math.sin(a) < 0 });
    for (let i = 0; i < 3; i++) {
      const orbit = 30 + i * 10;
      const ang = state.time * 0.8 + i * 2.2;
      Art.drawMinion(ctx, p.x + Math.cos(ang) * orbit, p.y - 8 + Math.sin(ang) * orbit * 0.55, 24,
        MINIONS[i === 0 ? 'archer' : i === 1 ? 'knight' : 'frost'], state.time, boil, { phase: i * 1.7 });
    }
    const ma = angleOfPos(((14 + Math.sin(state.time * 0.3) * 1.5) + CELLS) % CELLS);
    const mp = ringPoint(ma, playerR + 8);
    Art.drawMonster(ctx, mp.x, mp.y, 38, 'slime', state.time, boil, { phase: 0 });
    const mb = ringPoint(angleOfPos(pos + CELLS - 4), playerR);
    ctx.save(); ctx.globalAlpha = 0.7;
    Art.drawMonster(ctx, mb.x, mb.y, 30, 'bat', state.time, boil, { phase: 2 });
    ctx.restore();
  }

  /* ---------------- cover doodle ---------------- */
  function drawCover() {
    const cv = $('coverDoodle');
    if (!cv) return;
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    Art.initCtx(g);
    // loop
    g.save();
    g.setLineDash([7, 8]);
    g.strokeStyle = 'rgba(99,214,204,.32)';
    g.lineWidth = 2.2;
    g.beginPath();
    g.ellipse(350, 88, 292, 37, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    // tiles along loop
    const mini = [
      { x: 118, y: 52, t: 'barracks', k: 'building', lv: 1 },
      { x: 172, y: 44, t: 'forest', k: 'terrain', lv: 1 },
      { x: 520, y: 44, t: 'tower', k: 'building', lv: 1 },
      { x: 576, y: 52, t: 'lake', k: 'terrain', lv: 2 }
    ];
    for (const m of mini) Art.drawTileAt(g, m.t, m.k, m.lv, m.x, m.y, 44, 0, 'side');
    // link between sample pair
    g.save();
    g.strokeStyle = '#63d6cc';
    g.setLineDash([3, 4]);
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(118, 52); g.lineTo(172, 44); g.stroke();
    g.restore();
    // hero
    Art.drawHero(g, 355, 38, 42, 0, 0, { swing: 0.4 });
    Art.drawMinion(g, 306, 56, 24, MINIONS.archer, 0, 0, { phase: 1 });
    Art.drawMinion(g, 400, 54, 24, MINIONS.knight, 0, 0, { phase: 2 });
    Art.drawMinion(g, 268, 66, 22, MINIONS.frost, 0, 0, { phase: 3 });
    Art.drawMonster(g, 462, 60, 30, 'slime', 0, 0, { phase: 0 });
    Art.drawCoin(g, 432, 30, 6, 0, 0);
    // caption
    g.fillStyle = '#9db3ae';
    g.font = font(14, true);
    g.textAlign = 'center';
    g.fillText('设备 + 地形 → 无人机 / buff · 同名叠放升级', 350, 145);
  }

  /* ---------------- logo ---------------- */
  function drawLogo() {
    const cv = $('logoDoodle');
    if (!cv) return;
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    Art.initCtx(g);
    const pad = Art.circlePts(54, 54, 47, 47, 18);
    Art.wash(g, pad, '#081014', { alpha: 0.98, ox: 0, oy: 0 });
    Art.sketch(g, pad, { seed: 901, width: 2.4, closed: true, amp: 1.2, color: '#05090c' });
    Art.sketch(g, Art.circlePts(54, 54, 43, 43, 18), { seed: 903, width: 1, closed: true, color: 'rgba(99,214,204,.35)' });
    g.save();
    g.setLineDash([4, 5]);
    g.strokeStyle = 'rgba(99,214,204,.7)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.ellipse(54, 62, 34, 21, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    // hazard chevrons at the airlock
    hazardStrip(g, 54, 88, 26, 5, 0, 0.8);
    Art.light(g, 22, 62, 1.6, '#f0b23c');
    Art.drawHero(g, 58, 48, 50, 0, 0, { swing: 0.2 });
    Art.drawMonster(g, 88, 74, 22, 'slime', 0, 0, { phase: 1 });
    Art.drawSparkle(g, 86, 26, 8, 0, '#f0b23c');
    Art.drawSparkle(g, 18, 30, 6, 0, '#63d6cc');
    g.fillStyle = '#9db3ae';
    g.font = font(10, true);
    g.textAlign = 'center';
    g.fillText('LOOP COLONY', 54, 103);
  }

  function paintMiniIcons() {
    for (const cv of document.querySelectorAll('canvas[data-icon]')) {
      if (cv.dataset.painted) continue;
      const name = cv.dataset.icon;
      const css = cv.width;
      cv.dataset.painted = '1';
      const g = cv.getContext('2d');
      g.setTransform(css / 26, 0, 0, css / 26, 0, 0);
      g.clearRect(0, 0, 26, 26);
      Art.initCtx(g);
      Art.drawIcon(g, name, 13, 13, 22);
    }
  }

  /* ---------------- HUD & hand ---------------- */
  function updateHud() {
    if (!run) {
      $('hpText').textContent = '— / —';
      $('hpFill').style.width = '0%';
      $('lapBadge').textContent = '第 — 圈';
      $('killCount').textContent = '击倒 0';
      $('runGold').textContent = '0';
      $('metaGoldHud').textContent = fmt(meta.gold);
      return;
    }
    const hpPct = clamp(run.hp / run.maxHp, 0, 1);
    $('hpText').textContent = `${Math.max(0, Math.ceil(run.hp))} / ${Math.round(run.maxHp)}`;
    $('hpFill').style.width = (hpPct * 100).toFixed(1) + '%';
    $('hpFill').classList.toggle('low', hpPct < 0.35);
    $('lapBadge').textContent = `第 ${run.lap} 圈`;
    $('killCount').textContent = `击倒 ${run.kills}`;
    $('runGold').textContent = fmt(run.gold);
    $('metaGoldHud').textContent = fmt(meta.gold);
    $('handCount').textContent = run.cards.length;
    if ($('handLimit')) $('handLimit').textContent = run.cardLimit;
    const pct = atStart() ? 1 : run.stats.offKeep;
    $('extractPct').textContent = Math.round(pct * 100) + '%';
    $('extractBtn').classList.toggle('ready', atStart());
    $('extractHint').textContent = atStart()
      ? '就在起点 · 全额带走'
      : `离开起点撤离 · 保留 ${Math.round(run.stats.offKeep * 100)}%`;
    if (state.handDirty) renderHand();
  }

  function paintThumb(cv, cssSize, typeId, kind, level, slot) {
    cv.width = cssSize * 2;
    cv.height = cssSize * 2;
    cv.style.width = cssSize + 'px';
    cv.style.height = cssSize + 'px';
    const g = cv.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0);
    Art.drawTileAt(g, typeId, kind, level, cssSize / 2, cssSize / 2 + 1, cssSize * 0.74, 1, slot || 'path');
  }

  function renderHand() {
    const wrap = $('cards');
    if (!run || state.scene !== 'run') { wrap.innerHTML = ''; return; }
    state.handDirty = false;
    wrap.innerHTML = '';
    if (run.cards.length === 0) {
      const d = document.createElement('div');
      d.className = 'cards-empty';
      d.textContent = '手牌空了 · 击杀怪物、跑完一圈都会掉牌';
      wrap.appendChild(d);
      return;
    }
    run.cards.forEach((card, i) => {
      const el = document.createElement('div');
      el.className = 'card';
      el.style.setProperty('--rot', `${(i % 2 ? 1 : -1) * (0.6 + (i % 3) * 0.4)}deg`);
      if (i === state.selectedCard) el.classList.add('selected');
      if (i === state.popIndex) el.classList.add('pop');
      const cv = document.createElement('canvas');
      cv.className = 'card-thumb';
      paintThumb(cv, 56, card.typeId, card.kind, 1, 'path');
      const def = card.kind === 'terrain' ? TERRAINS[card.typeId] : BUILDINGS[card.typeId];
      const nm = document.createElement('span');
      nm.className = 'card-name';
      nm.textContent = def.name;
      const tag = document.createElement('span');
      tag.className = 'card-tag ' + card.kind;
      tag.textContent = card.kind === 'terrain' ? '地形' : '设备';
      const dot = document.createElement('span');
      dot.className = 'card-corner';
      dot.textContent = i + 1;
      el.appendChild(cv);
      el.appendChild(nm);
      el.appendChild(tag);
      el.appendChild(dot);
      bindCardPointer(el, i);
      wrap.appendChild(el);
    });
    state.popIndex = -1;
  }

  function updateHandClasses() {
    const els = $('cards').querySelectorAll('.card');
    els.forEach((el, i) => el.classList.toggle('selected', i === state.selectedCard));
  }

  function bindCardPointer(el, index) {
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (state.scene !== 'run' || !run || run.over) return;
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      let dragging = false;
      const move = ev => {
        if (dragging) return;
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 7) return;
        if (state.selectedCard >= 0) { state.selectedCard = -1; updateHandClasses(); }
        dragging = true;
        const card = run.cards[index];
        if (!card) return;
        el.classList.add('dragging');
        startPointerDrag({ source: 'card', index, typeId: card.typeId, kind: card.kind, level: 1, px: ev.clientX, py: ev.clientY });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        el.classList.remove('dragging');
        if (!dragging) toggleSelectCard(index);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      initAudio();
    });
  }

  function toggleSelectCard(index) {
    if (state.selectedCard === index) {
      state.selectedCard = -1;
    } else {
      state.selectedCard = index;
      toast('选好了 · 点地图上的格子放下', 'good');
    }
    updateHandClasses();
  }

  /* ---------------- canvas input ---------------- */
  function onCanvasDown(e) {
    if (state.scene !== 'run' || !run || run.over || anyOverlay()) return;
    const x = e.clientX, y = e.clientY;
    const slot = nearestSlot(x, y);
    if (state.selectedCard >= 0) {
      if (slot) { tryPlaceSelected(slot); }
      else toast('点圈上的格子才能放下', 'bad');
      return;
    }
    if (slot) {
      const tile = run.tiles.get(slot.key);
      if (tile) {
        initAudio();
        startPointerDrag({
          source: 'tile', key: slot.key, typeId: tile.typeId, kind: tile.kind, level: tile.level,
          px: x, py: y
        });
      }
    }
  }

  function onCanvasMove(e) {
    if (state.scene !== 'run' || !run || run.over || anyOverlay() || state.dragging) return;
    const x = e.clientX, y = e.clientY;
    state.mouse.x = x; state.mouse.y = y;
    const slot = nearestSlot(x, y);
    state.hover = slot;
    if (slot) {
      const tile = run.tiles.get(slot.key);
      if (tile) { setTooltip(tileTooltip(tile, slot), x, y); return; }
      if (state.selectedCard >= 0) {
        const c = run.cards[state.selectedCard];
        if (c) { setTooltip(dragTooltipHtml({ source: 'card', typeId: c.typeId, kind: c.kind, level: 1 }, slot), x, y); return; }
      }
    }
    hideTooltip();
  }

  /* ---------------- overlays & screens ---------------- */
  function requestExtract() {
    if (!run || run.over) return;
    if (atStart()) { finishRun('extract'); return; }
    askConfirm(`不在起点撤离，只能保住 ${Math.round(run.stats.offKeep * 100)}% 金币。`, '就这么走', () => finishRun('extract'));
  }

  function askConfirm(note, btnLabel, fn, title) {
    $('confirmNote').textContent = note;
    $('confirmYes').textContent = btnLabel;
    $('confirmOverlay').querySelector('h2').textContent = title || '现在要走？';
    state.confirmAction = fn;
    openOv('confirmOverlay', true);
  }

  function removeSave() {
    meta = DEFAULT_META();
    saveMeta();
    run = null;
    state.scene = 'start';
    state.speed = 1;
    state.selectedCard = -1;
    state.dragging = null;
    closeAllOv();
    openOv('startOverlay');
    updateVisibility();
    updateStartStats();
    updateHud();
    renderTree();
    toast('存档清空了 · 从第一圈重新开始', 'bad');
  }

  function openTree() {
    state.treeReturn = state.scene === 'start' ? 'start' : state.scene === 'end' ? 'end' : 'run';
    closeAllOv();
    if (state.scene !== 'start' && state.scene !== 'end') { /* run stays behind */ }
    openOv('treeOverlay');
    renderTree();
    requestAnimationFrame(() => {
      if (!ovStack.includes('treeOverlay')) return;
      const rect = $('treeStage').getBoundingClientRect();
      if (rect.width < 560) {
        // 窄屏塞不下整棵树，从树冠下部开始，往上拖着看
        const scale = 0.55;
        state.treeView = {
          x: rect.width / 2 - TREE_CENTER * scale,
          y: rect.height / 2 - (TREE_ROOT_Y - 520) * scale,
          scale,
          ready: true
        };
        applyTreeView();
      } else {
        fitTree();
      }
    });
  }
  function closeTree() {
    closeOv('treeOverlay');
    if (state.treeReturn === 'start') openOv('startOverlay');
    else if (state.treeReturn === 'end') openOv('endOverlay');
    else { /* run resumes; nothing to open */ }
  }
  function openCodex() {
    state.codexReturn = state.scene === 'start' ? 'start' : state.scene === 'end' ? 'end' : 'run';
    closeAllOv();
    openOv('codexOverlay');
  }
  function closeCodex() {
    closeOv('codexOverlay');
    if (state.codexReturn === 'start') openOv('startOverlay');
    else if (state.codexReturn === 'end') openOv('endOverlay');
  }

  function updateStartStats() {
    $('startMetaGold').textContent = fmt(meta.gold);
    $('startBestLap').textContent = meta.bestLap;
    $('startTotalGold').textContent = fmt(meta.totalGold);
  }

  /* ---------------- tree UI ---------------- */
  const TREE_WORLD_SIZE = 3400, TREE_CENTER = TREE_WORLD_SIZE / 2;
  const TREE_ROOT_Y = TREE_CENTER + 430;
  const TREE_BASE_R = 220, TREE_RING_R = 150;
  const TREE_FAN_SPAN = Math.PI * 200 / 180;
  let treeLayoutReady = false;
  let treeDrag = null;
  const treeBranchCounts = {};
  const treeMapLabels = [];

  function buildSkillLayout() {
    if (treeLayoutReady) return;
    const children = new Map();
    for (const node of SKILL_NODES) {
      if (!node.parent) continue;
      if (!children.has(node.parent)) children.set(node.parent, []);
      children.get(node.parent).push(node);
      if (node.branch) treeBranchCounts[node.branch] = (treeBranchCounts[node.branch] || 0) + 1;
    }
    const root = NODES.core;
    const branchRoots = children.get('core') || [];

    // 先按 DFS 顺序编号，同一环上的节点就沿着枝条顺序排开
    const sizeMemo = new Map();
    function subtreeSize(node) {
      if (sizeMemo.has(node.id)) return sizeMemo.get(node.id);
      let n = 1;
      for (const kid of children.get(node.id) || []) n += subtreeSize(kid);
      sizeMemo.set(node.id, n);
      return n;
    }
    let seq = 0;
    const branchNodes = new Map();
    function walk(node) {
      node.order = seq++;
      if (node.branch) {
        if (!branchNodes.has(node.branch)) branchNodes.set(node.branch, []);
        branchNodes.get(node.branch).push(node);
      }
      for (const kid of children.get(node.id) || []) walk(kid);
    }
    walk(root);

    // 树根落在下方，五条主枝向上铺开一个扇面，看起来是从一个点长出来的树冠
    const totalSize = branchRoots.reduce((sum, n) => sum + subtreeSize(n), 0);
    const sectorGap = 0.09;
    const usable = TREE_FAN_SPAN - sectorGap * (branchRoots.length - 1);
    let start = -Math.PI / 2 - TREE_FAN_SPAN / 2;
    for (const branch of branchRoots) {
      const span = usable * subtreeSize(branch) / totalSize;
      branch.sector = [start, start + span];
      start += span + sectorGap;
    }

    // 每一环在自己的扇区里均匀铺开：主干从核心分叉，越往外节点越多
    const place = (node, angle) => {
      const radius = TREE_BASE_R + (node.depth - 1) * TREE_RING_R;
      node.angle = angle;
      node.x = TREE_CENTER + Math.cos(angle) * radius;
      node.y = TREE_ROOT_Y + Math.sin(angle) * radius;
    };
    root.x = TREE_CENTER; root.y = TREE_ROOT_Y; root.angle = -Math.PI / 2; root.depth = 0;
    root.size = 68;
    const labelRadius = TREE_BASE_R + TREE_RING_R * 1.55;
    for (const branch of branchRoots) {
      const [s0, s1] = branch.sector;
      const labelAngle = (s0 + s1) / 2;
      treeMapLabels.push({
        name: branch.branchName,
        tint: branch.tint,
        x: TREE_CENTER + Math.cos(labelAngle) * labelRadius,
        y: TREE_ROOT_Y + Math.sin(labelAngle) * labelRadius
      });
      const nodes = (branchNodes.get(branch.branch) || []).slice().sort((a, b) => a.order - b.order);
      const rings = new Map();
      for (const node of nodes) {
        node.size = node.kind === 'major' ? 46 : 27;
        if (!rings.has(node.depth)) rings.set(node.depth, []);
        rings.get(node.depth).push(node);
      }
      for (const [depth, ring] of rings) {
        const span = s1 - s0;
        let totalW = 0;
        for (const node of ring) totalW += node.size + 16;
        let cursor = 0;
        for (const node of ring) {
          const w = node.size + 16;
          place(node, s0 + span * (cursor + w / 2) / totalW);
          cursor += w;
        }
      }
    }
    treeLayoutReady = true;
  }

  function applyTreeView() {
    const stage = $('treeStage'), world = $('treeWorld');
    if (!stage || !world) return;
    const view = state.treeView;
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    stage.style.setProperty('--tree-inv', (1 / view.scale).toFixed(3));
    stage.classList.toggle('zoom-far', view.scale < 0.42);
    stage.classList.toggle('zoom-mid', view.scale >= 0.42 && view.scale < 0.8);
    stage.classList.toggle('zoom-near', view.scale >= 0.8);
  }

  function fitTree() {
    buildSkillLayout();
    const stage = $('treeStage');
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of SKILL_NODES) {
      const half = node.size / 2;
      minX = Math.min(minX, node.x - half);
      minY = Math.min(minY, node.y - half);
      maxX = Math.max(maxX, node.x + half);
      maxY = Math.max(maxY, node.y + half);
    }
    const pad = 42;
    const scale = clamp(Math.min((rect.width - pad * 2) / (maxX - minX), (rect.height - pad * 2) / (maxY - minY)), 0.16, 1.4);
    state.treeView = {
      x: (rect.width - (minX + maxX) * scale) / 2,
      y: (rect.height - (minY + maxY) * scale) / 2,
      scale,
      ready: true
    };
    applyTreeView();
  }

  function zoomTree(factor, mx, my) {
    const stage = $('treeStage');
    const rect = stage.getBoundingClientRect();
    if (!rect.width) return;
    const view = state.treeView;
    const px = mx === undefined ? rect.width / 2 : mx;
    const py = my === undefined ? rect.height / 2 : my;
    const wx = (px - view.x) / view.scale;
    const wy = (py - view.y) / view.scale;
    const scale = clamp(view.scale * factor, 0.16, 2.5);
    state.treeView = { x: px - wx * scale, y: py - wy * scale, scale, ready: true };
    applyTreeView();
  }

  function focusTreeCore(wanted) {
    const rect = $('treeStage').getBoundingClientRect();
    if (!rect.width) return;
    const scale = clamp(wanted || Math.max(state.treeView.scale, 0.9), 0.16, 1.6);
    state.treeView = {
      x: rect.width / 2 - TREE_CENTER * scale,
      y: rect.height / 2 - TREE_ROOT_Y * scale,
      scale,
      ready: true
    };
    applyTreeView();
  }

  function applyTreeNodeStates() {
    const wrap = $('treeNodes');
    if (!wrap) return;
    for (const btn of wrap.children) {
      const node = NODES[btn.dataset.id];
      if (!node) continue;
      const level = meta.nodes[node.id] || 0;
      const parent = node.parent ? NODES[node.parent] : null;
      const locked = !!(parent && level === 0 && !(meta.nodes[parent.id] || 0));
      btn.classList.toggle('owned', level > 0);
      btn.classList.toggle('maxed', level >= node.max);
      btn.classList.toggle('locked', locked);
      btn.classList.toggle('selected', node.id === state.treeSelected);
      btn.classList.toggle('affordable', !locked && level < node.max && meta.gold >= nodeCost(node, level));
    }
  }

  function treeLegend() {
    return `<div class="tp-legend">${SKILL_BRANCHES.map(branch =>
      `<span style="--bc:${branch.tint}"><i></i>${branch.name}<b>${treeBranchCounts[branch.id] || 0}</b></span>`
    ).join('')}</div>`;
  }

  function renderTreePanel() {
    const panel = $('treePanel');
    if (!panel) return;
    const node = NODES[state.treeSelected] || NODES.core;
    const level = meta.nodes[node.id] || 0;
    const parent = node.parent ? NODES[node.parent] : null;
    const locked = !!(parent && level === 0 && !(meta.nodes[parent.id] || 0));
    const maxed = level >= node.max;
    const cost = nodeCost(node, level);
    const effect = nodeEffectText(node, level);
    const next = level < node.max ? nodeEffectText(node, level + 1) : null;
    const afford = meta.gold >= cost;
    let label = '', disabled = false;
    if (node.id === 'core') { label = '起点已接通'; disabled = true; }
    else if (maxed) { label = '已经点满'; disabled = true; }
    else if (locked) { label = `先点亮「${parent.name}」`; disabled = true; }
    else if (!afford) { label = `${fmt(cost)} 金币 · 还差 ${fmt(cost - meta.gold)}`; disabled = true; }
    else { label = `点亮 · ${fmt(cost)} 金币`; disabled = false; }
    panel.innerHTML = `
      <div class="tp-top" style="--bc:${node.tint}">
        <span class="tp-branch">${node.branchName}</span>
        <span class="tp-code">${node.code || 'CORE'}</span>
      </div>
      <h3 class="tp-name">${node.name}</h3>
      <div class="tp-lv">Lv ${level} / ${node.max}${maxed ? ' · 已点满' : ''}</div>
      <p class="tp-desc">${node.desc}</p>
      <div class="tp-now">当前：${level ? effect.total : '未点亮'}</div>
      ${next ? `<div class="tp-next">下一级：${next.total}</div>` : ''}
      <div class="tp-prereq">${parent ? `前置：${parent.name}` : '所有分支从这里出发'}</div>
      ${node.id !== 'core' && !maxed ? `<div class="tp-cost">价格：${fmt(cost)} 金币</div>` : ''}
      <div class="tp-buy-wrap"><button class="btn small tp-buy" data-buy="${node.id}" ${disabled ? 'disabled' : ''}>${label}</button></div>
      ${node.id === 'core' ? treeLegend() : ''}
    `;
  }

  function selectTreeNode(id) {
    if (!NODES[id]) return;
    state.treeSelected = id;
    applyTreeNodeStates();
    renderTreePanel();
    // 全览状态下点节点 = 钻进这条枝，避免在 5px 的小点上硬点
    if (state.treeView.scale < 0.42) {
      const rect = $('treeStage').getBoundingClientRect();
      const node = NODES[id];
      const scale = 0.9;
      state.treeView = {
        x: rect.width / 2 - node.x * scale,
        y: rect.height / 2 - node.y * scale,
        scale,
        ready: true
      };
      applyTreeView();
    }
  }

  function treeBranchPath(parent, child) {
    const rp = Math.hypot(parent.x - TREE_CENTER, parent.y - TREE_ROOT_Y);
    const rc = Math.hypot(child.x - TREE_CENTER, child.y - TREE_ROOT_Y);
    let am = child.angle;
    if (rp > 1) {
      let diff = child.angle - parent.angle;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      am = parent.angle + diff * 0.5;
    }
    const rm = rp > 1 ? (rp + rc) / 2 * 0.97 : rc * 0.55;
    const cx = TREE_CENTER + Math.cos(am) * rm;
    const cy = TREE_ROOT_Y + Math.sin(am) * rm;
    return `M ${parent.x.toFixed(1)} ${parent.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${child.x.toFixed(1)} ${child.y.toFixed(1)}`;
  }

  function renderTree() {
    buildSkillLayout();
    const wrap = $('treeNodes'), svg = $('treeLinks');
    wrap.innerHTML = '';
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${TREE_WORLD_SIZE} ${TREE_WORLD_SIZE}`);
    for (const node of SKILL_NODES) {
      if (!node.parent) continue;
      const parent = NODES[node.parent];
      if (!parent) continue;
      const level = meta.nodes[node.id] || 0;
      const parentLevel = meta.nodes[parent.id] || 0;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', treeBranchPath(parent, node));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', node.tint);
      path.setAttribute('stroke-width', parent.id === 'core' ? '3' : node.kind === 'minor' ? '1.1' : '1.9');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.setAttribute('opacity', level > 0 ? '0.9' : parentLevel > 0 ? '0.55' : '0.3');
      svg.appendChild(path);
    }
    for (const node of SKILL_NODES) {
      const level = meta.nodes[node.id] || 0;
      const parent = node.parent ? NODES[node.parent] : null;
      const locked = !!(parent && level === 0 && !(meta.nodes[parent.id] || 0));
      const maxed = level >= node.max;
      const cost = nodeCost(node, level);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tnode ' + node.kind;
      btn.dataset.id = node.id;
      btn.style.left = node.x + 'px';
      btn.style.top = node.y + 'px';
      btn.style.width = node.size + 'px';
      btn.style.height = node.size + 'px';
      btn.style.setProperty('--bc', node.tint);
      btn.title = `${node.name} · Lv ${level}/${node.max}${maxed ? '' : ' · ' + fmt(cost) + ' 金币'}`;
      btn.innerHTML = `
        <span class="tnode-glyph">${node.glyph}</span>
        ${node.kind === 'minor' ? '' : `<span class="tnode-label">${node.name}</span>`}
        ${level > 0 && node.max > 1 ? `<span class="tnode-lv">${level}</span>` : ''}`;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        selectTreeNode(node.id);
      });
      wrap.appendChild(btn);
    }
    for (const label of treeMapLabels) {
      const el = document.createElement('div');
      el.className = 'tree-map-label';
      el.style.left = label.x + 'px';
      el.style.top = label.y + 'px';
      el.style.setProperty('--bc', label.tint);
      el.textContent = label.name;
      wrap.appendChild(el);
    }
    const coreLabel = document.createElement('div');
    coreLabel.className = 'tree-map-label core';
    coreLabel.style.left = NODES.core.x + 'px';
    coreLabel.style.top = (NODES.core.y + 68) + 'px';
    coreLabel.textContent = '殖民地核心';
    wrap.appendChild(coreLabel);
    $('treeGold').textContent = fmt(meta.gold);
    if (!NODES[state.treeSelected]) state.treeSelected = 'core';
    applyTreeNodeStates();
    applyTreeView();
    renderTreePanel();
  }

  function buyNode(id) {
    const node = NODES[id];
    if (!node || node.id === 'core') return;
    const level = meta.nodes[id] || 0;
    if (level >= node.max) return;
    const parent = node.parent ? NODES[node.parent] : null;
    if (parent && level === 0 && !(meta.nodes[parent.id] || 0)) {
      toast(`先点亮「${parent.name}」`, 'bad'); return;
    }
    const cost = nodeCost(node, level);
    if (meta.gold < cost) { toast('金币不够 · 再回圈上跑跑', 'bad'); return; }
    meta.gold -= cost;
    meta.nodes[id] = level + 1;
    saveMeta();
    if (run && state.scene === 'run' && !run.over) {
      const oldMax = run.stats.maxHp;
      run.stats = computeStats();
      const gain = run.stats.maxHp - oldMax;
      run.maxHp = run.stats.maxHp;
      run.hp = Math.min(run.maxHp, run.hp + Math.max(0, gain));
      run.cardLimit = run.stats.cardLimit;
      run.maxMinions = MINION_CAP_BASE + run.stats.minionCap;
      state.speed = run.stats.speed;
    } else {
      state.speed = computeStats().speed;
    }
    state.treeSelected = id;
    sfx('upgrade');
    renderTree();
    updateStartStats();
    updateHud();
    toast(`点亮 ${node.name} · Lv ${level + 1}`, 'good');
  }

  function onTreePointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('.tnode, .tree-controls, .tree-stage-hint')) return;
    const stage = $('treeStage');
    treeDrag = {
      id: e.pointerId,
      sx: e.clientX, sy: e.clientY,
      ox: state.treeView.x, oy: state.treeView.y
    };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('dragging');
    e.preventDefault();
  }
  function onTreePointerMove(e) {
    if (!treeDrag || treeDrag.id !== e.pointerId) return;
    state.treeView.x = treeDrag.ox + (e.clientX - treeDrag.sx);
    state.treeView.y = treeDrag.oy + (e.clientY - treeDrag.sy);
    applyTreeView();
  }
  function endTreeDrag(e) {
    if (!treeDrag) return;
    treeDrag = null;
    $('treeStage').classList.remove('dragging');
  }

  /* ---------------- codex UI ---------------- */
  function renderCodex() {
    const grid = $('codexGrid');
    grid.innerHTML = '';
    for (const bId of Object.keys(COMBOS)) {
      for (const tId of Object.keys(COMBOS[bId])) {
        const recipe = COMBOS[bId][tId];
        const card = document.createElement('div');
        card.className = 'codex-card';
        const pair = document.createElement('div');
        pair.className = 'codex-pair';
        const c1 = document.createElement('canvas');
        const c2 = document.createElement('canvas');
        paintThumb(c1, 40, bId, 'building', 1, 'side');
        paintThumb(c2, 40, tId, 'terrain', 1, 'path');
        const plus = document.createElement('span');
        plus.className = 'codex-plus';
        plus.textContent = '+';
        pair.appendChild(c1); pair.appendChild(plus); pair.appendChild(c2);
        const arrow = document.createElement('div');
        arrow.className = 'codex-arrow';
        arrow.textContent = '↓';
        const res = document.createElement('div');
        res.className = 'codex-result' + (recipe.type === 'buff' ? ' buff' : '');
        const icon = document.createElement('canvas');
        paintResultThumb(icon, recipe);
        const label = document.createElement('span');
        label.innerHTML = `<b>${comboName(recipe)}</b> ${recipe.type === 'minion' ? '无人机' : 'buff'}`;
        res.appendChild(icon); res.appendChild(label);
        card.appendChild(pair); card.appendChild(arrow); card.appendChild(res);
        grid.appendChild(card);
      }
    }
    const tripleWrap = $('codexTriple');
    tripleWrap.innerHTML = '';
    for (const [key, recipe] of Object.entries(TRIPLE_COMBOS)) {
      const [bPart, tPart] = key.split('|');
      const bIds = bPart.split('+');
      const tIds = tPart.split('+');
      const seq = bIds.length === 2
        ? [{ id: bIds[0], kind: 'building' }, { id: tIds[0], kind: 'terrain' }, { id: bIds[1], kind: 'building' }]
        : [{ id: tIds[0], kind: 'terrain' }, { id: bIds[0], kind: 'building' }, { id: tIds[1], kind: 'terrain' }];
      const card = document.createElement('div');
      card.className = 'triple-card';
      const thumbs = document.createElement('div');
      thumbs.className = 'tc-thumbs';
      seq.forEach((part, i) => {
        if (i) {
          const plus = document.createElement('span');
          plus.className = 'tc-plus';
          plus.textContent = '+';
          thumbs.appendChild(plus);
        }
        const cv = document.createElement('canvas');
        paintThumb(cv, 32, part.id, part.kind, 1, part.kind === 'terrain' ? 'path' : 'side');
        thumbs.appendChild(cv);
      });
      const res = document.createElement('div');
      res.className = 'tc-res' + (recipe.type === 'buff' ? ' buff' : '');
      const icon = document.createElement('canvas');
      paintResultThumb(icon, recipe);
      const label = document.createElement('span');
      label.innerHTML = `<b>${comboName(recipe)}</b>`;
      res.appendChild(icon); res.appendChild(label);
      card.appendChild(thumbs); card.appendChild(res);
      tripleWrap.appendChild(card);
    }
    const foot = $('codexFoot');
    const walks = Object.keys(TERRAINS).map(id => {
      const t = TERRAINS[id];
      return `<span class="walk"><canvas data-wt="${id}" width="52" height="52"></canvas>${t.name}：${t.walkText}</span>`;
    }).join('');
    foot.innerHTML = `<div>${walks}</div>
      <div>每个格子分里侧、中间跑道、外侧：地形放中间，角色踩过会吃 buff；两侧放设备可以各自与中间地形联动。</div>
      <div>三件套：中间 + 两侧凑齐配方，会触发特殊联动并替换掉普通的一对联动。同名叠放升级依然生效。</div>`;
    for (const id of Object.keys(TERRAINS)) {
      const cv = foot.querySelector(`canvas[data-wt="${id}"]`);
      if (cv) paintThumb(cv, 26, id, 'terrain', 1, 'side');
    }
  }

  function paintResultThumb(cv, recipe) {
    cv.width = 44; cv.height = 44;
    cv.style.width = '22px'; cv.style.height = '22px';
    const g = cv.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0);
    if (recipe.type === 'minion') {
      Art.drawMinion(g, 11, 17, 22, MINIONS[recipe.id], 0, 0, { phase: 0 });
    } else {
      const def = BUFFDEFS[recipe.buff];
      Art.drawIcon(g, def.icon, 11, 11, 18, { color: def.color });
    }
  }

  /* ---------------- toasts & audio ---------------- */
  function toast(html, kind) {
    const stack = $('toastStack');
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.innerHTML = html;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 1950);
  }

  let audioCtx = null;
  function initAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }
  function tone(freq, when, dur, gain, type) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain || 0.05, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(when); o.stop(when + dur + 0.02);
  }
  const sfxLast = {};
  function sfx(name) {
    if (!meta.sound) return;
    initAudio();
    if (!audioCtx) return;
    const realNow = Date.now();
    const throttle = { kill: 130, hurt: 180, buff: 160, coin: 100, card: 150 }[name];
    if (throttle && sfxLast[name] && realNow - sfxLast[name] < throttle) return;
    sfxLast[name] = realNow;
    const now = audioCtx.currentTime + 0.02;
    switch (name) {
      case 'click': tone(520, now, 0.05, 0.03); break;
      case 'start': tone(440, now, 0.08, 0.05); tone(660, now + 0.08, 0.1, 0.05); break;
      case 'place': tone(620, now, 0.06, 0.04); tone(880, now + 0.05, 0.08, 0.035, 'sine'); break;
      case 'upgrade': tone(520, now, 0.09, 0.05); tone(780, now + 0.09, 0.12, 0.05, 'sine'); break;
      case 'card': tone(700, now, 0.05, 0.035, 'sine'); tone(940, now + 0.06, 0.07, 0.035, 'sine'); break;
      case 'coin': tone(980, now, 0.05, 0.04, 'sine'); tone(1320, now + 0.05, 0.08, 0.03, 'sine'); break;
      case 'kill': tone(300, now, 0.06, 0.03); tone(180, now + 0.05, 0.08, 0.025); break;
      case 'hurt': tone(160, now, 0.09, 0.05, 'square'); break;
      case 'buff': tone(520, now, 0.07, 0.03); tone(680, now + 0.07, 0.08, 0.03, 'sine'); break;
      case 'lap': tone(560, now, 0.09, 0.04); tone(760, now + 0.1, 0.12, 0.04); tone(960, now + 0.21, 0.1, 0.03, 'sine'); break;
      case 'win': tone(523, now, 0.1, 0.05, 'sine'); tone(659, now + 0.12, 0.12, 0.05, 'sine'); tone(784, now + 0.26, 0.18, 0.045, 'sine'); break;
      case 'lose': tone(392, now, 0.1, 0.05, 'sine'); tone(294, now + 0.12, 0.14, 0.045, 'sine'); tone(196, now + 0.28, 0.2, 0.04, 'sine'); break;
    }
  }

  /* ---------------- wiring ---------------- */
  function bindUi() {
    $('startBtn').addEventListener('click', () => { initAudio(); startRun(); sfx('click'); });
    $('openTreeFromStart').addEventListener('click', openTree);
    $('openCodexFromStart').addEventListener('click', openCodex);
    $('btnTree').addEventListener('click', openTree);
    $('btnCodex').addEventListener('click', openCodex);

    const treeStage = $('treeStage');
    treeStage.addEventListener('pointerdown', onTreePointerDown);
    window.addEventListener('pointermove', onTreePointerMove);
    window.addEventListener('pointerup', endTreeDrag);
    window.addEventListener('pointercancel', endTreeDrag);
    treeStage.addEventListener('wheel', e => {
      e.preventDefault();
      const r = treeStage.getBoundingClientRect();
      zoomTree(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    treeStage.addEventListener('click', e => {
      const btn = e.target.closest('[data-zoom]');
      if (!btn) return;
      const action = btn.dataset.zoom;
      if (action === 'in') zoomTree(1.25);
      else if (action === 'out') zoomTree(0.8);
      else if (action === 'fit') fitTree();
      else if (action === 'core') focusTreeCore();
    });
    $('treePanel').addEventListener('click', e => {
      const btn = e.target.closest('[data-buy]');
      if (btn && !btn.disabled) buyNode(btn.dataset.buy);
    });
    $('btnPause').addEventListener('click', () => {
      if (!run || run.over || anyOverlay()) return;
      $('pauseNote').textContent = atStart() ? '就在起点，走的话能带走全部金币' : `离开起点，走了只能留 ${Math.round(run.stats.offKeep * 100)}%`;
      $('pauseExtractBtn').textContent = atStart() ? '撤离 · 100%' : `撤离 · ${Math.round(run.stats.offKeep * 100)}%`;
      openOv('pauseOverlay');
      sfx('click');
    });
    $('btnSound').addEventListener('click', () => {
      meta.sound = !meta.sound;
      saveMeta();
      $('soundLabel').textContent = meta.sound ? '♪' : '×';
      if (meta.sound) { initAudio(); sfx('click'); }
      toast(meta.sound ? '音效打开了' : '音效关掉了');
    });
    $('extractBtn').addEventListener('click', requestExtract);
    $('resumeBtn').addEventListener('click', () => closeOv('pauseOverlay'));
    $('pauseTreeBtn').addEventListener('click', openTree);
    $('pauseExtractBtn').addEventListener('click', requestExtract);
    $('abandonBtn').addEventListener('click', () => askConfirm('放弃本轮会把本轮金币清零，确定吗？', '放弃', () => finishRun('abandon'), '确定放弃？'));
    $('continueBtn').addEventListener('click', () => {
      closeOv('lapOverlay');
      if (!run) return;
      if (run.pendingBoss) {
        if (run.pendingBoss === 'mega') {
          spawnMonster('mega', run.pos + 6, { force: true });
          toast('深核暴君降临 · 大boss出现了！', 'bad');
          showBanner('深核暴君降临', `第 ${run.lap} 圈 · 大boss`, '#f0b23c');
        } else {
          spawnMonster('boss', run.pos + 4, { force: true });
          toast('污染巨兽挡在前面了！', 'bad');
          showBanner('污染巨兽出现', `第 ${run.lap} 圈`, '#ef6a5b');
        }
        run.pendingBoss = null;
      }
      updateHud();
      sfx('click');
    });
    $('extractAtStartBtn').addEventListener('click', () => finishRun('extract'));
    $('closeTree').addEventListener('click', closeTree);
    $('closeCodex').addEventListener('click', closeCodex);
    $('resetSave').addEventListener('click', () => {
      askConfirm('清空存档会丢掉所有金币和技能，没办法恢复。', '清空存档', removeSave, '清空存档？');
    });
    $('againBtn').addEventListener('click', () => { closeAllOv(); state.scene = 'run'; startRun(); });
    $('endTreeBtn').addEventListener('click', openTree);
    $('confirmNo').addEventListener('click', () => closeOv('confirmOverlay'));
    $('confirmYes').addEventListener('click', () => {
      const fn = state.confirmAction;
      state.confirmAction = null;
      closeOv('confirmOverlay');
      if (fn) fn();
    });

    canvas.addEventListener('pointerdown', onCanvasDown);
    canvas.addEventListener('pointermove', onCanvasMove);
    canvas.addEventListener('pointerleave', () => { if (!state.dragging) hideTooltip(); });

    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      if (e.key === ' ' || e.code === 'Space') {
        if (state.scene !== 'run' || !run || run.over) return;
        e.preventDefault();
        if (ovStack.includes('pauseOverlay')) closeOv('pauseOverlay');
        else if (!anyOverlay()) {
          $('pauseNote').textContent = '舱段时间暂停了';
          openOv('pauseOverlay');
        }
      } else if (e.key === 'e' || e.key === 'E') {
        if (state.scene === 'run' && !anyOverlay()) requestExtract();
      }
    });

    window.addEventListener('resize', () => {
      clearTimeout(window._rz);
      window._rz = setTimeout(() => {
        resize();
      }, 160);
    });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    state.speed = 1 + 0.25 * (meta.nodes.overclock || 0);
    resize();
    bindUi();
    updateVisibility();
    updateStartStats();
    updateHud();
    renderTree();
    renderCodex();
    drawCover();
    drawLogo();
    paintMiniIcons();
    $('soundLabel').textContent = meta.sound ? '♪' : '×';
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        drawCover();
        drawLogo();
        paintMiniIcons();
        buildBackground();
        renderHand();
      }).catch(() => {});
    }
    let last = 0;
    function loop(ts) {
      if (!last) last = ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      state.time += dt;
      if (isPlaying()) {
        updateRun(dt * state.speed);
      }
      render();
      state.hudTimer -= dt;
      if (state.hudTimer <= 0) {
        updateHud();
        state.hudTimer = 0.1;
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  boot();
})();
