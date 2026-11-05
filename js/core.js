/* Dino Duo — shared core, world, audio and input.
   Tiny by design: no images, no libraries, no network requests. */
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const W = 1280, H = 820;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const fmt = n => Math.floor(n).toLocaleString('en-US');

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function angleDelta(a, b) {
    let d = (b - a + Math.PI) % TAU;
    if (d < 0) d += TAU;
    return d - Math.PI;
  }
  function norm(x, y) {
    const d = Math.hypot(x, y) || 1;
    return { x: x / d, y: y / d };
  }

  const $ = id => document.getElementById(id);
  const ui = {
    hud: $('hud'), menu: $('menu'), pause: $('pauseMenu'), gameover: $('gameOver'),
    start: $('startBtn'), resume: $('resumeBtn'), quit: $('quitBtn'), again: $('playAgainBtn'), title: $('titleBtn'),
    sound: $('soundBtn'), pauseBtn: $('pauseBtn'),
    cards: [$('card0'), $('card1')], names: [$('name0'), $('name1')], levels: [$('level0'), $('level1')],
    hp: [$('hp0'), $('hp1')], hpText: [$('hpText0'), $('hpText1')], xp: [$('xp0'), $('xp1')],
    dash: [$('dash0'), $('dash1')], wave: $('waveLabel'), waveSub: $('waveSub'),
    score: $('scoreLabel'), mobileScore: $('mobileScore'), boss: $('bossWrap'), bossBar: $('bossBar'),
    banner: $('banner'), bannerKick: $('bannerKicker'), bannerTitle: $('bannerTitle'), bannerSmall: $('bannerSmall'),
    toast: $('toastStack'), hint: $('hintBar'),
    best: $('bestScore'), resultWave: $('resultWave'), resultScore: $('resultScore'),
    resultLevels: [$('resultLevel0'), $('resultLevel1')], overCopy: $('overCopy'),
    touch: $('touchControls'), sticks: [$('stick0'), $('stick1')],
    dashButtons: Array.from(document.querySelectorAll('.dash-btn'))
  };

  const PLAYER_DEFS = [
    { name: 'MOSS', main: '#78f0b4', mid: '#21a97a', dark: '#0d5943', light: '#d7ffe8', glow: '120,240,180' },
    { name: 'EMBER', main: '#ffb35f', mid: '#d86d37', dark: '#77361d', light: '#ffe3bd', glow: '255,179,95' }
  ];
  const BOONS = [
    { id: 'rapid', name: 'Quick Draw', icon: '»', note: 'Fire rate up' },
    { id: 'power', name: 'Heavy Dart', icon: '◆', note: '+4 damage' },
    { id: 'vitality', name: 'Thick Hide', icon: '♥', note: '+20 max HP' },
    { id: 'fleet', name: 'Fleet Feet', icon: '≈', note: '+7% move speed' },
    { id: 'magnet', name: 'Amber Magnet', icon: '◎', note: 'Wider pickup range' },
    { id: 'regen', name: 'Second Wind', icon: '✚', note: 'Slow healing' }
  ];

  const baseState = () => ({
    mode: 'menu', time: 0, paused: false, score: 0, best: Number(localStorage.getItem('dinoduo.best') || 0),
    wave: 0, enemies: [], players: [], bullets: [], particles: [], pickups: [], texts: [], rings: [],
    spawnQueue: [], spawnTimer: 0, intermission: false, interTimer: 0,
    shake: 0, hurtFlash: 0, levelFlash: 0, gameOverDelay: 0, introTimer: 0,
    camera: { x: W / 2, y: H / 2, zoom: 1 }, dino: null, kills: 0
  });
  const state = baseState();

  /* ---------------- Audio ---------------- */
  const audio = {
    ac: null, master: null, muted: localStorage.getItem('dinoduo.muted') === '1',
    last: Object.create(null),
    init() {
      if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ac.destination);
    },
    setMuted(v) {
      this.muted = v;
      localStorage.setItem('dinoduo.muted', v ? '1' : '0');
      document.body.classList.toggle('is-muted', v);
      if (this.master) this.master.gain.setTargetAtTime(v ? 0 : 0.55, this.ac.currentTime, 0.02);
    },
    tone(freq, endFreq, dur, type, vol, when = 0) {
      if (!this.ac || this.muted) return;
      const t = this.ac.currentTime + when;
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(30, freq), t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol, freq, when = 0, q = 1) {
      if (!this.ac || this.muted) return;
      const t = this.ac.currentTime + when;
      const len = Math.floor(this.ac.sampleRate * dur);
      const buffer = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ac.createBufferSource(); src.buffer = buffer;
      const filter = this.ac.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = q;
      const g = this.ac.createGain(); g.gain.value = vol;
      src.connect(filter); filter.connect(g); g.connect(this.master);
      src.start(t);
    },
    play(name) {
      if (!this.ac || this.muted) return;
      const now = performance.now();
      if (this.last[name] && now - this.last[name] < 35) return;
      this.last[name] = now;
      if (name === 'shoot') this.tone(780, 310, 0.055, 'sine', 0.026);
      else if (name === 'hit') { this.tone(180, 92, 0.06, 'triangle', 0.045); this.noise(0.04, 0.022, 900); }
      else if (name === 'kill') { this.noise(0.13, 0.05, 420, 0, 0.7); this.tone(110, 55, 0.12, 'sine', 0.04); }
      else if (name === 'hurt') { this.tone(105, 48, 0.22, 'sawtooth', 0.055); this.noise(0.12, 0.04, 240, 0, 0.7); }
      else if (name === 'dash') { this.noise(0.13, 0.035, 1400, 0, 1.4); this.tone(300, 640, 0.09, 'sine', 0.014); }
      else if (name === 'pickup') this.tone(880, 1320, 0.07, 'sine', 0.023);
      else if (name === 'level') [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f * 1.01, 0.22, 'triangle', 0.035, i * 0.075));
      else if (name === 'revive') [392, 523, 659].forEach((f, i) => this.tone(f, f, 0.24, 'sine', 0.03, i * 0.08));
      else if (name === 'roar') { this.tone(78, 38, 0.55, 'sawtooth', 0.07); this.noise(0.5, 0.045, 150, 0, 0.7); }
      else if (name === 'click') this.tone(520, 700, 0.06, 'sine', 0.025);
      else if (name === 'wave') [330, 440, 554].forEach((f, i) => this.tone(f, f, 0.3, 'triangle', 0.025, i * 0.09));
      else if (name === 'gameover') [220, 174, 130].forEach((f, i) => this.tone(f, f * 0.96, 0.55, 'sawtooth', 0.035, i * 0.16));
    }
  };
  audio.setMuted(audio.muted);

  /* ---------------- World ---------------- */
  const world = { trees: [], terrain: null, leafTimer: 0, ambient: [] };

  function buildTerrain() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const rng = mulberry32(0x51d09a);

    g.fillStyle = '#102a1b';
    g.fillRect(0, 0, W, H);

    const base = g.createRadialGradient(W * 0.46, H * 0.36, 40, W * 0.5, H * 0.5, W * 0.8);
    base.addColorStop(0, '#2b5c34');
    base.addColorStop(0.38, '#214a2c');
    base.addColorStop(0.75, '#163722');
    base.addColorStop(1, '#0b2418');
    g.fillStyle = base; g.fillRect(0, 0, W, H);

    // Broad sunlit patches.
    for (let i = 0; i < 16; i++) {
      const x = rng() * W, y = rng() * H, r = 90 + rng() * 260;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      const light = rng() > 0.46;
      rg.addColorStop(0, light ? 'rgba(133, 176, 91, .10)' : 'rgba(4, 24, 14, .15)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }

    // Winding game trail.
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    const trail = new Path2D();
    trail.moveTo(638, 840);
    trail.bezierCurveTo(610, 720, 650, 640, 628, 548);
    trail.bezierCurveTo(600, 455, 455, 400, 410, 300);
    trail.bezierCurveTo(380, 232, 420, 150, 382, 60);
    g.strokeStyle = 'rgba(22, 17, 9, .2)'; g.lineWidth = 96; g.stroke(trail);
    g.strokeStyle = 'rgba(94, 77, 42, .22)'; g.lineWidth = 73; g.stroke(trail);
    g.strokeStyle = 'rgba(137, 112, 66, .12)'; g.lineWidth = 52; g.stroke(trail);
    g.restore();

    // Pond, with a stony lip.
    g.save();
    g.translate(1044, 208);
    const pond = new Path2D();
    pond.ellipse(0, 0, 133, 92, -0.18, 0, TAU);
    g.fillStyle = 'rgba(24, 21, 13, .35)';
    g.beginPath(); g.ellipse(4, 8, 145, 101, -0.18, 0, TAU); g.fill();
    g.fillStyle = '#143c39'; g.fill(pond);
    const water = g.createRadialGradient(-24, -26, 6, 0, 0, 128);
    water.addColorStop(0, 'rgba(108, 190, 159, .38)');
    water.addColorStop(0.45, 'rgba(34, 103, 89, .28)');
    water.addColorStop(1, 'rgba(5, 35, 31, .1)');
    g.fillStyle = water; g.fill(pond);
    g.strokeStyle = 'rgba(176, 205, 141, .17)'; g.lineWidth = 2; g.stroke(pond);
    for (let i = 0; i < 8; i++) {
      g.strokeStyle = `rgba(195, 239, 207, ${0.05 + rng() * 0.08})`;
      g.lineWidth = 1.4;
      g.beginPath(); g.ellipse(-40 + rng() * 80, -34 + rng() * 70, 12 + rng() * 40, 2 + rng() * 4, 0, 0, TAU); g.stroke();
    }
    g.restore();

    // Mossy stones.
    for (let i = 0; i < 34; i++) {
      const x = 40 + rng() * (W - 80), y = 40 + rng() * (H - 80);
      if (Math.hypot(x - 1044, y - 208) < 160) continue;
      const r = 3 + rng() * 11;
      g.fillStyle = 'rgba(6, 17, 11, .28)';
      g.beginPath(); g.ellipse(x + 3, y + 3, r * 1.15, r * 0.7, 0, 0, TAU); g.fill();
      g.fillStyle = `rgba(${86 + rng() * 30}, ${96 + rng() * 25}, ${72 + rng() * 20}, .65)`;
      g.beginPath(); g.ellipse(x, y, r, r * 0.72, rng(), 0, TAU); g.fill();
      g.fillStyle = 'rgba(132, 173, 111, .25)';
      g.beginPath(); g.ellipse(x - r * 0.2, y - r * 0.2, r * 0.62, r * 0.3, 0, 0, TAU); g.fill();
    }

    // Grass blades and tiny flowers.
    for (let i = 0; i < 1050; i++) {
      const x = 20 + rng() * (W - 40), y = 25 + rng() * (H - 45);
      const len = 2 + rng() * 7;
      g.strokeStyle = `rgba(${83 + rng() * 55}, ${125 + rng() * 55}, ${67 + rng() * 34}, ${0.16 + rng() * 0.26})`;
      g.lineWidth = 0.8 + rng() * 0.8;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (rng() - .5) * 4, y - len * .7, x + (rng() - .5) * 7, y - len); g.stroke();
    }
    for (let i = 0; i < 95; i++) {
      const x = 30 + rng() * (W - 60), y = 30 + rng() * (H - 60);
      const c1 = rng() > .5 ? 'rgba(246, 218, 139, .55)' : 'rgba(233, 145, 129, .38)';
      g.fillStyle = c1;
      g.beginPath(); g.arc(x, y, 1.2 + rng() * 1.3, 0, TAU); g.fill();
    }

    // Dark edges and a ring of undergrowth.
    const edge = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.7);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(2, 12, 8, .55)');
    g.fillStyle = edge; g.fillRect(0, 0, W, H);

    // Soft shafts of late-afternoon light.
    g.save();
    g.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i++) {
      const x = 120 + i * 250 + rng() * 90;
      const grad = g.createLinearGradient(x, 0, x - 170, H);
      grad.addColorStop(0, 'rgba(255, 220, 137, .055)');
      grad.addColorStop(1, 'rgba(255, 220, 137, 0)');
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 130, 0); g.lineTo(x - 170, H); g.lineTo(x - 330, H); g.closePath(); g.fill();
    }
    g.restore();

    world.terrain = c;
  }

  function buildTrees() {
    const rng = mulberry32(0xbadc0de);
    const trees = [];
    const avoid = [{ x: 585, y: 638, r: 160 }, { x: 735, y: 638, r: 160 }, { x: 640, y: 790, r: 140 }];
    function canPlace(x, y) {
      if (x < 62 || x > W - 62 || y < 62 || y > H - 52) return false;
      if (Math.hypot(x - 1044, y - 208) < 155) return false;
      for (const a of avoid) if (Math.hypot(x - a.x, y - a.y) < a.r) return false;
      for (const t of trees) if (Math.hypot(x - t.x, y - t.y) < 102) return false;
      return true;
    }
    const palette = ['broad', 'broad', 'palm', 'broad', 'fern', 'palm'];
    const fixed = [
      [126, 120, 1.12, 0], [240, 88, .9, 2], [88, 288, 1.03, 1], [152, 470, .86, 3],
      [56, 655, 1.1, 0], [288, 730, .82, 2], [410, 112, .95, 3], [512, 70, .83, 1],
      [742, 108, 1.03, 0], [855, 72, .8, 2], [1182, 128, 1.12, 3], [1214, 330, .9, 1],
      [1140, 518, 1.04, 0], [1190, 684, .86, 2], [1046, 744, 1.05, 3], [896, 750, .82, 1],
      [560, 764, .78, 2], [408, 468, .86, 0], [870, 468, .9, 3], [758, 328, .72, 1],
      [252, 356, .78, 2], [960, 338, .84, 0]
    ];
    fixed.forEach(([x, y, s, v]) => trees.push({ x, y, scale: s, variant: palette[v], phase: rng() * TAU, r: 8.5 * s }));
    for (let i = 0; i < 34; i++) {
      const x = 72 + rng() * (W - 144), y = 70 + rng() * (H - 135);
      if (!canPlace(x, y)) continue;
      trees.push({
        x, y, scale: .66 + rng() * .5, variant: palette[Math.floor(rng() * palette.length)],
        phase: rng() * TAU, r: 8.5 * (.66 + rng() * .2)
      });
      if (trees.length >= 31) break;
    }
    world.trees = trees.sort((a, b) => a.y - b.y);
  }

  function initAmbient() {
    const rng = mulberry32(0x1eaf);
    world.ambient = [];
    for (let i = 0; i < 24; i++) {
      world.ambient.push({
        type: 'firefly', x: 70 + rng() * (W - 140), y: 80 + rng() * (H - 160),
        phase: rng() * TAU, speed: .2 + rng() * .5, r: 1 + rng() * 1.4
      });
    }
    for (let i = 0; i < 9; i++) {
      world.ambient.push({
        type: 'leaf', x: rng() * W, y: rng() * H, vx: 5 + rng() * 12, vy: 7 + rng() * 14,
        rot: rng() * TAU, spin: (rng() - .5) * 2, size: 2 + rng() * 2.5, hue: rng() > .5 ? '#9bae58' : '#c39a50'
      });
    }
  }

  /* ---------------- Input ---------------- */
  const input = {
    keys: new Set(), pressed: new Set(), touch: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
    dash: [false, false],
    down(code) { return this.keys.has(code); }
  };

  function setupTouch() {
    ui.sticks.forEach((stick, index) => {
      let active = null, rect = null;
      const knob = stick.querySelector('.joystick-knob');
      const move = (e) => {
        if (e.pointerId !== active || !rect) return;
        let dx = e.clientX - (rect.left + rect.width / 2);
        let dy = e.clientY - (rect.top + rect.height / 2);
        const limit = rect.width * 0.31;
        const len = Math.hypot(dx, dy);
        if (len > limit) { dx = dx / len * limit; dy = dy / len * limit; }
        input.touch[index].x = dx / limit;
        input.touch[index].y = dy / limit;
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      };
      stick.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        active = e.pointerId; rect = stick.getBoundingClientRect();
        stick.setPointerCapture?.(e.pointerId);
        move(e);
      });
      stick.addEventListener('pointermove', move);
      const end = (e) => {
        if (e.pointerId !== active) return;
        active = null; rect = null;
        input.touch[index].x = 0; input.touch[index].y = 0;
        knob.style.transform = '';
      };
      stick.addEventListener('pointerup', end);
      stick.addEventListener('pointercancel', end);
      stick.addEventListener('lostpointercapture', end);
    });
    ui.dashButtons.forEach((button) => {
      const index = Number(button.dataset.player);
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        audio.init();
        input.dash[index] = true;
        button.classList.add('pressed');
      });
      button.addEventListener('pointerup', () => button.classList.remove('pressed'));
      button.addEventListener('pointercancel', () => button.classList.remove('pressed'));
    });
  }

  function updateAmbient(dt) {
    world.leafTimer -= dt;
    if (world.leafTimer <= 0) {
      world.leafTimer = .7 + Math.random() * .9;
      const t = world.trees[Math.floor(Math.random() * world.trees.length)];
      world.ambient.push({
        type: 'leaf', x: t.x + (Math.random() - .5) * 60, y: t.y - 38 + (Math.random() - .5) * 20,
        vx: 7 + Math.random() * 9, vy: 10 + Math.random() * 12, rot: Math.random() * TAU,
        spin: (Math.random() - .5) * 2.5, size: 2 + Math.random() * 2.3,
        hue: Math.random() > .5 ? '#9bae58' : '#c39a50', life: 12
      });
    }
    for (const a of world.ambient) {
      if (a.type === 'leaf') {
        a.x += (a.vx + Math.sin(state.time + a.rot) * 7) * dt;
        a.y += a.vy * dt;
        a.rot += a.spin * dt;
        if (a.life != null) a.life -= dt;
        if (a.y > H + 20 || a.life < 0) { a.y = -20; a.x = 60 + Math.random() * (W - 120); if (a.life != null) a.life = 12; }
      }
    }
    let leaves = 0;
    world.ambient = world.ambient.filter(a => {
      if (a.type !== 'leaf') return true;
      leaves++;
      return leaves <= 22;
    });
  }

  window.DD = {
    canvas, ctx, W, H, TAU, clamp, lerp, rand, dist, fmt, mulberry32, angleDelta, norm,
    ui, PLAYER_DEFS, BOONS, state, audio, world, input,
    PLAY: { l: 54, r: W - 54, t: 58, b: H - 50 },
    view: { w: 0, h: 0, dpr: 1 },
    buildWorld() { buildTerrain(); buildTrees(); initAmbient(); },
    updateAmbient, setupTouch
  };
})();
