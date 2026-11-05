/* Dino Duo — all visuals are drawn procedurally on one canvas. */
(() => {
  'use strict';
  const D = window.DD;
  const { ctx, state, world } = D;
  const { clamp, lerp, TAU, dist } = D;
  const T = () => state.time;

  const SKINS = [
    { body: '#748f51', dark: '#49673a', belly: '#c5cf91', stripe: '#3d5830', eye: '#ffd166' },
    { body: '#a16b43', dark: '#6f452c', belly: '#d8b988', stripe: '#7a4b2e', eye: '#ffe08d' },
    { body: '#5f8579', dark: '#3b5d55', belly: '#b8ccb4', stripe: '#36554d', eye: '#ffd97a' }
  ];

  let shadowSprite = null;
  function makeShadowSprite() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0, 7, 4, .95)');
    grad.addColorStop(.58, 'rgba(0, 7, 4, .48)');
    grad.addColorStop(1, 'rgba(0, 7, 4, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    shadowSprite = c;
  }
  function shadow(x, y, rx, ry, alpha = 0.3, ox = 0, oy = 0) {
    if (!shadowSprite) makeShadowSprite();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(shadowSprite, x + ox - rx, y + oy - ry, rx * 2, ry * 2);
    ctx.restore();
  }

  function ellipse(x, y, rx, ry, fill, rotation = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rotation, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  /* ---------------- Trees ---------------- */
  function drawTreeBases(c) {
    c.save();
    for (const t of world.trees) {
      const s = t.scale;
      const x = t.x + 7 * s, y = t.y + 8 * s, rx = 34 * s, ry = 14 * s;
      c.save();
      c.translate(x, y);
      c.scale(1, ry / rx);
      const grad = c.createRadialGradient(0, 0, 0, 0, 0, rx);
      grad.addColorStop(0, 'rgba(0, 7, 4, .3)');
      grad.addColorStop(.65, 'rgba(0, 7, 4, .16)');
      grad.addColorStop(1, 'rgba(0, 7, 4, 0)');
      c.fillStyle = grad;
      c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill();
      c.restore();

      c.save();
      c.translate(t.x, t.y);
      c.strokeStyle = '#46331e';
      c.lineCap = 'round';
      c.lineWidth = 7 * s;
      c.beginPath(); c.moveTo(0, 8 * s); c.quadraticCurveTo(2 * s, -8 * s, 0, -26 * s); c.stroke();
      c.strokeStyle = 'rgba(155, 123, 70, .35)';
      c.lineWidth = 2.2 * s;
      c.beginPath(); c.moveTo(-1, 6 * s); c.quadraticCurveTo(0, -8 * s, -1, -25 * s); c.stroke();
      c.strokeStyle = '#4a351f'; c.lineWidth = 2.4 * s;
      for (let i = -1; i <= 1; i += 2) {
        c.beginPath(); c.moveTo(0, 7 * s); c.quadraticCurveTo(i * 7 * s, 13 * s, i * 15 * s, 12 * s); c.stroke();
      }
      c.restore();
    }
    c.restore();
  }

  function treeAlpha(t) {
    let alpha = 1;
    for (const p of state.players) {
      if (!p || p.downed) continue;
      const d = Math.hypot(p.x - t.x, p.y - (t.y - 30 * t.scale));
      if (d < 76 * t.scale) alpha = Math.min(alpha, 0.3 + 0.45 * (d / (76 * t.scale)));
    }
    for (const e of state.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - t.x, e.y - (t.y - 30 * t.scale));
      if (d < 74 * t.scale) alpha = Math.min(alpha, 0.46 + 0.4 * (d / (74 * t.scale)));
    }
    return alpha;
  }

  const canopyCache = new Map();
  const CANOPY_SIZE = 190;
  function canopySprite(variant, index) {
    const key = `${variant}-${index}`;
    if (canopyCache.has(key)) return canopyCache.get(key);
    const res = 2;
    const c = document.createElement('canvas');
    c.width = c.height = CANOPY_SIZE * res;
    const g = c.getContext('2d');
    g.scale(res, res);
    g.translate(CANOPY_SIZE / 2, CANOPY_SIZE / 2);
    if (variant === 'palm') drawPalmCanopy(g, 1, index);
    else if (variant === 'fern') drawFernCanopy(g, 1, index);
    else drawBroadCanopy(g, 1, index);
    canopyCache.set(key, c);
    return c;
  }

  function drawTreeCanopies() {
    for (const t of world.trees) {
      const s = t.scale;
      const sway = Math.sin(T() * 0.55 + t.phase) * 3.2 * s;
      const cy = t.y - 49 * s;
      const alpha = treeAlpha(t);
      const sprite = canopySprite(t.variant, t.spriteIndex || 0);
      const size = CANOPY_SIZE * s;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, t.x + sway - size / 2, cy - size / 2, size, size);
      ctx.restore();
    }
  }

  function drawBroadCanopy(c, s, index) {
    const greens = [
      ['#1d4526', '#285c32', '#34713a', '#458144'],
      ['#244b27', '#2f6330', '#3d7839', '#528d4a'],
      ['#193e25', '#24552b', '#2f6936', '#468044']
    ][index % 3];
    const phase = index * 1.7 + .4;
    c.beginPath(); c.ellipse(0, 12 * s, 50 * s, 40 * s, .12, 0, TAU);
    c.fillStyle = 'rgba(5, 18, 10, .34)'; c.fill();
    const lobes = [
      [-31 * s, 4 * s, 27 * s], [29 * s, 5 * s, 25 * s], [-6 * s, -16 * s, 33 * s],
      [20 * s, -17 * s, 24 * s], [-25 * s, -12 * s, 23 * s], [2 * s, 8 * s, 30 * s]
    ];
    for (const [x, y, r] of lobes) {
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = greens[1]; c.fill();
    }
    for (const [x, y, r] of lobes) {
      c.beginPath(); c.arc(x - 3 * s, y - 4 * s, r * .76, 0, TAU); c.fillStyle = greens[2]; c.fill();
    }
    for (let i = 0; i < 8; i++) {
      const a = phase + i * 2.4;
      const x = Math.cos(a) * 27 * s, y = Math.sin(a) * 16 * s - 4 * s;
      c.beginPath(); c.arc(x, y, (8 + (i % 3) * 3) * s, 0, TAU);
      c.fillStyle = i % 2 ? greens[3] : greens[2]; c.fill();
    }
    for (let i = 0; i < 11; i++) {
      const a = phase * 2 + i * 2.1;
      const x = Math.cos(a) * (17 + (i % 3) * 9) * s;
      const y = Math.sin(a) * (12 + (i % 4) * 5) * s - 6 * s;
      c.beginPath(); c.arc(x, y, 2.2 * s, 0, TAU); c.fillStyle = 'rgba(125, 166, 91, .42)'; c.fill();
    }
    c.beginPath(); c.arc(-13 * s, -17 * s, 10 * s, 0, TAU); c.fillStyle = 'rgba(158, 190, 111, .13)'; c.fill();
  }

  function drawPalmCanopy(c, s, index) {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU + index * .12;
      const len = (42 + (i % 3) * 8) * s;
      c.save();
      c.rotate(a);
      c.strokeStyle = i % 2 ? '#4a8a48' : '#396f3b'; c.lineWidth = 3.4 * s; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * .5, -6 * s, len, 11 * s); c.stroke();
      c.fillStyle = i % 2 ? 'rgba(83, 145, 73, .7)' : 'rgba(61, 116, 58, .72)';
      for (let k = 0; k < 3; k++) {
        const t = .34 + k * .22;
        const x = len * t, y = -4 * s + t * t * 8 * s;
        c.beginPath(); c.ellipse(x, y, len * .105, 4.4 * s, .2, 0, TAU); c.fill();
      }
      c.restore();
    }
    for (let i = 0; i < 4; i++) {
      const a = index * .7 + i * 1.8;
      c.beginPath(); c.ellipse(Math.cos(a) * 8 * s, Math.sin(a) * 5 * s, 4 * s, 3.5 * s, 0, 0, TAU); c.fillStyle = '#6a4824'; c.fill();
      c.beginPath(); c.arc(Math.cos(a) * 8 * s - 1 * s, Math.sin(a) * 5 * s - 1 * s, 1.2 * s, 0, TAU); c.fillStyle = '#9b733d'; c.fill();
    }
    c.beginPath(); c.ellipse(0, 3 * s, 13 * s, 10 * s, .2, 0, TAU); c.fillStyle = '#315b34'; c.fill();
  }

  function drawFernCanopy(c, s, index) {
    const count = 11;
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU + index * .23;
      const len = (30 + (i % 4) * 5) * s;
      c.save(); c.rotate(a);
      c.strokeStyle = i % 2 ? '#4b7d3f' : '#326534';
      c.lineWidth = 2.4 * s; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * .5, 5 * s, len, -2 * s); c.stroke();
      for (let k = 1; k <= 3; k++) {
        const x = len * k / 4;
        c.beginPath(); c.ellipse(x, 2.5 * s, 6.2 * s, 2.5 * s, -.4, 0, TAU);
        c.fillStyle = i % 2 ? 'rgba(81, 133, 63, .76)' : 'rgba(58, 105, 50, .8)'; c.fill();
      }
      c.restore();
    }
    c.beginPath(); c.ellipse(0, 1 * s, 11 * s, 8 * s, 0, 0, TAU); c.fillStyle = '#2c5730'; c.fill();
  }

  function buildTreeLayers() {
    if (world.baseLayer) return;
    const c = document.createElement('canvas');
    c.width = D.W; c.height = D.H;
    const g = c.getContext('2d');
    g.drawImage(world.terrain, 0, 0);
    drawTreeBases(g);
    world.baseLayer = c;
    world.trees.forEach((t, i) => { t.spriteIndex = i % 3; });
    for (let i = 0; i < 3; i++) {
      canopySprite('broad', i); canopySprite('palm', i); canopySprite('fern', i);
    }
  }

  // Baked once before the first frame so the title screen never stalls mid-input.
  D.warmScene = function () {
    buildTreeLayers();
    if (shadowSprite === null) makeShadowSprite();
  };

  /* ---------------- Players ---------------- */
  function drawPlayer(p) {
    if (!p) return;
    const def = p.def;
    const bob = p.moving ? Math.sin(p.walk) * 1.5 : Math.sin(T() * 2 + p.index) * .55;
    shadow(p.x, p.y + 9, 19, 9, .38);
    if (p.downed) { drawDownedPlayer(p); return; }
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(p.angle);
    ctx.scale(1.42, 1.42);

    // Foot rings identify players at a glance.
    ctx.beginPath(); ctx.arc(0, 0, 21, 0, TAU);
    ctx.fillStyle = `rgba(${def.glow}, .055)`; ctx.fill();
    ctx.strokeStyle = `rgba(${def.glow}, ${p.dashCd > 0 ? .2 : .5})`;
    ctx.lineWidth = 1.4; ctx.setLineDash([3, 5]); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(0, 0, 23.5, 0, TAU);
    ctx.strokeStyle = `rgba(${def.glow}, .11)`; ctx.lineWidth = 3; ctx.stroke();

    // Boots.
    const step = p.moving ? Math.sin(p.walk) * 5 : 0;
    ellipse(-7 + step, -7, 5.2, 3.2, '#1a2119', .1);
    ellipse(-7 - step, 7, 5.2, 3.2, '#1a2119', -.1);
    // Backpack.
    ctx.beginPath();
    ctx.roundRect(-15, -7, 10, 14, 3.5);
    ctx.fillStyle = def.dark; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    ctx.fillRect(-13, -4, 2, 7);
    // Torso.
    ctx.beginPath(); ctx.ellipse(-1, 0, 11, 8.7, 0, 0, TAU);
    ctx.fillStyle = def.mid; ctx.fill();
    ctx.strokeStyle = 'rgba(5,20,13,.65)'; ctx.lineWidth = 1.6; ctx.stroke();
    // Vest / shoulder.
    ctx.beginPath(); ctx.ellipse(-1, -1, 7.5, 6, 0, 0, TAU);
    ctx.fillStyle = def.main; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.23)'; ctx.lineWidth = 1; ctx.stroke();
    // Arms and crossbow.
    ctx.strokeStyle = '#2a2a20'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(2, 5); ctx.lineTo(12, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, -5); ctx.lineTo(13, -3); ctx.stroke();
    ctx.fillStyle = '#332b20';
    ctx.save();
    ctx.translate(12, 5); ctx.rotate(-.06);
    ctx.fillRect(0, -1.8, 17, 3.6);
    ctx.strokeStyle = '#b7a77e'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(25, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(3, 0, 4.4, -.9, .9); ctx.strokeStyle = def.main; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
    // Head and hat.
    ctx.beginPath(); ctx.arc(5, 0, 6.2, 0, TAU);
    ctx.fillStyle = '#e3b387'; ctx.fill();
    ctx.strokeStyle = 'rgba(43,26,14,.55)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(5, 0, 11.2, 8.2, 0, 0, TAU);
    ctx.fillStyle = def.dark; ctx.globalAlpha = .74; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.ellipse(5.5, 0, 6, 5.2, 0, 0, TAU);
    ctx.fillStyle = def.main; ctx.fill();
    ctx.beginPath(); ctx.ellipse(7, -3.1, 2.2, 1.6, 0, 0, TAU);
    ctx.fillStyle = 'rgba(247, 242, 210, .48)'; ctx.fill();
    // Tiny scarf trail.
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.quadraticCurveTo(-13, Math.sin(T() * 8 + p.index) * 3, -16, 1); ctx.strokeStyle = def.light; ctx.lineWidth = 1.5; ctx.stroke();
    // Cheek highlight.
    ctx.beginPath(); ctx.arc(7.2, 2.8, 1.1, 0, TAU); ctx.fillStyle = 'rgba(250, 210, 164, .8)'; ctx.fill();

    if (p.invuln > 0 && p.flash <= 0) {
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.strokeStyle = `rgba(${def.glow}, .22)`; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (p.flash > 0) {
      ctx.globalAlpha = p.flash * 2.6;
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Player nameplate.
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '900 8px "Trebuchet MS"';
    ctx.fillStyle = `rgba(${def.glow}, .9)`;
    ctx.fillText(`${p.name} · LV ${p.level}`, p.x, p.y - (p.index ? 38 : 29));
    ctx.restore();
  }

  function drawDownedPlayer(p) {
    const def = p.def;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle + Math.PI / 2);
    ctx.scale(1.12, 1.12);
    ctx.globalAlpha = .8;
    ellipse(0, 0, 15, 8, '#1b2a20', .2);
    ctx.fillStyle = p.def.dark;
    ctx.beginPath(); ctx.roundRect(-12, -5, 22, 10, 5); ctx.fill();
    ctx.beginPath(); ctx.arc(10, 0, 5.5, 0, TAU); ctx.fillStyle = '#d8ab7c'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    // Revive ring.
    const r = p.revive / 2.05;
    ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, TAU); ctx.strokeStyle = 'rgba(6,18,11,.56)'; ctx.lineWidth = 4; ctx.stroke();
    if (r > 0) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(r, 0, 1));
      ctx.strokeStyle = '#ffd176'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
    }
    ctx.font = '900 8px "Trebuchet MS"'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 238, 190, .92)'; ctx.fillText(r > 0 ? 'REVIVING' : 'REVIVE', p.x, p.y - 30);
    ctx.beginPath(); ctx.arc(p.x, p.y - 39, 2 + Math.sin(T() * 6) * .5, 0, TAU); ctx.fillStyle = '#ffce7b'; ctx.fill();
  }

  /* ---------------- Dinosaurs ---------------- */
  function drawEnemy(e) {
    const skin = SKINS[Math.floor(e.seed) % SKINS.length];
    shadow(e.x, e.y + (e.type === 'ptero' ? 28 : e.radius * .54), e.radius * 1.45, e.radius * .55, .42);
    ctx.save();
    ctx.translate(e.x, e.y + (e.type === 'ptero' ? -7 + Math.sin(T() * 4 + e.seed) * 4 : 0));
    ctx.rotate(e.angle);
    ctx.scale(1.16, 1.16);
    if (e.charging > 0) {
      ctx.beginPath(); ctx.arc(0, 0, e.radius + 16 + Math.sin(T() * 18) * 3, 0, TAU);
      ctx.strokeStyle = 'rgba(255, 78, 55, .5)'; ctx.lineWidth = 3; ctx.stroke();
    }
    if (e.type === 'raptor') drawRaptor(e, skin);
    else if (e.type === 'ptero') drawPtero(e, skin);
    else if (e.type === 'stego') drawStego(e, skin);
    else drawRex(e, skin);
    if (e.flash > 0) {
      ctx.globalAlpha = Math.min(.26, e.flash * 3.4);
      ctx.beginPath(); ctx.ellipse(0, 0, e.radius * 1.35, e.radius * .8, 0, 0, TAU);
      ctx.fillStyle = '#ffedc7'; ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (!e.boss && e.hp < e.maxHp) drawEnemyBar(e);
  }

  function drawRaptor(e, s) {
    const step = Math.sin(e.anim * 9 + e.seed) * 1;
    // Tail.
    ctx.beginPath();
    ctx.moveTo(-13, -2);
    ctx.quadraticCurveTo(-34, -8 + Math.sin(e.anim * 6) * 4, -54, 2 + Math.sin(e.anim * 6) * 6);
    ctx.quadraticCurveTo(-33, 3, -12, 6);
    ctx.closePath(); ctx.fillStyle = s.dark; ctx.fill();
    // Legs.
    ctx.strokeStyle = s.dark; ctx.lineWidth = 4.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-7, 5); ctx.lineTo(-4 + step * 5, 14); ctx.lineTo(2 + step * 5, 15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-9, -5); ctx.lineTo(-8 - step * 5, 12); ctx.lineTo(-2 - step * 5, 14); ctx.stroke();
    // Claws.
    ctx.strokeStyle = '#d8c9a0'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(2 + step * 5, 15); ctx.lineTo(6 + step * 5, 15); ctx.stroke();
    // Body.
    ctx.beginPath(); ctx.ellipse(-1, 0, 18, 9, -.05, 0, TAU);
    ctx.fillStyle = s.body; ctx.fill();
    ctx.strokeStyle = 'rgba(20,39,21,.5)'; ctx.lineWidth = 1.2; ctx.stroke();
    // Belly.
    ctx.beginPath(); ctx.ellipse(2, 3.2, 13, 4.2, -.08, 0, TAU); ctx.fillStyle = s.belly; ctx.globalAlpha = .75; ctx.fill(); ctx.globalAlpha = 1;
    // Stripes.
    ctx.strokeStyle = s.stripe; ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(-9 + i * 7, -7); ctx.quadraticCurveTo(-6 + i * 7, 0, -9 + i * 7, 5); ctx.stroke();
    }
    // Neck and head.
    ctx.beginPath();
    ctx.moveTo(13, -5);
    ctx.quadraticCurveTo(20, -7, 27, -3);
    ctx.lineTo(35, -1);
    ctx.quadraticCurveTo(39, 1, 34, 4);
    ctx.lineTo(25, 5);
    ctx.quadraticCurveTo(19, 7, 14, 4);
    ctx.closePath(); ctx.fillStyle = s.body; ctx.fill();
    ctx.strokeStyle = 'rgba(20,39,21,.55)'; ctx.lineWidth = 1; ctx.stroke();
    // Jaw.
    ctx.beginPath(); ctx.moveTo(24, 3); ctx.quadraticCurveTo(31, 5, 36, 2); ctx.strokeStyle = s.dark; ctx.lineWidth = 2.2; ctx.stroke();
    // Teeth.
    ctx.strokeStyle = '#eee2bd'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(31, 2); ctx.lineTo(32, 4); ctx.moveTo(34, 2); ctx.lineTo(35, 3.5); ctx.stroke();
    // Eye.
    const blink = Math.sin(T() * 1.7 + e.seed) > .97 ? .25 : 1;
    ctx.save(); ctx.scale(1, blink);
    ctx.beginPath(); ctx.arc(29, -2.4, 1.9, 0, TAU); ctx.fillStyle = s.eye; ctx.fill();
    ctx.beginPath(); ctx.arc(29.5, -2.4, .85, 0, TAU); ctx.fillStyle = '#202517'; ctx.fill();
    ctx.restore();
    // Dorsal spikes.
    ctx.fillStyle = s.dark;
    for (let i = 0; i < 4; i++) {
      const x = -10 + i * 6;
      ctx.beginPath(); ctx.moveTo(x, -7); ctx.lineTo(x + 2.5, -11); ctx.lineTo(x + 4.5, -6.5); ctx.fill();
    }
  }

  function drawPtero(e, s) {
    const flap = Math.sin(e.anim * 11 + e.seed);
    // Wings.
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(1, side);
      ctx.beginPath();
      ctx.moveTo(-4, -4);
      ctx.bezierCurveTo(-7, -22 - flap * 6, 16, -43 - flap * 9, 38, -30 - flap * 5);
      ctx.bezierCurveTo(25, -20, 15, -13, 9, -3);
      ctx.closePath();
      ctx.fillStyle = s.dark; ctx.fill();
      ctx.strokeStyle = 'rgba(11,32,21,.5)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-1, -5); ctx.bezierCurveTo(2, -18 - flap * 3, 18, -31 - flap * 5, 33, -26 - flap * 3);
      ctx.strokeStyle = 'rgba(214, 233, 175, .18)'; ctx.lineWidth = 1.1; ctx.stroke();
      ctx.restore();
    }
    // Tail.
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.quadraticCurveTo(-28, 4, -37, 0); ctx.quadraticCurveTo(-25, 7, -8, 5); ctx.fillStyle = s.dark; ctx.fill();
    // Body.
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 6.2, 0, 0, TAU); ctx.fillStyle = s.body; ctx.fill();
    ctx.strokeStyle = 'rgba(14,35,25,.55)'; ctx.lineWidth = 1; ctx.stroke();
    // Neck + head.
    ctx.beginPath();
    ctx.moveTo(9, -4); ctx.quadraticCurveTo(18, -7, 24, -2); ctx.lineTo(34, -1);
    ctx.lineTo(30, 4); ctx.quadraticCurveTo(20, 5, 11, 4); ctx.closePath();
    ctx.fillStyle = s.body; ctx.fill();
    // Crest.
    ctx.beginPath(); ctx.moveTo(17, -5); ctx.lineTo(9, -15); ctx.lineTo(21, -7); ctx.fillStyle = s.stripe; ctx.fill();
    // Beak.
    ctx.beginPath(); ctx.moveTo(33, -1); ctx.lineTo(42, 1); ctx.lineTo(32, 3.5); ctx.fillStyle = '#d6b869'; ctx.fill();
    // Eye.
    ctx.beginPath(); ctx.arc(26, -2, 1.5, 0, TAU); ctx.fillStyle = s.eye; ctx.fill();
    // Feet.
    ctx.strokeStyle = s.dark; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-4, 5); ctx.lineTo(-7, 11); ctx.moveTo(1, 5); ctx.lineTo(0, 11); ctx.stroke();
  }

  function drawStego(e, s) {
    const step = Math.sin(e.anim * 5 + e.seed) * .7;
    // Tail.
    ctx.beginPath();
    ctx.moveTo(-18, 0); ctx.quadraticCurveTo(-42, 4, -56, -9); ctx.quadraticCurveTo(-44, 10, -17, 8);
    ctx.fillStyle = s.dark; ctx.fill();
    // Tail spikes.
    ctx.fillStyle = '#d8c38b';
    ctx.beginPath(); ctx.moveTo(-50, -7); ctx.lineTo(-59, -15); ctx.lineTo(-47, -5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-52, 1); ctx.lineTo(-63, -2); ctx.lineTo(-49, 5); ctx.fill();
    // Legs.
    ctx.strokeStyle = s.dark; ctx.lineWidth = 6.5; ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(-12 * side + 5, 9); ctx.lineTo(-12 * side + 6 + step * 3, 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-12 * side - 2, 9); ctx.lineTo(-11 * side - 2 - step * 3, 20); ctx.stroke();
    }
    // Body.
    ctx.beginPath(); ctx.ellipse(0, 0, 29, 16, -.03, 0, TAU); ctx.fillStyle = s.body; ctx.fill();
    ctx.strokeStyle = 'rgba(20,39,21,.5)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(5, 6, 20, 7, -.05, 0, TAU); ctx.fillStyle = s.belly; ctx.globalAlpha = .6; ctx.fill(); ctx.globalAlpha = 1;
    // Back plates.
    for (let i = 0; i < 5; i++) {
      const x = -19 + i * 9;
      const h = 10 + (i === 2 ? 6 : i === 1 || i === 3 ? 2 : 0);
      ctx.beginPath(); ctx.moveTo(x - 5, -10); ctx.lineTo(x, -10 - h); ctx.lineTo(x + 5, -9);
      ctx.fillStyle = i % 2 ? '#9d8e56' : '#b3a467'; ctx.fill();
      ctx.strokeStyle = 'rgba(47,44,26,.5)'; ctx.lineWidth = .8; ctx.stroke();
    }
    // Neck/head.
    ctx.beginPath();
    ctx.moveTo(22, -7); ctx.quadraticCurveTo(31, -12, 38, -7); ctx.lineTo(47, -3);
    ctx.quadraticCurveTo(42, 4, 34, 5); ctx.quadraticCurveTo(28, 6, 23, 7); ctx.fillStyle = s.body; ctx.fill();
    ctx.beginPath(); ctx.arc(41, -2, 1.6, 0, TAU); ctx.fillStyle = s.eye; ctx.fill();
    ctx.strokeStyle = s.dark; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(43, 2); ctx.lineTo(48, 2); ctx.stroke();
    // Small back stripes.
    ctx.strokeStyle = s.stripe; ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-13 + i * 8, 6); ctx.lineTo(-11 + i * 8, 11); ctx.stroke(); }
  }

  function drawRex(e, s) {
    const step = Math.sin(e.anim * 5.4 + e.seed);
    const skin = { body: '#7f513a', dark: '#533325', belly: '#c8aa7f', stripe: '#49291e', eye: '#ffbb66' };
    // Tail.
    ctx.beginPath();
    ctx.moveTo(-31, -5); ctx.quadraticCurveTo(-75, 6, -98, -12); ctx.quadraticCurveTo(-70, 20, -30, 12);
    ctx.fillStyle = skin.dark; ctx.fill();
    // Legs.
    ctx.strokeStyle = skin.dark; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-10, 8); ctx.lineTo(-8 + step * 6, 27); ctx.lineTo(2 + step * 6, 34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-18, 4); ctx.lineTo(-21 - step * 6, 24); ctx.lineTo(-10 - step * 6, 31); ctx.stroke();
    // Toes.
    ctx.strokeStyle = '#d9c49b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(2 + step * 6, 34); ctx.lineTo(10 + step * 6, 34); ctx.moveTo(0 + step * 6, 35); ctx.lineTo(7 + step * 6, 37); ctx.stroke();
    // Body.
    ctx.beginPath(); ctx.ellipse(-4, 0, 38, 19, -.05, 0, TAU); ctx.fillStyle = skin.body; ctx.fill();
    ctx.strokeStyle = 'rgba(24,16,10,.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(2, 7, 26, 8.5, -.08, 0, TAU); ctx.fillStyle = skin.belly; ctx.globalAlpha = .68; ctx.fill(); ctx.globalAlpha = 1;
    // Spine ridges.
    ctx.fillStyle = skin.dark;
    for (let i = 0; i < 5; i++) {
      const x = -24 + i * 10;
      ctx.beginPath(); ctx.moveTo(x - 3, -15); ctx.lineTo(x, -21 - (i % 2) * 3); ctx.lineTo(x + 4, -14); ctx.fill();
    }
    // Tiny arms.
    ctx.strokeStyle = skin.dark; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(22, 7); ctx.quadraticCurveTo(30, 12, 33, 7); ctx.stroke();
    // Neck.
    ctx.beginPath();
    ctx.moveTo(22, -10); ctx.quadraticCurveTo(36, -17, 48, -12); ctx.lineTo(55, -8);
    ctx.quadraticCurveTo(50, 0, 38, 3); ctx.quadraticCurveTo(30, 5, 20, 5); ctx.fillStyle = skin.body; ctx.fill();
    // Head and jaw.
    ctx.beginPath();
    ctx.moveTo(43, -14); ctx.quadraticCurveTo(64, -16, 76, -7); ctx.lineTo(76, 2);
    ctx.quadraticCurveTo(66, 10, 48, 8); ctx.quadraticCurveTo(40, 6, 38, -2); ctx.closePath();
    ctx.fillStyle = skin.body; ctx.fill();
    ctx.strokeStyle = 'rgba(24,16,10,.5)'; ctx.lineWidth = 1.4; ctx.stroke();
    // Mouth.
    ctx.beginPath(); ctx.moveTo(47, 5); ctx.quadraticCurveTo(61, 8, 75, 1); ctx.strokeStyle = '#301b13'; ctx.lineWidth = 3; ctx.stroke();
    // Teeth.
    ctx.fillStyle = '#efe0b9';
    for (let i = 0; i < 4; i++) {
      const x = 52 + i * 6;
      ctx.beginPath(); ctx.moveTo(x, 5); ctx.lineTo(x + 2, 9); ctx.lineTo(x + 4, 5); ctx.fill();
    }
    // Eye.
    ctx.beginPath(); ctx.arc(59, -7, 2.7, 0, TAU); ctx.fillStyle = skin.eye; ctx.fill();
    ctx.beginPath(); ctx.arc(59.5, -7, 1.1, 0, TAU); ctx.fillStyle = '#1d130c'; ctx.fill();
    // Scars.
    ctx.strokeStyle = 'rgba(229, 193, 145, .28)'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(-14, -10); ctx.lineTo(-3, -3); ctx.moveTo(-12, -12); ctx.lineTo(-2, -6); ctx.stroke();
  }

  function drawEnemyBar(e) {
    const w = Math.max(22, e.radius * 1.8), h = 3.4;
    const x = e.x - w / 2, y = e.y - e.radius - 15;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 2); ctx.fillStyle = 'rgba(3,12,7,.72)'; ctx.fill();
    ctx.beginPath(); ctx.roundRect(x + .5, y + .5, (w - 1) * clamp(e.hp / e.maxHp, 0, 1), h - 1, 1.5);
    ctx.fillStyle = e.hp / e.maxHp < .3 ? '#ff7e5d' : '#a6cf6e'; ctx.fill();
    ctx.restore();
  }

  /* ---------------- Ground items & effects ---------------- */
  function drawPickups() {
    for (const o of state.pickups) {
      const bob = Math.sin(o.phase) * 2.2;
      const alpha = o.life < 3 ? 0.3 + 0.7 * Math.abs(Math.sin(o.life * 6)) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      shadow(o.x, o.y + 6, o.type === 'xp' ? 7 : 10, 3.5, .25);
      if (o.type === 'xp') {
        ctx.translate(o.x, o.y + bob - 3);
        ctx.rotate(Math.sin(o.phase * .7) * .15);
        ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, -2); ctx.lineTo(0, 8); ctx.lineTo(-6, -2); ctx.closePath();
        const g = ctx.createLinearGradient(0, -9, 0, 8);
        g.addColorStop(0, '#fff1b6'); g.addColorStop(.45, '#ffc85f'); g.addColorStop(1, '#cb7e25');
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(255, 247, 210, .55)'; ctx.lineWidth = .8; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-1.5, -5); ctx.lineTo(-1.5, 4); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke();
      } else {
        ctx.translate(o.x, o.y + bob - 2);
        ctx.strokeStyle = '#4f7d3d'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 8); ctx.quadraticCurveTo(-2, 0, 0, -2); ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const a = i * TAU / 3 + .4;
          ctx.beginPath(); ctx.arc(Math.cos(a) * 4.5, Math.sin(a) * 3 - 2, 3.7, 0, TAU); ctx.fillStyle = i % 2 ? '#e8514d' : '#c5373e'; ctx.fill();
          ctx.beginPath(); ctx.arc(Math.cos(a) * 4.5 - .8, Math.sin(a) * 3 - 3.6, 1.2, 0, TAU); ctx.fillStyle = 'rgba(255, 205, 170, .6)'; ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  function drawBullets() {
    ctx.save();
    for (const b of state.bullets) {
      const tail = 13;
      const bx = b.x - Math.cos(b.angle) * tail;
      const by = b.y - Math.sin(b.angle) * tail;
      const g = ctx.createLinearGradient(bx, by, b.x, b.y);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, b.color);
      ctx.strokeStyle = g; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x, b.y, 2.1, 0, TAU); ctx.fillStyle = '#fff9e0'; ctx.fill();
      ctx.beginPath(); ctx.arc(b.x, b.y, 7.5, 0, TAU); ctx.fillStyle = b.owner ? 'rgba(255, 183, 99, .15)' : 'rgba(126, 255, 187, .14)'; ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (const p of state.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawRings() {
    ctx.save();
    for (const r of state.rings) {
      const k = 1 - r.life / r.max;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.2 + k * 1.2), 0, TAU);
      ctx.strokeStyle = `rgba(${r.rgb}, ${(1 - k) * .7})`;
      ctx.lineWidth = 2.2 * (1 - k) + .4; ctx.stroke();
    }
    ctx.restore();
  }

  function drawTexts() {
    ctx.save();
    ctx.textAlign = 'center';
    for (const t of state.texts) {
      const a = clamp(t.life / t.max * 1.6, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = '900 12px "Trebuchet MS", sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(3,12,7,.72)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  function drawAmbient() {
    ctx.save();
    for (const a of world.ambient) {
      if (a.type === 'firefly') {
        const flicker = .3 + Math.max(0, Math.sin(T() * 1.8 + a.phase)) * .7;
        const x = a.x + Math.cos(T() * a.speed + a.phase) * 15;
        const y = a.y + Math.sin(T() * a.speed * 1.4 + a.phase) * 10;
        ctx.globalAlpha = flicker * .65;
        ctx.beginPath(); ctx.arc(x, y, a.r, 0, TAU); ctx.fillStyle = '#ffe18e'; ctx.fill();
        ctx.globalAlpha = flicker * .12;
        ctx.beginPath(); ctx.arc(x, y, a.r * 7, 0, TAU); ctx.fillStyle = '#ffe18e'; ctx.fill();
      } else {
        ctx.save();
        ctx.translate(a.x, a.y); ctx.rotate(a.rot);
        ctx.globalAlpha = .5;
        ctx.beginPath(); ctx.ellipse(0, 0, a.size * 1.5, a.size * .65, 0, 0, TAU);
        ctx.fillStyle = a.hue; ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /* ---------------- Scene ---------------- */
  function drawTerrain() {
    buildTreeLayers();
    if (!world.baseLayer) return;
    ctx.drawImage(world.baseLayer, 0, 0);
    // Living water glints.
    const t = T();
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i++) {
      const x = 1000 + Math.sin(t * .7 + i * 1.8) * 38 + i * 13;
      const y = 190 + Math.cos(t * .9 + i * 2.1) * 24 + (i % 3) * 12;
      ctx.globalAlpha = .07 + (i % 2) * .04;
      ctx.beginPath(); ctx.ellipse(x, y, 16 + i * 3, 1.5, -.2, 0, TAU); ctx.fillStyle = '#d6f3cf'; ctx.fill();
    }
    ctx.restore();
    // Boundary undergrowth.
    const g = ctx.createLinearGradient(0, 0, 0, 40);
    g.addColorStop(0, 'rgba(2,10,6,.66)'); g.addColorStop(1, 'rgba(2,10,6,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, D.W, 46);
    const g2 = ctx.createLinearGradient(0, D.H - 34, 0, D.H);
    g2.addColorStop(0, 'rgba(2,10,6,0)'); g2.addColorStop(1, 'rgba(2,10,6,.55)');
    ctx.fillStyle = g2; ctx.fillRect(0, D.H - 34, D.W, 34);
  }

  function drawWorld() {
    drawTerrain();
    drawPickups();
    const actors = [...state.players, ...state.enemies].sort((a, b) => a.y - b.y);
    for (const actor of actors) {
        if (actor.type) drawEnemy(actor); else drawPlayer(actor);
    }
    drawBullets();
    drawParticles();
    drawTreeCanopies();
    drawAmbient();
    drawRings();
    drawTexts();
  }

  function drawScreenFx() {
    const w = D.view.w, h = D.view.h;
    if (state.levelFlash > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, Math.max(w, h) * .72);
      g.addColorStop(0, `rgba(255, 216, 136, 0)`);
      g.addColorStop(.65, `rgba(255, 206, 108, ${state.levelFlash * .05})`);
      g.addColorStop(1, `rgba(255, 192, 80, ${state.levelFlash * .16})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    if (state.hurtFlash > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .22, w / 2, h / 2, Math.max(w, h) * .68);
      g.addColorStop(0, 'rgba(128, 8, 5, 0)');
      g.addColorStop(1, `rgba(154, 19, 9, ${state.hurtFlash * .34})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    const alive = state.players.filter(p => p && !p.downed);
    if (alive.length && state.mode === 'playing') {
      const lowest = Math.min(...alive.map(p => p.hp / p.maxHp));
      if (lowest < .32) {
        const pulse = .07 + (1 - lowest / .32) * .1 + Math.sin(T() * 4) * .025;
        const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .2, w / 2, h / 2, Math.max(w, h) * .65);
        g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(145, 12, 6, ${pulse})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
    }
  }


  function drawEdgeCues() {
    const v = D.view, cam = state.camera;
    if (!state.enemies.length) return;
    const narrow = v.w < 760;
    const padX = 28, top = narrow ? 86 : 92, bottom = narrow ? Math.max(180, v.h * 0.24) : 42;
    const cx = v.w / 2, cy = v.h / 2;
    for (const e of state.enemies) {
      if (e.dead) continue;
      const sx = (e.x - cam.x) * cam.zoom + cx;
      const sy = (e.y - cam.y) * cam.zoom + cy;
      if (sx > padX && sx < v.w - padX && sy > top && sy < v.h - bottom) continue;
      let dx = sx - cx, dy = sy - cy;
      const limitX = (v.w / 2 - padX) / Math.max(1, Math.abs(dx));
      const limitYTop = (cy - top) / Math.max(1, Math.abs(dy));
      const limitYBottom = (v.h - bottom - cy) / Math.max(1, Math.abs(-dy));
      let t = Math.min(limitX, Math.abs(dy) < .01 ? 1e9 : limitYTop, 1e9);
      if (dy > 0) t = Math.min(limitX, Math.abs(dy) < .01 ? 1e9 : limitYBottom);
      t = Math.min(t, 1);
      const px = cx + dx * t, py = cy + dy * t;
      const ang = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(px, py); ctx.rotate(ang);
      ctx.globalAlpha = .7;
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, 5); ctx.lineTo(-2, 0); ctx.lineTo(-5, -5); ctx.closePath();
      ctx.fillStyle = e.boss ? '#ff7858' : '#ffd28a'; ctx.fill();
      ctx.globalAlpha = .18;
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fillStyle = e.boss ? '#ff7858' : '#ffd28a'; ctx.fill();
      ctx.restore();
    }
  }

  D.render = function () {
    const view = D.view;
    if (!view.w || !view.h) return;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#07160e';
    ctx.fillRect(0, 0, view.w, view.h);
    const cam = state.camera;
    const shake = state.shake;
    const sx = shake ? D.rand(-shake, shake) : 0;
    const sy = shake ? D.rand(-shake, shake) : 0;
    ctx.save();
    ctx.translate(view.w / 2 + sx, view.h / 2 + sy);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    drawWorld();
    ctx.restore();
    drawEdgeCues();
    drawScreenFx();
  };
})();
