'use strict';

/* ============================================================
   Art — inked colony rendering helpers + sprite cache
   Visual language: thick outer contour, thin interior detail,
   lumpy faceted geometry, flat functional color coding.
   ============================================================ */

const Art = (() => {
  const INK = '#080d10';
  const INK_SOFT = '#24343a';
  const PAPER = '#121c21';
  const PAPER_DEEP = '#1b2a30';
  const TEXT = '#dce9e4';
  const MUTED = '#9db3ae';
  const METAL = '#3a4e54';
  const METAL_HI = '#5d767a';
  const CYAN = '#63d6cc';
  const CYAN_DEEP = '#2a8f8a';
  const AMBER = '#f0b23c';
  const AMBER_DEEP = '#a97718';
  const RUST = '#df6b3f';
  const RUST_DEEP = '#8f3f26';
  const BIO = '#a8cf5a';
  const BIO_DEEP = '#5f8a35';
  const VIOLET = '#9a83d4';
  const ALERT = '#ef6a5b';
  const SPRITE_SCALE = 2.2;

  /* ---------- deterministic jitter ---------- */
  function rand(seed) {
    let t = (seed >>> 0) + 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const jit = (seed, i) => (rand((seed >>> 0) + i * 977 + 13) - 0.5) * 2;

  /* ---------- low level ---------- */
  function initCtx(g) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.miterLimit = 3;
  }

  function pathFrom(g, pts, closed) {
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) g.moveTo(pts[i][0], pts[i][1]);
      else g.lineTo(pts[i][0], pts[i][1]);
    }
    if (closed) g.closePath();
  }

  /* One confident line. Slight handmade unevenness, no sketch scribble. */
  function sketch(g, pts, o = {}) {
    const {
      seed = 1, boil = 0, amp = 0.65, width = 2.2, color = INK,
      passes = 1, closed = false, alpha = 1, dash = null
    } = o;
    g.save();
    g.globalAlpha = alpha;
    if (dash) g.setLineDash(dash);
    for (let p = 0; p < passes; p++) {
      const s = seed + boil * 271 + p * 911;
      g.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const wob = 1 - p * 0.28;
        const x = pts[i][0] + jit(s, i * 3) * amp * wob;
        const y = pts[i][1] + jit(s, i * 3 + 1) * amp * wob;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      if (closed) g.closePath();
      g.lineWidth = width * (p === 1 ? 0.58 : 1);
      g.strokeStyle = color;
      g.stroke();
    }
    g.restore();
  }

  /* Flat fill with a small hard offset — printed/kit-bashed, never blurred. */
  function wash(g, pts, color, o = {}) {
    const { ox = 1.4, oy = 2.2, alpha = 0.92, closed = true } = o;
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.translate(ox, oy);
    pathFrom(g, pts, closed);
    g.fill();
    g.restore();
  }

  function line(g, x1, y1, x2, y2, o = {}) {
    sketch(g, [[x1, y1], [x2, y2]], Object.assign({ amp: 0.5 }, o));
  }

  function poly(g, pts, o = {}) {
    sketch(g, pts, Object.assign({ amp: 0.6 }, o));
  }

  function circlePts(cx, cy, rx, ry, n = 14, phase = 0) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return pts;
  }

  function ellipse(g, cx, cy, rx, ry, o = {}) {
    const { fill = null, seed = 3, boil = 0, width = 2, color = INK, amp = 0.75, n = 14 } = o;
    if (fill) wash(g, circlePts(cx, cy, rx, ry, n), fill, { ox: 1, oy: 1.6, alpha: o.fillAlpha ?? 0.95 });
    sketch(g, circlePts(cx, cy, rx, ry, n), { seed, boil, width, color, amp, closed: true });
  }

  function roundRectPts(cx, cy, w, h, r, seg = 2) {
    const x = cx - w / 2, y = cy - h / 2, pts = [];
    const corner = (ox, oy, a0) => {
      for (let i = 0; i <= seg; i++) {
        const a = a0 + (i / seg) * Math.PI / 2;
        pts.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]);
      }
    };
    corner(x + w - r, y + r, -Math.PI / 2);
    corner(x + w - r, y + h - r, 0);
    corner(x + r, y + h - r, Math.PI / 2);
    corner(x + r, y + r, Math.PI);
    return pts;
  }

  function roundRect(g, cx, cy, w, h, r, o = {}) {
    const pts = roundRectPts(cx, cy, w, h, r);
    if (o.fill) wash(g, pts, o.fill, { ox: o.ox ?? 1.2, oy: o.oy ?? 2, alpha: o.fillAlpha ?? 0.95 });
    sketch(g, pts, Object.assign({ amp: 0.55, closed: true, width: 2.1 }, o));
  }

  function heartPts(cx, cy, s) {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      pts.push([cx + x * s / 16, cy + y * s / 16]);
    }
    return pts;
  }

  /* ---------- industrial doodads ---------- */
  function bolt(g, x, y, r = 1.7) {
    g.save();
    g.fillStyle = METAL_HI;
    g.strokeStyle = INK;
    g.lineWidth = 1.1;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.strokeStyle = INK_SOFT;
    g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(x - r * 0.55, y); g.lineTo(x + r * 0.55, y); g.stroke();
    g.restore();
  }

  function rivets(g, pts, inset = 4) {
    if (pts.length < 3) return;
    for (const p of pts) bolt(g, p[0] + inset, p[1] + inset, 1.5);
  }

  function caution(g, x, y, w, h, alpha = 0.9) {
    g.save();
    g.beginPath(); g.rect(x - w / 2, y - h / 2, w, h); g.clip();
    g.fillStyle = '#121a1e'; g.fillRect(x - w / 2, y - h / 2, w, h);
    g.fillStyle = AMBER;
    g.globalAlpha = alpha;
    for (let i = -h; i < w + h; i += 8) {
      g.beginPath();
      g.moveTo(x - w / 2 + i, y + h / 2);
      g.lineTo(x - w / 2 + i + 4, y + h / 2);
      g.lineTo(x - w / 2 + i + 4 + h, y - h / 2);
      g.lineTo(x - w / 2 + i + h, y - h / 2);
      g.closePath(); g.fill();
    }
    g.restore();
    g.save();
    g.strokeStyle = INK; g.lineWidth = 1.2;
    g.strokeRect(x - w / 2, y - h / 2, w, h);
    g.restore();
  }

  function vent(g, x, y, w, h, n = 4) {
    g.save();
    g.fillStyle = '#10181c';
    g.strokeStyle = INK;
    g.lineWidth = 1.1;
    g.beginPath(); g.rect(x - w / 2, y - h / 2, w, h); g.fill(); g.stroke();
    g.strokeStyle = '#4c666b';
    g.lineWidth = 1;
    for (let i = 1; i <= n; i++) {
      const yy = y - h / 2 + (i / (n + 1)) * h;
      g.beginPath(); g.moveTo(x - w / 2 + 1.5, yy); g.lineTo(x + w / 2 - 1.5, yy); g.stroke();
    }
    g.restore();
  }

  function pipe(g, x1, y1, x2, y2, width = 3.2) {
    g.save();
    g.strokeStyle = INK; g.lineWidth = width + 2.2;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = METAL; g.lineWidth = width;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = METAL_HI; g.lineWidth = width * 0.32;
    g.beginPath(); g.moveTo(x1 - 0.4, y1 - 0.6); g.lineTo(x2 - 0.4, y2 - 0.6); g.stroke();
    g.restore();
  }

  function light(g, x, y, r, color) {
    g.save();
    g.globalAlpha = 0.2; g.fillStyle = color;
    g.beginPath(); g.arc(x, y, r * 2.4, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.95;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  /* ---------- sprite cache ---------- */
  const spriteCache = new Map();

  function getTileSprite(typeId, kind, tier, boil, size, slot) {
    const key = `${typeId}|${kind}|${tier}|${boil}|${size}|${slot}`;
    let c = spriteCache.get(key);
    if (c) return c;
    const pad = Math.ceil(size * 1.95);
    c = document.createElement('canvas');
    c.width = Math.ceil(pad * SPRITE_SCALE);
    c.height = Math.ceil(pad * SPRITE_SCALE);
    const g = c.getContext('2d');
    g.scale(SPRITE_SCALE, SPRITE_SCALE);
    g.translate(pad / 2, pad / 2);
    initCtx(g);
    drawTileArt(g, typeId, kind, tier, size, boil, slot);
    c._css = pad;
    spriteCache.set(key, c);
    return c;
  }

  function drawTileAt(g, typeId, kind, level, x, y, size, boil, slot, alpha = 1) {
    const tier = Math.max(1, Math.min(4, level));
    const sz = Math.max(20, Math.round(size / 2) * 2);
    const spr = getTileSprite(typeId, kind, tier, boil, sz, slot);
    const css = spr._css;
    g.save();
    g.globalAlpha = alpha;
    g.drawImage(spr, x - css / 2, y - css / 2, css, css);
    g.restore();
  }

  /* ---------- tile art ---------- */
  function drawTileArt(g, typeId, kind, tier, size, boil, slot) {
    const seed = 900 + typeId.length * 37 + tier * 11;
    const k = size / 52;
    g.save();
    g.scale(k, k);

    if (slot === 'path') {
      const pad = roundRectPts(0, 3, 47, 38, 7);
      wash(g, pad, '#0a1115', { ox: 1.5, oy: 3.5, alpha: 0.9 });
      wash(g, pad, '#24343a', { ox: 0, oy: 0, alpha: 1 });
      sketch(g, pad, { seed, boil, width: 2.6, closed: true, amp: 0.45 });
      // deck seams + bolts
      g.save();
      g.strokeStyle = INK_SOFT; g.lineWidth = 1;
      g.beginPath(); g.moveTo(-18, 12); g.lineTo(18, 12); g.stroke();
      g.beginPath(); g.moveTo(-18, 16); g.lineTo(18, 16); g.stroke();
      g.restore();
      bolt(g, -19, -12); bolt(g, 19, -12); bolt(g, -19, 17); bolt(g, 19, 17);
      // cyan guide strip
      g.save();
      g.fillStyle = CYAN; g.globalAlpha = 0.85;
      g.fillRect(-9, 19, 18, 2.2);
      g.restore();
    } else {
      const pad = [[-21, 16], [-24, 4], [-15, -13], [15, -13], [24, 4], [21, 16]];
      wash(g, pad, '#0a1115', { ox: 1.5, oy: 3.5, alpha: 0.9 });
      wash(g, pad, '#223036', { ox: 0, oy: 0, alpha: 1 });
      sketch(g, pad, { seed: seed + 2, boil, width: 2.5, closed: true, amp: 0.55 });
      g.save();
      g.strokeStyle = INK_SOFT; g.lineWidth = 1;
      g.beginPath(); g.moveTo(-19, 11); g.lineTo(19, 11); g.stroke();
      g.restore();
      bolt(g, -19, -8); bolt(g, 19, -8); bolt(g, -18, 13); bolt(g, 18, 13);
      // amber slot tick
      g.save();
      g.fillStyle = AMBER; g.globalAlpha = 0.75;
      g.fillRect(-5, 13.4, 10, 1.8);
      g.restore();
    }

    // functional color halo behind the module
    const tints = {
      forest: BIO, meadow: '#b9d96a', rock: AMBER, lake: CYAN,
      barracks: AMBER, forge: RUST, tower: VIOLET, shrine: '#c9e36a'
    };
    const tint = tints[typeId] || CYAN;
    g.save();
    const halo = g.createRadialGradient(0, 3, 2, 0, 3, 23);
    halo.addColorStop(0, tint);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.22;
    g.fillStyle = halo;
    g.beginPath(); g.ellipse(0, 3, 23, 18, 0, 0, Math.PI * 2); g.fill();
    g.restore();

    // colored module chip: each tile reads by color first, shape second
    const chip = slot === 'path'
      ? roundRectPts(0, -1, 43, 34, 7)
      : circlePts(0, -1, 22, 17, 6, Math.PI / 6);
    wash(g, chip, tint, { alpha: 0.38, ox: 0, oy: 0, closed: true });
    sketch(g, chip, { seed: seed + 4, boil, width: 1.5, closed: true, color: tint, amp: 0.35, alpha: 0.8 });

    g.save();
    g.translate(0, -1);
    g.scale(1.55, 1.55);
    const ctx = { g, seed, boil, tier };
    if (kind === 'terrain') {
      if (typeId === 'forest') drawForest(ctx);
      else if (typeId === 'meadow') drawMeadow(ctx);
      else if (typeId === 'rock') drawRock(ctx);
      else if (typeId === 'lake') drawLake(ctx);
    } else {
      if (typeId === 'barracks') drawBarracks(ctx);
      else if (typeId === 'forge') drawForge(ctx);
      else if (typeId === 'tower') drawTower(ctx);
      else if (typeId === 'shrine') drawShrine(ctx);
    }
    g.restore();
    g.restore();
  }

  /* ---------- terrain modules ---------- */
  function drawForest({ g, seed, boil, tier }) {
    // planter trough
    roundRect(g, 0, 12, 30, 10, 2.5, { fill: '#3a5157', seed: seed + 1, boil, width: 2.2 });
    vent(g, 0, 12.5, 14, 4, 2);
    // glass growth dome
    const dome = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI;
      dome.push([Math.cos(a) * 15, 8 + Math.sin(a) * 20]);
    }
    wash(g, dome, '#2f5a4e', { alpha: 0.35, ox: 0.6, oy: 1, closed: true });
    sketch(g, dome, { seed: seed + 2, boil, width: 2.4, closed: true, color: '#6e9488' });
    // oxygen ferns
    const fronds = [
      { x: -7, y: 7, r: 7, a: -2.2 },
      { x: 0, y: 5, r: 10, a: -1.57 },
      { x: 7, y: 7, r: 7, a: -0.9 }
    ];
    fronds.forEach((f, i) => {
      line(g, f.x, 9, f.x, f.y - 3, { seed: seed + 10 + i, boil, width: 2, color: BIO_DEEP });
      for (let j = 0; j < 4; j++) {
        const a = f.a + (j - 1.5) * 0.42;
        const len = f.r - j * 0.8;
        const leaf = [
          [f.x, f.y - 3],
          [f.x + Math.cos(a) * len, f.y - 3 + Math.sin(a) * len],
          [f.x + Math.cos(a + 0.32) * len * 0.55, f.y - 2 + Math.sin(a + 0.32) * len * 0.55]
        ];
        wash(g, leaf, j % 2 ? BIO : '#7fb249', { alpha: 0.9, ox: 0.4, oy: 0.8, closed: true });
        sketch(g, leaf, { seed: seed + 20 + i * 4 + j, boil, width: 1.2, closed: true });
      }
    });
    light(g, 10, -2, 1.8, CYAN);
    if (tier >= 2) {
      pipe(g, -15, 13, -20, 5, 2.4);
      roundRect(g, -20, 2, 6, 6, 1.5, { fill: METAL, seed: seed + 40, boil, width: 1.6 });
      bolt(g, -20, 2, 1.2);
    }
    if (tier >= 3) {
      // extra planter + spore glow
      roundRect(g, 12, 5, 11, 8, 2, { fill: '#3a5157', seed: seed + 41, boil, width: 1.8 });
      for (let i = 0; i < 3; i++) {
        line(g, 9 + i * 3, 4, 9 + i * 3 + (i - 1), -1, { seed: seed + 42 + i, boil, width: 1.4, color: BIO_DEEP });
      }
      light(g, 12, 0, 1.5, BIO);
    }
    if (tier >= 4) {
      // pressure gauge + armor ring
      ellipse(g, -13, 5, 3.4, 3.4, { seed: seed + 50, boil, width: 1.6, fill: '#0f1a1e', fillAlpha: 0.95 });
      line(g, -13, 5, -11.5, 3.2, { seed: seed + 51, boil, width: 1.2, color: AMBER });
      g.save();
      g.strokeStyle = AMBER; g.lineWidth = 1.4;
      g.beginPath(); g.arc(0, 7, 17, 0.2, 2.9); g.stroke();
      g.restore();
    }
  }

  function drawMeadow({ g, seed, boil, tier }) {
    // moss bed tray
    roundRect(g, 0, 12, 32, 9, 2.5, { fill: '#3a5157', seed: seed + 1, boil, width: 2.2 });
    const moss = [[-13, 11], [-9, 4], [-2, 2], [5, 3], [12, 6], [14, 12], [-13, 13]];
    wash(g, moss, '#3f5f34', { alpha: 0.95, ox: 0.8, oy: 1.4, closed: true });
    sketch(g, moss, { seed: seed + 2, boil, width: 2, closed: true, color: '#1e3420' });
    // clumps of angular moss
    for (let i = 0; i < 6; i++) {
      const x = -10 + i * 4 + jit(seed + i, 2) * 1.2;
      const y = 9 - (i % 2) * 2;
      const clump = [[x - 2.4, y], [x - 1.4, y - 4.4], [x + 0.8, y - 5.2], [x + 2.4, y - 1.8], [x + 1.6, y]];
      wash(g, clump, i % 3 === 0 ? BIO : '#7fb249', { alpha: 0.9, ox: 0.3, oy: 0.6, closed: true });
      sketch(g, clump, { seed: seed + 10 + i, boil, width: 1.1, closed: true, color: '#24401f' });
    }
    // mushrooms / spore lights
    for (let i = 0; i < Math.min(3, tier); i++) {
      const x = -8 + i * 8, y = i % 2 ? 1 : 4;
      line(g, x, 9, x, y + 2, { seed: seed + 20 + i, boil, width: 1.6, color: '#d7e3c0' });
      ellipse(g, x, y, 4, 2.6, { seed: seed + 21 + i, boil, width: 1.4, fill: i === 1 ? AMBER : CYAN, fillAlpha: 0.85 });
      light(g, x, y - 1, 1.1, i === 1 ? AMBER : CYAN);
    }
    if (tier >= 3) {
      vent(g, 13, 11, 8, 5, 3);
      pipe(g, 13, 7, 17, 1, 1.8);
    }
    if (tier >= 4) {
      // irrigation ring
      g.save();
      g.strokeStyle = CYAN_DEEP; g.lineWidth = 1.4; g.setLineDash([2, 3]);
      g.beginPath(); g.arc(0, 8, 14, 0.15, 2.95); g.stroke();
      g.restore();
      light(g, -14, 5, 1.4, CYAN);
    }
  }

  function drawRock({ g, seed, boil, tier }) {
    // mineral crate
    const crate = [[-16, 12], [-18, -3], [-13, -10], [13, -10], [18, -3], [16, 12]];
    wash(g, crate, '#3a4e54', { ox: 1.2, oy: 2, alpha: 0.98 });
    sketch(g, crate, { seed: seed + 1, boil, width: 2.4, closed: true });
    g.save();
    g.strokeStyle = INK_SOFT; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-16, 0); g.lineTo(16, 0); g.stroke();
    g.restore();
    bolt(g, -13, -6); bolt(g, 13, -6); bolt(g, -13, 9); bolt(g, 13, 9);
    // basalt chunks
    const chunks = [
      { x: -6, y: 1, w: 9, h: 8, c: '#3f4d52' },
      { x: 4, y: 3, w: 8, h: 7, c: '#4b5a5f' }
    ];
    chunks.forEach((ch, i) => {
      const pts = circlePts(ch.x, ch.y, ch.w, ch.h, 8, 0.4);
      wash(g, pts, ch.c, { alpha: 0.98, ox: 1, oy: 1.5 });
      sketch(g, pts, { seed: seed + 10 + i, boil, width: 1.8, closed: true });
      line(g, ch.x - 2, ch.y - 2, ch.x + 1, ch.y + 2, { seed: seed + 20 + i, boil, width: 1, color: '#182226' });
    });
    // amber ore veins
    if (tier >= 2) {
      poly(g, [[6, -4], [10, -1], [7, 3], [3, 0]], { seed: seed + 30, boil, width: 1.4, color: AMBER_DEEP });
      wash(g, [[6, -4], [10, -1], [7, 3], [3, 0]], AMBER, { alpha: 0.85, ox: 0.4, oy: 0.6, closed: true });
      light(g, 6, 0, 1.2, AMBER);
    }
    if (tier >= 3) {
      // second crate + drill
      roundRect(g, 14, 3, 10, 9, 2, { fill: '#24343a', seed: seed + 40, boil, width: 1.8 });
      line(g, 14, -3, 14, 6, { seed: seed + 41, boil, width: 2, color: METAL_HI });
      poly(g, [[14, -3], [17, 1], [14, 4], [11, 1]], { seed: seed + 42, boil, width: 1.2, color: AMBER });
    }
    if (tier >= 4) {
      // hazard corner + cable
      caution(g, -11, 9, 12, 4, 0.85);
      pipe(g, 16, -8, 20, -13, 1.8);
    }
  }

  function drawLake({ g, seed, boil, tier }) {
    // coolant tank
    roundRect(g, 0, 1, 27, 26, 5, { fill: '#344a50', seed: seed + 1, boil, width: 2.5 });
    // tank bands
    g.save();
    g.strokeStyle = INK_SOFT; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-13, -4); g.lineTo(13, -4); g.stroke();
    g.beginPath(); g.moveTo(-13, 8); g.lineTo(13, 8); g.stroke();
    g.restore();
    // liquid window
    const win = roundRectPts(0, 2, 16, 13, 3);
    wash(g, win, '#0e1c21', { alpha: 0.95, ox: 0.5, oy: 1 });
    g.save();
    g.beginPath(); g.rect(-8, -4, 16, 12); g.clip();
    const wob = Math.sin(seed * 0.3 + boil) * 1.2;
    wash(g, [[-10, 4 + wob], [-3, 2.6 + wob], [4, 4.2 + wob], [10, 3.2 + wob], [10, 12], [-10, 12]], CYAN_DEEP, { alpha: 0.95, ox: 0, oy: 0, closed: true });
    g.strokeStyle = CYAN; g.lineWidth = 1.4;
    g.beginPath();
    for (let i = -8; i <= 8; i += 2) {
      const yy = 3.4 + wob + Math.sin(i * 0.8 + seed) * 0.8;
      if (i === -8) g.moveTo(i, yy); else g.lineTo(i, yy);
    }
    g.stroke();
    g.restore();
    sketch(g, win, { seed: seed + 2, boil, width: 1.7, closed: true, color: '#7fa9a4' });
    // valve wheel
    ellipse(g, 16, -8, 4.4, 4.4, { seed: seed + 3, boil, width: 1.8, fill: METAL, fillAlpha: 0.98 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      line(g, 16 - Math.cos(a) * 3.6, -8 - Math.sin(a) * 3.6, 16 + Math.cos(a) * 3.6, -8 + Math.sin(a) * 3.6, { seed: seed + 4 + i, boil, width: 1.2, color: INK });
    }
    // bubbles
    for (let i = 0; i < 3; i++) {
      ellipse(g, -3 + i * 4, 7 - (i % 2) * 3, 1.4, 1.4, { seed: seed + 8 + i, boil, width: 0.9, fill: CYAN, fillAlpha: 0.7 });
    }
    if (tier >= 2) {
      pipe(g, -14, 8, -19, 12, 2.4);
      vent(g, 0, -12.5, 10, 4, 3);
    }
    if (tier >= 3) {
      roundRect(g, -17, -5, 7, 12, 2, { fill: '#3a4e54', seed: seed + 20, boil, width: 1.7 });
      bolt(g, -17, -2, 1.2); bolt(g, -17, 1, 1.2);
      light(g, 11, 5, 1.5, CYAN);
    }
    if (tier >= 4) {
      caution(g, 0, 13, 16, 4, 0.9);
      g.save();
      g.strokeStyle = AMBER; g.lineWidth = 1.3;
      g.beginPath(); g.arc(0, 2, 18, -2.5, 0.6); g.stroke();
      g.restore();
    }
  }

  /* ---------- building modules ---------- */
  function drawBarracks({ g, seed, boil, tier }) {
    // cryo pod
    const pod = roundRectPts(0, 2, 28, 25, 9);
    wash(g, pod, '#0a1115', { ox: 1.2, oy: 2.4, alpha: 0.95 });
    wash(g, pod, '#3d5960', { ox: 0, oy: 0, alpha: 1 });
    sketch(g, pod, { seed: seed + 1, boil, width: 2.5, closed: true });
    // window
    const win = roundRectPts(0, 1, 17, 13, 5);
    wash(g, win, '#0d1b20', { alpha: 0.95, ox: 0.5, oy: 1 });
    sketch(g, win, { seed: seed + 2, boil, width: 1.8, closed: true, color: '#6f9390' });
    // sleeping colonist silhouette
    g.save();
    g.globalAlpha = 0.9;
    g.fillStyle = '#1d3a3a';
    g.beginPath(); g.arc(2, -2, 3.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#25514b';
    g.beginPath(); g.ellipse(-2, 4, 6, 3.4, -0.2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = CYAN; g.lineWidth = 1; g.globalAlpha = 0.55;
    g.beginPath(); g.arc(2, -2, 4.6, 0, Math.PI * 2); g.stroke();
    g.restore();
    // pipes and lamps
    pipe(g, -13, -8, -18, -12, 2);
    light(g, 0, -9.5, 1.3, CYAN);
    vent(g, 10.5, 5, 5, 9, 3);
    bolt(g, -9, 10); bolt(g, 9, 10);
    if (tier >= 2) {
      // bunk module
      roundRect(g, 15, 6, 10, 9, 2.5, { fill: '#26373d', seed: seed + 20, boil, width: 1.8 });
      bolt(g, 15, 3, 1.2); bolt(g, 15, 9, 1.2);
      light(g, 15, 12, 1.1, AMBER);
    }
    if (tier >= 3) {
      // status panel
      roundRect(g, -14, -4, 7, 8, 1.5, { fill: '#10181c', seed: seed + 30, boil, width: 1.6 });
      g.fillStyle = CYAN; g.fillRect(-16.5, -6, 3.2, 1.2);
      g.fillStyle = AMBER; g.fillRect(-16.5, -3.6, 2.2, 1.2);
      g.fillStyle = RUST; g.fillRect(-16.5, -1.2, 2.8, 1.2);
    }
    if (tier >= 4) {
      caution(g, 0, -12, 14, 4, 0.9);
      g.save(); g.strokeStyle = '#7fa9a4'; g.lineWidth = 1.2;
      g.beginPath(); g.arc(0, 2, 16, 0.2, 2.9); g.stroke(); g.restore();
    }
  }

  function drawForge({ g, seed, boil, tier }) {
    // smelter body
    roundRect(g, 0, 5, 27, 17, 3, { fill: '#4a3f3a', seed: seed + 1, boil, width: 2.5 });
    // chimney
    roundRect(g, 8, -12, 8, 16, 2, { fill: '#3a464a', seed: seed + 2, boil, width: 2.2 });
    vent(g, 8, -16, 8, 4, 2);
    // furnace mouth
    const mouth = roundRectPts(-3, 7, 13, 9, 3);
    wash(g, mouth, '#120d0a', { alpha: 0.98, ox: 0.4, oy: 1 });
    sketch(g, mouth, { seed: seed + 3, boil, width: 1.8, closed: true });
    g.save();
    g.globalAlpha = 0.95; g.fillStyle = RUST;
    g.beginPath(); g.ellipse(-3, 9, 4.6, 2.6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = AMBER;
    g.beginPath(); g.ellipse(-3, 9, 2.6, 1.4, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    light(g, -3, 9, 1.1, AMBER);
    // bolts + hazard
    bolt(g, -11, -1); bolt(g, 11, -1); bolt(g, -11, 12); bolt(g, 11, 12);
    caution(g, 0, 15, 20, 4, 0.85);
    // heat pipes
    pipe(g, 13, -2, 19, -8, 2.2);
    pipe(g, -13, 0, -18, 6, 2.2);
    // heat shimmer
    for (let i = 0; i < 3; i++) {
      line(g, 9 + i * 1.5, -19, 11 + i * 1.5, -24, { seed: seed + 10 + i, boil, width: 1.2, color: '#6e5a4d' });
    }
    if (tier >= 2) {
      // side tank
      roundRect(g, 17, 8, 8, 9, 2, { fill: RUST_DEEP, seed: seed + 20, boil, width: 1.8 });
      bolt(g, 17, 5, 1.2);
      light(g, 17, 3, 1.2, ALERT);
    }
    if (tier >= 3) {
      // extra vents
      vent(g, -14, 8, 6, 10, 4);
      g.save(); g.strokeStyle = AMBER; g.lineWidth = 1.2;
      g.beginPath(); g.arc(0, 5, 15, 0.4, 2.7); g.stroke(); g.restore();
    }
    if (tier >= 4) {
      // pressure tank + gauge
      ellipse(g, -14, -6, 4, 4, { seed: seed + 40, boil, width: 1.7, fill: '#10181c', fillAlpha: 0.95 });
      line(g, -14, -6, -12, -8, { seed: seed + 41, boil, width: 1.2, color: ALERT });
      for (let i = 0; i < 4; i++) {
        line(g, 3 + i, 3, 5 + i, 1, { seed: seed + 42 + i, boil, width: 1, color: AMBER });
      }
    }
  }

  function drawTower({ g, seed, boil, tier }) {
    // base
    roundRect(g, 0, 13, 24, 8, 2.5, { fill: '#3a4e54', seed: seed + 1, boil, width: 2.2 });
    bolt(g, -9, 13); bolt(g, 9, 13);
    // mast
    const top = tier >= 2 ? -21 : -15;
    line(g, 0, 12, 0, top, { seed: seed + 2, boil, width: 3.4, color: METAL });
    line(g, -1.2, 12, -1.2, top, { seed: seed + 3, boil, width: 1, color: METAL_HI });
    // cross braces
    for (let i = 0; i < 3; i++) {
      const y = 6 - i * 7;
      line(g, -4, y, 4, y - 4, { seed: seed + 4 + i, boil, width: 1.2, color: INK_SOFT });
      line(g, 4, y, -4, y - 4, { seed: seed + 7 + i, boil, width: 1.2, color: INK_SOFT });
    }
    // dish
    const dish = [[-16, top + 1], [-9, top - 9], [0, top - 12], [9, top - 8], [15, top + 1], [0, top - 2]];
    wash(g, dish, '#516a6d', { alpha: 0.98, ox: 1, oy: 1.6, closed: true });
    sketch(g, dish, { seed: seed + 10, boil, width: 2.3, closed: true });
    line(g, 0, top - 2, 0, top + 7, { seed: seed + 11, boil, width: 1.6 });
    light(g, 0, top - 10, 1.6, CYAN);
    // side instrument
    roundRect(g, 11, -2, 7, 9, 1.5, { fill: '#1b2a30', seed: seed + 12, boil, width: 1.7 });
    g.fillStyle = CYAN; g.fillRect(12.2, 0, 4.6, 1.2);
    g.fillStyle = AMBER; g.fillRect(12.2, 2.4, 3, 1.2);
    if (tier >= 2) {
      // second antenna + cables
      line(g, 6, top + 2, 10, top - 8, { seed: seed + 20, boil, width: 1.8, color: METAL_HI });
      light(g, 10, top - 9, 1.1, AMBER);
      pipe(g, 10, 9, 17, 5, 1.8);
    }
    if (tier >= 3) {
      // solar fin
      poly(g, [[-18, 4], [-26, -2], [-24, 5], [-17, 8]], { seed: seed + 30, boil, width: 1.4, color: INK });
      wash(g, [[-18, 4], [-26, -2], [-24, 5], [-17, 8]], '#2f4d55', { alpha: 0.95, ox: 0.4, oy: 0.8, closed: true });
      light(g, -23, 1, 1.1, CYAN);
    }
    if (tier >= 4) {
      // ring + beacon
      g.save(); g.strokeStyle = CYAN; g.lineWidth = 1.4;
      g.beginPath(); g.arc(0, top - 2, 13, 0.3, 2.8); g.stroke(); g.restore();
      light(g, 0, top - 15, 1.8, ALERT);
    }
  }

  function drawShrine({ g, seed, boil, tier }) {
    // O2 generator canister
    roundRect(g, 0, 4, 24, 22, 6, { fill: '#355450', seed: seed + 1, boil, width: 2.5 });
    roundRect(g, 0, -10, 14, 10, 3, { fill: '#3f5f59', seed: seed + 2, boil, width: 2 });
    // core window
    const core = circlePts(0, 4, 7.5, 7.5, 10, 0.3);
    wash(g, core, '#0e1c1a', { alpha: 0.98, ox: 0.4, oy: 1 });
    sketch(g, core, { seed: seed + 3, boil, width: 1.8, closed: true, color: '#79a89e' });
    light(g, 0, 4, 3.2, BIO);
    // O2 bubbles
    for (let i = 0; i < 3; i++) {
      ellipse(g, -3 + i * 3, -1 - i * 2.4, 1.5, 1.5, { seed: seed + 5 + i, boil, width: 0.9, fill: CYAN, fillAlpha: 0.8 });
    }
    // pipes + valve
    pipe(g, 11, 1, 18, -4, 2.2);
    pipe(g, -11, 6, -17, 11, 2.2);
    ellipse(g, 18, -6, 3.2, 3.2, { seed: seed + 9, boil, width: 1.5, fill: METAL, fillAlpha: 0.98 });
    vent(g, 8, 12, 6, 6, 2);
    bolt(g, -8, 12); bolt(g, 8, 5);
    if (tier >= 2) {
      // second canister
      roundRect(g, -15, 7, 8, 12, 2.5, { fill: '#2f4a46', seed: seed + 20, boil, width: 1.8 });
      light(g, -15, 4, 1.2, BIO);
      bolt(g, -15, 11, 1.2);
    }
    if (tier >= 3) {
      // fan guard
      g.save();
      g.strokeStyle = '#79a89e'; g.lineWidth = 1.1;
      g.beginPath(); g.arc(0, 4, 10.5, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        g.beginPath(); g.moveTo(0, 4); g.lineTo(Math.cos(a) * 9, 4 + Math.sin(a) * 9); g.stroke();
      }
      g.restore();
    }
    if (tier >= 4) {
      caution(g, 0, -10, 12, 3.6, 0.85);
      g.save(); g.globalAlpha = 0.25; g.fillStyle = BIO;
      g.beginPath(); g.arc(0, 4, 16, 0, Math.PI * 2); g.fill(); g.restore();
    }
  }

  /* ---------- characters ---------- */
  function drawHero(g, x, y, s, t, boil, opts = {}) {
    const flip = opts.flip ? -1 : 1;
    const bob = Math.sin(t * 9) * 2;
    const legPhase = Math.sin(t * 12);
    g.save();
    g.scale(flip, 1);
    g.translate(x * flip, y + bob);
    g.scale(s / 44, s / 44);
    // shadow
    g.save(); g.globalAlpha = 0.35; g.fillStyle = '#05090b';
    g.beginPath(); g.ellipse(0, 18, 14, 4, 0, 0, Math.PI * 2); g.fill(); g.restore();
    // backpack tank
    roundRect(g, -10, -6, 7, 14, 3, { fill: '#354a50', seed: 70, boil, width: 1.8 });
    light(g, -10, -8, 1.2, CYAN);
    // legs / boots
    line(g, -4, 7, -5 - legPhase * 3, 16, { seed: 71, boil, width: 3, color: '#3a4e54' });
    line(g, 4, 7, 5 + legPhase * 3, 16, { seed: 72, boil, width: 3, color: '#3a4e54' });
    roundRect(g, -5 - legPhase * 3, 17, 6, 3, 1.2, { fill: '#111a1e', seed: 73, boil, width: 1.4 });
    roundRect(g, 5 + legPhase * 3, 17, 6, 3, 1.2, { fill: '#111a1e', seed: 74, boil, width: 1.4 });
    // suit body
    const body = [[-8, -6], [8, -6], [9, 8], [-9, 8]];
    wash(g, body, '#2f6d66', { alpha: 0.98, ox: 1, oy: 1.6 });
    sketch(g, body, { seed: 75, boil, width: 2.6, closed: true });
    // chest panel
    roundRect(g, 0, 1, 9, 6, 1.5, { fill: '#122024', seed: 76, boil, width: 1.4 });
    g.fillStyle = CYAN; g.fillRect(-2.6, -0.4, 5.2, 1.2);
    g.fillStyle = AMBER; g.fillRect(-2.6, 1.4, 2.4, 1.2);
    // arm + tool
    const swing = opts.swing || 0;
    g.save();
    g.translate(7, -3);
    g.rotate(swing * 0.9 - 0.2);
    line(g, 0, 0, 7, 5, { seed: 77, boil, width: 2.4, color: '#3a4e54' });
    line(g, 7, 5, 13, -3, { seed: 78, boil, width: 2.4, color: METAL_HI });
    poly(g, [[13, -3], [17, -8], [19, -5], [15, -1]], { seed: 79, boil, width: 1.5, color: AMBER });
    g.restore();
    // helmet
    const helm = circlePts(0, -15, 11, 10, 12, 0.15);
    wash(g, helm, '#d8c7a2', { alpha: 0.98, ox: 0.8, oy: 1.4 });
    sketch(g, helm, { seed: 80, boil, width: 2.6, closed: true });
    // visor
    const visor = roundRectPts(1, -15, 15, 7, 3);
    wash(g, visor, '#173a3c', { alpha: 0.98, ox: 0.4, oy: 1 });
    sketch(g, visor, { seed: 81, boil, width: 1.6, closed: true, color: '#0a1417' });
    g.save(); g.globalAlpha = 0.85; g.strokeStyle = CYAN; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-4, -17); g.lineTo(5, -17); g.stroke(); g.restore();
    // helmet lamp + bolts
    light(g, 10, -19, 1.5, AMBER);
    bolt(g, -7, -13, 1.2); bolt(g, 7, -13, 1.2);
    // collar
    line(g, -7, -8, 7, -8, { seed: 82, boil, width: 1.6, color: INK_SOFT });
    g.restore();
  }

  function drawMinion(g, x, y, s, def, t, boil, opts = {}) {
    const bob = Math.sin(t * 7 + (opts.phase || 0)) * 1.5;
    const flip = opts.flip ? -1 : 1;
    g.save();
    g.translate(x, y + bob);
    g.scale(s / 30, s / 30);
    g.scale(flip, 1);
    // shadow
    g.save(); g.globalAlpha = 0.3; g.fillStyle = '#05090b';
    g.beginPath(); g.ellipse(0, 10, 8, 2.2, 0, 0, Math.PI * 2); g.fill(); g.restore();
    // hover jets
    g.save(); g.globalAlpha = 0.5; g.fillStyle = CYAN;
    g.beginPath(); g.moveTo(-4, 8); g.lineTo(-2, 12); g.lineTo(0, 8); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(4, 8); g.lineTo(2, 12); g.lineTo(0, 8); g.closePath(); g.fill();
    g.restore();
    // treads / legs
    roundRect(g, 0, 7, 12, 4, 2, { fill: '#10181c', seed: 200, boil, width: 1.3 });
    // body
    const body = circlePts(0, 0, 7.2, 7.6, 10, 0.2);
    wash(g, body, def.color, { alpha: 0.98, ox: 0.8, oy: 1.4 });
    sketch(g, body, { seed: 201 + (opts.phase || 0), boil, width: 2.3, closed: true });
    // top shell
    g.save(); g.globalAlpha = 0.35; g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(-2, -3, 4, 2.2, -0.4, 0, Math.PI * 2); g.fill(); g.restore();
    // visor
    const visor = roundRectPts(0, -1, 9, 4.8, 2);
    wash(g, visor, '#0b1418', { alpha: 0.98, ox: 0.3, oy: 0.8 });
    sketch(g, visor, { seed: 202 + (opts.phase || 0), boil, width: 1.2, closed: true });
    light(g, 1.5, -1, 0.9, opts.hurt ? ALERT : CYAN);
    // antenna
    line(g, 0, -7, 2, -11, { seed: 203 + (opts.phase || 0), boil, width: 1.1, color: METAL_HI });
    light(g, 2, -11, 0.8, AMBER);
    // tool
    const art = def.art;
    if (art === 'bow') {
      line(g, 6, 1, 12, -3, { seed: 204 + (opts.phase || 0), boil, width: 1.6, color: METAL_HI });
      poly(g, [[12, -3], [15, -5], [14, -1]], { seed: 205, boil, width: 1.1, color: CYAN });
      light(g, 14, -3, 0.8, CYAN);
    } else if (art === 'sword') {
      line(g, 6, 2, 11, -4, { seed: 206 + (opts.phase || 0), boil, width: 1.5, color: METAL_HI });
      poly(g, [[11, -4], [14, -7], [13, -2]], { seed: 207, boil, width: 1.1, color: AMBER });
      light(g, 13, -5, 0.7, AMBER);
    } else if (art === 'spear') {
      line(g, 5, 5, 11, -6, { seed: 208 + (opts.phase || 0), boil, width: 1.5, color: METAL_HI });
      poly(g, [[11, -6], [13, -10], [14, -5]], { seed: 209, boil, width: 1.1, color: '#c9d9e2' });
    } else if (art === 'shield') {
      const sp = [[5, -5], [11, -2], [10, 4], [6, 7], [3, 3]];
      wash(g, sp, '#9fb4b6', { alpha: 0.98, ox: 0.4, oy: 0.8, closed: true });
      sketch(g, sp, { seed: 210 + (opts.phase || 0), boil, width: 1.6, closed: true });
      bolt(g, 7, 1, 1.1);
    } else if (art === 'hammer') {
      line(g, 5, 3, 9, -3, { seed: 211 + (opts.phase || 0), boil, width: 1.6, color: '#7c5a3a' });
      roundRect(g, 11, -5, 5, 4, 1, { fill: METAL_HI, seed: 212, boil, width: 1.3 });
    } else if (art === 'magic') {
      line(g, 5, 3, 8, -5, { seed: 213 + (opts.phase || 0), boil, width: 1.4, color: METAL });
      light(g, 9, -7, 1.6, VIOLET);
    } else if (art === 'club') {
      line(g, 5, 4, 9, -4, { seed: 214 + (opts.phase || 0), boil, width: 2, color: '#7c5a3a' });
      ellipse(g, 10, -6, 3.2, 3.6, { seed: 215, boil, width: 1.4, fill: METAL, fillAlpha: 0.98 });
      bolt(g, 10, -6, 1.1);
    }
    g.restore();
  }

  function drawMonster(g, x, y, s, type, t, boil, opts = {}) {
    const def = MONSTER_TYPES[type] || MONSTER_TYPES.slime;
    const bob = Math.sin(t * 5 + (opts.phase || 0)) * 2;
    const squash = 1 + Math.sin(t * 5 + (opts.phase || 0)) * 0.05;
    g.save();
    g.translate(x, y + bob);
    g.scale(s / 40, s / 40);
    g.scale(1 / squash, squash);
    // shadow
    g.save(); g.globalAlpha = 0.35; g.fillStyle = '#05090b';
    g.beginPath(); g.ellipse(0, 14, 12, 3.2, 0, 0, Math.PI * 2); g.fill(); g.restore();
    // body
    const body = circlePts(0, 0, 14, 12, 11, 0.2);
    wash(g, body, def.color, { alpha: 0.98, ox: 1.2, oy: 2 });
    sketch(g, body, { seed: 300 + type.length * 5, boil: boil + (opts.phase || 0), width: 2.8, closed: true });
    // inner rim light
    g.save(); g.globalAlpha = 0.7; g.strokeStyle = '#ffffff'; g.lineWidth = 1.4;
    g.beginPath(); g.arc(-2, -2, 10, 3.5, 5.3); g.stroke(); g.restore();
    // belly plate
    const belly = circlePts(1, 5, 8, 5, 9, 0.3);
    wash(g, belly, '#0e171a', { alpha: 0.35, ox: 0.3, oy: 0.8 });
    // goggle eyes
    ellipse(g, -4.5, -3, 4.2, 4.6, { seed: 301, boil, width: 1.8, fill: '#dce9e4', fillAlpha: 0.98 });
    ellipse(g, 4.5, -3, 4.2, 4.6, { seed: 302, boil, width: 1.8, fill: '#dce9e4', fillAlpha: 0.98 });
    g.fillStyle = INK;
    g.beginPath(); g.arc(-3.5 + (opts.look || 0), -2.5, 1.8, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(5.5 + (opts.look || 0), -2.5, 1.8, 0, Math.PI * 2); g.fill();
    g.save(); g.globalAlpha = 0.9; g.fillStyle = CYAN;
    g.beginPath(); g.arc(-2.9 + (opts.look || 0), -3.1, 0.6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(6.1 + (opts.look || 0), -3.1, 0.6, 0, Math.PI * 2); g.fill(); g.restore();
    // jagged mouth
    if (opts.hurt) {
      poly(g, [[-4, 6], [0, 3], [4, 6]], { seed: 303, boil, width: 1.6 });
    } else {
      poly(g, [[-5, 6], [-2, 8.5], [1, 6.5], [4, 9], [6, 6]], { seed: 304, boil, width: 1.6 });
    }
    // teeth
    for (const tx of [-3, 3]) {
      poly(g, [[tx - 1, 6], [tx, 9], [tx + 1, 6]], { seed: 305 + tx, boil, width: 1, color: '#dce9e4' });
    }
    // type details
    if (type === 'bat') {
      for (const side of [-1, 1]) {
        const wing = [[side * 12, -4], [side * 23, -12], [side * 19, -1], [side * 13, 1]];
        wash(g, wing, def.color, { alpha: 0.9, ox: 0.5, oy: 1, closed: true });
        sketch(g, wing, { seed: 307 + side, boil, width: 1.8, closed: true });
        line(g, side * 12, -3, side * 21, -9, { seed: 308 + side, boil, width: 1.1, color: INK });
        bolt(g, side * 17, -5, 1.1);
      }
    }
    if (type === 'thorn') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - 0.4;
        const px = Math.cos(a) * 14, py = Math.sin(a) * 12;
        poly(g, [[px, py], [px + Math.cos(a) * 7, py + Math.sin(a) * 7], [px + Math.cos(a + 0.5) * 3, py + Math.sin(a + 0.5) * 3]], { seed: 310 + i, boil, width: 1.5, color: '#c9d3d4' });
      }
      caution(g, 0, 12, 12, 3.4, 0.7);
    }
    if (type === 'boss' || type === 'mega') {
      // vent crown
      const crown = [[-10, -11], [-10, -18], [-5, -14], [0, -21], [5, -14], [10, -18], [10, -11]];
      wash(g, crown, METAL, { alpha: 0.98, ox: 0.5, oy: 0.8, closed: true });
      sketch(g, crown, { seed: 312, boil, width: 2, closed: true });
      bolt(g, -7, -13, 1.3); bolt(g, 7, -13, 1.3);
      light(g, 0, -19, 2, ALERT);
      for (let i = 0; i < 3; i++) {
        const a = -2.0 + i * 0.9;
        poly(g, [[Math.cos(a) * 14, Math.sin(a) * 12], [Math.cos(a) * 21, Math.sin(a) * 18], [Math.cos(a + 0.2) * 15, Math.sin(a + 0.2) * 13]], { seed: 313 + i, boil, width: 1.7, color: METAL });
      }
      if (type === 'mega') {
        // coolant pipes and reactor eye
        for (const side of [-1, 1]) {
          pipe(g, side * 9, -4, side * 22, -16, 2.4);
          bolt(g, side * 15, -9, 1.3);
        }
        const eye = circlePts(0, -6, 4, 4, 8, 0.2);
        wash(g, eye, AMBER, { alpha: 0.98, ox: 0.3, oy: 0.8, closed: true });
        sketch(g, eye, { seed: 325, boil, width: 1.6, closed: true });
        g.fillStyle = RUST; g.beginPath(); g.arc(0, -6, 1.6, 0, Math.PI * 2); g.fill();
        g.save(); g.strokeStyle = ALERT; g.lineWidth = 1.5; g.globalAlpha = 0.6;
        g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.stroke(); g.restore();
      }
    }
    g.restore();
  }

  function drawCoin(g, x, y, r, t, boil) {
    const sc = r / 10;
    const wob = Math.sin(t * 4 + x) * 0.5;
    g.save();
    g.translate(x, y);
    g.scale(sc, sc);
    const hex = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
      hex.push([wob + Math.cos(a) * 8.5, Math.sin(a) * 8.5]);
    }
    wash(g, hex, AMBER, { alpha: 0.98, ox: 0.6, oy: 1.2, closed: true });
    sketch(g, hex, { seed: 400 + Math.floor(x), boil, width: 2, closed: true });
    // energy slot
    poly(g, [[wob - 1.4, -4], [wob + 2.4, -4], [wob - 0.6, 0.2], [wob + 1.8, 0.2], [wob - 1.8, 4.6], [wob - 0.6, 0.8], [wob - 2.4, 0.8]], { seed: 401, boil, width: 1.1, color: AMBER_DEEP });
    light(g, wob, 0, 1.1, '#fff3bd');
    g.restore();
  }

  /* ---------- icons ---------- */
  function drawIcon(g, name, x, y, size, opts = {}) {
    const k = size / 24;
    const color = opts.color || TEXT;
    g.save();
    g.translate(x, y);
    g.scale(k, k);
    if (name === 'coin') {
      const hex = [];
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
        hex.push([Math.cos(a) * 9, Math.sin(a) * 9]);
      }
      wash(g, hex, AMBER, { alpha: 0.98, ox: 0.4, oy: 1, closed: true });
      sketch(g, hex, { seed: 500, width: 1.9, closed: true });
      poly(g, [[-2, -4.5], [2, -4.5], [-0.6, -0.2], [1.6, -0.2], [-1.6, 4.5], [-0.4, 0.6], [-2.2, 0.6]], { seed: 501, width: 1, color: AMBER_DEEP });
    } else if (name === 'heart') {
      const pts = heartPts(0, 1, 9);
      wash(g, pts, ALERT, { alpha: 0.95, ox: 0.4, oy: 0.8 });
      sketch(g, pts, { seed: 502, width: 1.8, closed: true });
      line(g, -3, -3, -1, -5, { seed: 503, width: 1.1, color: '#ffd8cc' });
    } else if (name === 'sword') {
      // wrench
      line(g, -7, 8, 5, -5, { seed: 504, width: 3, color: METAL_HI });
      line(g, -7, 8, 5, -5, { seed: 505, width: 1.2, color: '#dce9e4' });
      ellipse(g, 7, -7, 3.2, 3.2, { seed: 506, width: 1.5, fill: METAL, fillAlpha: 0.98 });
      poly(g, [[8, -9], [10, -11], [11, -9], [9, -7]], { seed: 507, width: 1, color: INK });
    } else if (name === 'shield') {
      const sp = [[0, -9], [8, -5], [7, 4], [0, 10], [-7, 4], [-8, -5]];
      wash(g, sp, '#4e6a70', { alpha: 0.98, ox: 0.4, oy: 0.8, closed: true });
      sketch(g, sp, { seed: 508, width: 1.8, closed: true });
      line(g, 0, -6, 0, 7, { seed: 509, width: 1.2, color: CYAN });
      bolt(g, -3, 1, 1); bolt(g, 3, 1, 1);
    } else if (name === 'drop') {
      const dp = [[0, -10], [7, 1], [5, 7], [0, 9], [-5, 7], [-7, 1]];
      wash(g, dp, CYAN_DEEP, { alpha: 0.98, ox: 0.4, oy: 0.8, closed: true });
      sketch(g, dp, { seed: 510, width: 1.8, closed: true });
      line(g, -2, 1, 1, 1, { seed: 511, width: 1.1, color: CYAN });
    } else if (name === 'wind') {
      for (let i = 0; i < 3; i++) {
        sketch(g, [[-9, -5 + i * 5], [-1 + i * 2, -7 + i * 5], [8, -5 + i * 5]], { seed: 512 + i, width: 1.7, color: opts.color || CYAN });
      }
    } else if (name === 'boot') {
      poly(g, [[-5, -8], [2, -8], [2, 1], [8, 4], [8, 8], [-5, 8], [-5, -8]], { seed: 513, width: 1.8, color: '#5f8a8f' });
      line(g, -2, -1, 2, -1, { seed: 514, width: 1.2, color: CYAN });
    } else if (name === 'skull') {
      ellipse(g, 0, -2, 8, 7, { seed: 515, width: 1.8, fill: '#b9c7c4', fillAlpha: 0.98 });
      g.fillStyle = INK; g.beginPath(); g.arc(-3, -3, 2, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(3, -3, 2, 0, Math.PI * 2); g.fill();
      line(g, -3, 6, 3, 6, { seed: 516, width: 1.3 });
      line(g, 0, -7, 0, 2, { seed: 517, width: 1, color: '#6f8480' });
    } else if (name === 'flag') {
      line(g, -5, 10, -5, -10, { seed: 518, width: 2.2, color: METAL_HI });
      wash(g, [[-5, -10], [8, -7], [-5, -3]], ALERT, { alpha: 0.95, closed: true, ox: 0.4, oy: 0.8 });
      sketch(g, [[-5, -10], [8, -7], [-5, -3]], { seed: 519, width: 1.5, closed: true });
    } else if (name === 'star') {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const r = i % 2 ? 4 : 9;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      wash(g, pts, AMBER, { alpha: 0.98, ox: 0.4, oy: 0.8 });
      sketch(g, pts, { seed: 520, width: 1.6, closed: true });
    }
    g.restore();
  }

  /* ---------- misc ---------- */
  function drawSparkle(g, x, y, r, t, color = AMBER) {
    const a = 0.7 + Math.sin(t * 6) * 0.3;
    g.save(); g.globalAlpha = a; g.strokeStyle = color; g.lineWidth = 1.6; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const ang = t * 1.2 + (i / 4) * Math.PI * 2;
      g.beginPath();
      g.moveTo(x + Math.cos(ang) * r * 0.35, y + Math.sin(ang) * r * 0.35);
      g.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
      g.stroke();
    }
    g.restore();
  }

  return {
    INK, INK_SOFT, PAPER, PAPER_DEEP, TEXT, MUTED, METAL, METAL_HI,
    CYAN, CYAN_DEEP, AMBER, AMBER_DEEP, RUST, RUST_DEEP, BIO, BIO_DEEP,
    VIOLET, ALERT,
    rand, jit, initCtx, sketch, wash, line, poly, ellipse, roundRect,
    roundRectPts, circlePts, pathFrom, bolt, rivets, caution, vent, pipe, light,
    drawTileAt, drawTileArt, drawHero, drawMinion,
    drawMonster, drawCoin, drawIcon, drawSparkle, heartPts,
    spriteCache
  };
})();
