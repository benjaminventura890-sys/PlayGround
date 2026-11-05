/* Dino Duo — simulation: waves, combat, leveling and co-op revives. */
(() => {
  'use strict';
  const D = window.DD;
  const { state, ui, input, audio, world } = D;
  const { clamp, lerp, rand, dist, fmt, TAU, angleDelta, norm } = D;
  const PLAY = D.PLAY;

  const DINO = {
    raptor: { hp: 40, speed: 116, radius: 17, damage: 9, xp: 12, score: 60, name: 'RAPTOR' },
    ptero: { hp: 30, speed: 158, radius: 13, damage: 8, xp: 14, score: 80, name: 'PTERO' },
    stego: { hp: 150, speed: 65, radius: 28, damage: 16, xp: 30, score: 150, name: 'STEGO' },
    rex: { hp: 620, speed: 53, radius: 44, damage: 28, xp: 100, score: 900, name: 'TITAN', boss: true }
  };

  function createPlayer(index, x, y) {
    const def = D.PLAYER_DEFS[index];
    return {
      index, name: def.name, def, x, y, radius: 14,
      hp: 100, maxHp: 100, level: 1, xp: 0, xpNext: 30,
      speed: 174, damage: 10, fireDelay: 0.58, fireCd: 0.28,
      bulletSpeed: 545, multiShot: 1, pierce: 0, pickupRadius: 132,
      angle: -Math.PI / 2, aim: -Math.PI / 2, fireAngle: -Math.PI / 2,
      moveX: 0, moveY: 0, moving: false, walk: 0,
      dashCd: 0, dashCdMax: 2.35, dashTime: 0, dashVX: 0, dashVY: 0,
      invuln: 0, regen: 0, flash: 0, downed: false, revive: 0,
      shots: 0, trail: [], lastMove: { x: 0, y: -1 }, respawnShield: 0
    };
  }

  function createEnemy(type, x, y, wave, idle = false) {
    const def = DINO[type];
    const scale = idle ? 1 : 1 + (wave - 1) * (def.boss ? 0.2 : 0.135);
    const hp = Math.round(def.hp * scale);
    return {
      type, def, x, y, radius: def.radius, hp, maxHp: hp,
      speed: def.speed * (idle ? 1 : 1 + (wave - 1) * 0.012),
      damage: def.damage * (idle ? 1 : 1 + (wave - 1) * 0.06),
      angle: rand(0, TAU), anim: rand(0, TAU), walk: rand(0, 10), seed: rand(0, 100),
      flash: 0, attackCd: 0, dead: false, idle, boss: !!def.boss, fly: type === 'ptero',
      chargeCd: 4.2 + rand(0, 2), charging: 0, hitStop: 0, targetId: -1,
      bossPhase: Math.random() * TAU, lunge: 0
    };
  }

  function startGame() {
    audio.init();
    audio.play('click');
    state.mode = 'playing';
    state.time = 0;
    state.score = 0;
    state.wave = 0;
    state.enemies = []; state.bullets = []; state.particles = []; state.pickups = [];
    state.texts = []; state.rings = []; state.spawnQueue = []; state.spawnTimer = 0;
    state.intermission = false; state.interTimer = 0; state.gameOverDelay = 0;
    state.shake = 0; state.hurtFlash = 0; state.levelFlash = 0; state.dino = null;
    state.kills = 0; state.hintTimer = 9; state.introTimer = 0;
    state.players = [createPlayer(0, 586, 638), createPlayer(1, 704, 638)];
    state.camera.x = D.W / 2; state.camera.y = D.H / 2;
    D.cameraLocked = false;
    ui.menu.classList.add('is-hidden');
    ui.gameover.classList.add('is-hidden');
    ui.pause.classList.add('is-hidden');
    ui.hud.classList.remove('is-hidden');
    ui.toast.innerHTML = '';
    ui.hint.classList.remove('fade');
    document.body.classList.remove('is-muted');
    document.body.classList.add('is-playing');
    state.players.forEach(p => { p.aim = -Math.PI / 2; p.angle = -Math.PI / 2; });
    startWave(1);
    updateHUD();
  }

  function showMenu() {
    state.mode = 'menu';
    state.enemies = []; state.bullets = []; state.particles = []; state.pickups = [];
    state.texts = []; state.rings = []; state.spawnQueue = [];
    state.players = [createPlayer(0, 488, 606), createPlayer(1, 660, 622)];
    state.players[0].angle = -0.7; state.players[0].aim = -0.7;
    state.players[1].angle = -2.2; state.players[1].aim = -2.2;
    state.enemies = [
      createEnemy('raptor', 956, 346, 1, true),
      createEnemy('raptor', 1046, 554, 2, true),
      createEnemy('stego', 1110, 402, 2, true),
      createEnemy('ptero', 854, 206, 2, true)
    ];
    state.enemies[0].angle = 2.6;
    state.enemies[1].angle = 2.9;
    state.enemies[2].angle = 2.45;
    state.enemies[3].angle = 3.4;
    state.time = 0;
    state.shake = 0; state.hurtFlash = 0; state.levelFlash = 0;
    state.camera.x = D.W / 2; state.camera.y = D.H / 2;
    ui.hud.classList.add('is-hidden');
    ui.menu.classList.remove('is-hidden');
    ui.gameover.classList.add('is-hidden');
    ui.pause.classList.add('is-hidden');
    ui.toast.innerHTML = '';
    ui.best.textContent = fmt(state.best || Number(localStorage.getItem('dinoduo.best') || 0));
    document.body.classList.remove('is-playing');
    updateHUD();
  }

  function startWave(n) {
    state.wave = n;
    state.intermission = false;
    state.spawnTimer = 0;
    state.spawnQueue = buildWave(n);
    const boss = n % 4 === 0;
    showBanner(`WAVE ${n}`, boss ? 'A titan stirs' : waveTagline(n), boss ? 'Its footsteps shake the island.' : 'The herd found your camp.');
    audio.play(boss ? 'roar' : 'wave');
    if (boss) state.shake = Math.max(state.shake, 8);
  }

  function waveTagline(n) {
    return ['Keep moving', 'They travel in packs', 'Hold the clearing', 'Watch the trees', 'No sign of rescue', 'The herd grows bold', 'Stand together'][Math.min(6, Math.max(0, n - 1))];
  }

  function buildWave(n) {
    const list = [];
    const raptors = Math.min(2 + Math.ceil(n * 1.15), 9);
    const pteros = n >= 2 ? Math.min(1 + Math.floor(n / 2), 5) : 0;
    const stegos = n >= 3 ? Math.min(1 + Math.floor((n - 3) / 2), 4) : 0;
    if (n % 4 === 0) list.push('rex');
    for (let i = 0; i < raptors; i++) list.push('raptor');
    for (let i = 0; i < pteros; i++) list.push('ptero');
    for (let i = 0; i < stegos; i++) list.push('stego');
    return list.map((type, i) => ({ type, at: 0.08 + i * (type === 'rex' ? 1.3 : 0.58), near: i < 2 && type !== 'rex' })).sort((a, b) => a.at - b.at);
  }

  function findSpawn(type, radius, near) {
    const boss = type === 'rex';
    for (let attempt = 0; attempt < 60; attempt++) {
      let x, y;
      if (boss) { x = 640 + rand(-140, 140); y = 178; }
      else if (near) {
        const alive = state.players.filter(p => !p.downed);
        const centre = alive.length ? alive[Math.floor(rand(0, alive.length))] : { x: 640, y: 540 };
        // Keep ambush spawns above or below the squad so they arrive on-screen
        // even on a narrow phone viewport.
        const a = (Math.random() < 0.5 ? -Math.PI / 2 : Math.PI / 2) + rand(-0.72, 0.72);
        const d = rand(275, 350);
        x = clamp(centre.x + Math.cos(a) * d, 100, D.W - 100);
        y = clamp(centre.y + Math.sin(a) * d, 110, D.H - 100);
      } else {
        const side = Math.floor(rand(0, 4));
        if (side === 0) { x = rand(90, D.W - 90); y = rand(82, 180); }
        else if (side === 1) { x = rand(D.W - 160, D.W - 82); y = rand(120, D.H - 100); }
        else if (side === 2) { x = rand(90, D.W - 90); y = rand(D.H - 150, D.H - 85); }
        else { x = rand(82, 160); y = rand(120, D.H - 100); }
      }
      if (!near && state.players.some(p => !p.downed && Math.hypot(p.x - x, p.y - y) < 250)) continue;
      if (near && state.players.some(p => !p.downed && Math.hypot(p.x - x, p.y - y) < 230)) continue;
      let blocked = false;
      for (const t of world.trees) {
        if (Math.hypot(t.x - x, t.y - y) < t.r + radius + 24) { blocked = true; break; }
      }
      if (!blocked) return { x, y };
    }
    return near ? { x: 480, y: 380 } : { x: 640, y: 160 };
  }

  function spawnEnemy(type, near = false) {
    const spawn = findSpawn(type, DINO[type].radius, near);
    const e = createEnemy(type, spawn.x, spawn.y, state.wave);
    if (e.boss) {
      state.dino = e;
      state.shake = 20;
      showBanner('TITAN', 'The earth splits', 'Break line of sight. Keep firing.');
      audio.play('roar');
    }
    state.enemies.push(e);
    spawnRing(spawn.x, spawn.y, e.boss ? 92 : 48, e.boss ? '255,96,68' : '196,236,165');
    for (let i = 0; i < (e.boss ? 28 : 10); i++) {
      const a = rand(0, TAU), s = rand(30, e.boss ? 160 : 70);
      addParticle(spawn.x, spawn.y, Math.cos(a) * s, Math.sin(a) * s, e.boss ? '#ff9f74' : '#b8d59d', rand(0.3, 0.7), rand(1, 3));
    }
    return e;
  }

  /* ---------------- Update ---------------- */
  function update(dt) {
    state.time += dt;
    if (state.mode === 'menu') {
      updateParticles(dt);
      updateRings(dt);
      D.updateAmbient(dt);
      D.updateCamera(dt);
      return;
    }
    updateParticles(dt);
    updateRings(dt);
    updateTexts(dt);
    D.updateAmbient(dt);
    state.shake = Math.max(0, state.shake - dt * 30);
    state.hurtFlash = Math.max(0, state.hurtFlash - dt * 2.4);
    state.levelFlash = Math.max(0, state.levelFlash - dt * 2.4);
    if (state.mode === 'playing') {
      updateGame(dt);
      updatePickups(dt);
    }
    if (state.mode === 'playing' || state.mode === 'paused') updateHUD();
    D.updateCamera(dt);
    updateHint(dt);
    if (state.mode === 'paused' && input.pressed.size) input.pressed.clear();
    input.pressed.clear();
    input.dash[0] = false; input.dash[1] = false;
  }

  function updateHint(dt) {
    if (state.hintTimer == null) return;
    state.hintTimer -= dt;
    if (state.hintTimer <= 0) ui.hint.classList.add('fade');
  }

  function updateGame(dt) {
    for (const p of state.players) updatePlayer(p, dt);
    for (const e of state.enemies) updateEnemy(e, dt);
    updateBullets(dt);
    state.enemies = state.enemies.filter(e => !e.dead);

    if (state.spawnQueue.length) {
      state.spawnTimer += dt;
      while (state.spawnQueue.length && state.spawnQueue[0].at <= state.spawnTimer) {
        const next = state.spawnQueue.shift(); spawnEnemy(next.type, next.near);
      }
    }

    const anyDown = state.players.every(p => p.downed);
    if (anyDown) {
      if (state.gameOverDelay <= 0) {
        state.gameOverDelay = 1.15;
        showBanner('THE HERD WINS', 'Both rangers are down', 'The island keeps its secrets.');
        audio.play('gameover');
      } else {
        state.gameOverDelay -= dt;
        if (state.gameOverDelay <= 0) endGame();
      }
      return;
    }

    if (!state.intermission && !state.spawnQueue.length && !state.enemies.length) {
      state.intermission = true;
      state.interTimer = 3.1;
      state.score += state.wave * 100;
      for (const p of state.players) {
        if (!p.downed) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.08);
      }
      showBanner('HERD CLEARED', `Wave ${state.wave} survived`, `+${state.wave * 100} score · next wave incoming`);
      audio.play('wave');
    }

    if (state.intermission) {
      state.interTimer -= dt;
      if (state.interTimer <= 0) startWave(state.wave + 1);
    }
  }

  function updatePlayer(p, dt) {
    p.fireCd -= dt;
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.dashTime = Math.max(0, p.dashTime - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.flash = Math.max(0, p.flash - dt);
    p.walk += dt * (p.moving ? 10 : 2.4);

    if (p.downed) {
      const mate = state.players.find(o => o !== p && !o.downed);
      if (mate && dist(p, mate) < 74) {
        p.revive += dt;
        if (Math.random() < dt * 14) {
          addParticle(p.x + rand(-12, 12), p.y + rand(-12, 12), rand(-8, 8), rand(-28, -10), '#ffd489', .6, rand(1, 2.4));
        }
        if (p.revive >= 2.05) revivePlayer(p);
      } else {
        p.revive = Math.max(0, p.revive - dt * 0.4);
      }
      return;
    }

    p.regen > 0 && (p.hp = Math.min(p.maxHp, p.hp + p.regen * dt));

    let mx = 0, my = 0;
    if (p.index === 0) {
      if (input.down('KeyA')) mx -= 1;
      if (input.down('KeyD')) mx += 1;
      if (input.down('KeyW')) my -= 1;
      if (input.down('KeyS')) my += 1;
    } else {
      if (input.down('ArrowLeft')) mx -= 1;
      if (input.down('ArrowRight')) mx += 1;
      if (input.down('ArrowUp')) my -= 1;
      if (input.down('ArrowDown')) my += 1;
    }
    const touch = input.touch[p.index];
    if (Math.hypot(touch.x, touch.y) > 0.08) {
      mx = touch.x; my = touch.y;
    }
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }
    p.moving = Math.hypot(mx, my) > 0.12;
    p.moveX = mx; p.moveY = my;
    if (p.moving) p.lastMove = norm(mx, my);

    const dashKey = p.index === 0 ? 'Space' : 'Enter';
    const wantsDash = input.pressed.has(dashKey) || (p.index === 1 && input.pressed.has('NumpadEnter')) || input.dash[p.index];
    if (wantsDash && p.dashCd <= 0 && p.dashTime <= 0) {
      let dx = mx, dy = my;
      if (Math.hypot(dx, dy) < 0.2) { dx = p.lastMove.x; dy = p.lastMove.y; }
      const nd = norm(dx, dy);
      p.dashVX = nd.x * 700; p.dashVY = nd.y * 700;
      p.dashTime = 0.17; p.dashCd = p.dashCdMax; p.invuln = Math.max(p.invuln, 0.28);
      spawnRing(p.x, p.y, 26, p.index ? '255,179,95' : '120,240,180');
      audio.play('dash');
    }

    let vx = mx * p.speed, vy = my * p.speed;
    if (p.dashTime > 0) { vx = p.dashVX; vy = p.dashVY; }
    if (Math.abs(vx) + Math.abs(vy) > 1) {
      const oldX = p.x, oldY = p.y;
      moveWithCollision(p, vx * dt, vy * dt, p.radius);
      if (p.dashTime > 0 && Math.random() < dt * 40) {
        addParticle(lerp(oldX, p.x, Math.random()), lerp(oldY, p.y, Math.random()), rand(-8, 8), rand(-8, 8), p.index ? '#ffb35f' : '#78f0b4', .28, rand(1, 2.4));
      }
    }

    const target = nearestEnemy(p, 445);
    if (target) {
      const lead = 0.04 + dist(p, target) / 2600;
      const tx = target.x + Math.cos(target.angle) * target.speed * lead * (target.idle ? 0 : 1);
      const ty = target.y + Math.sin(target.angle) * target.speed * lead * (target.idle ? 0 : 1);
      const desired = Math.atan2(ty - p.y, tx - p.x);
      p.aim += angleDelta(p.aim, desired) * Math.min(1, dt * 12);
      if (p.fireCd <= 0) fireAt(p, target);
    } else if (p.moving) {
      p.aim += angleDelta(p.aim, Math.atan2(my, mx)) * Math.min(1, dt * 6);
    }
    p.angle = p.aim;

    if (p.hp <= 0) downPlayer(p);
  }

  function nearestEnemy(p, range) {
    let best = null, bestD = range;
    for (const e of state.enemies) {
      if (e.dead) continue;
      const d = dist(p, e) - e.radius;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  function fireAt(p, target) {
    p.fireCd = p.fireDelay;
    p.shots++;
    p.fireAngle = Math.atan2(target.y - p.y, target.x - p.x);
    const count = p.multiShot;
    const spread = 0.105;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * spread;
      const a = p.fireAngle + offset;
      const sx = p.x + Math.cos(a) * 22, sy = p.y + Math.sin(a) * 22;
      state.bullets.push({
        x: sx, y: sy, vx: Math.cos(a) * p.bulletSpeed, vy: Math.sin(a) * p.bulletSpeed,
        angle: a, speed: p.bulletSpeed, life: 1.45, damage: p.damage, owner: p.index,
        pierce: p.pierce, hit: new Set(), target: target, radius: 4,
        color: p.index ? '#ffc27a' : '#a8ffcf', trail: 0
      });
      addParticle(sx, sy, Math.cos(a) * 24, Math.sin(a) * 24, p.index ? '#ffd9a5' : '#d7ffe8', .16, rand(1, 2.2));
    }
    addParticle(p.x + Math.cos(p.fireAngle) * 24, p.y + Math.sin(p.fireAngle) * 24, 0, 0, p.index ? '#ffb35f' : '#78f0b4', .12, 5);
    audio.play('shoot');
  }

  function updateBullets(dt) {
    for (const b of state.bullets) {
      b.life -= dt;
      b.trail += dt;
      if (b.target && !b.target.dead) {
        const desired = Math.atan2(b.target.y - b.y, b.target.x - b.x);
        b.angle += clamp(angleDelta(b.angle, desired), -4.8 * dt, 4.8 * dt);
        b.vx = Math.cos(b.angle) * b.speed;
        b.vy = Math.sin(b.angle) * b.speed;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 0 || b.x > D.W || b.y < 0 || b.y > D.H) b.life = 0;
      if (b.life <= 0) continue;
      for (const e of state.enemies) {
        if (e.dead || b.hit.has(e)) continue;
        if (Math.hypot(b.x - e.x, b.y - e.y) < e.radius + b.radius + 2) {
          hitEnemy(e, b.damage, b.owner, b.x, b.y, b.angle);
          b.hit.add(e);
          if (b.pierce > 0) b.pierce--; else b.life = 0;
          break;
        }
      }
    }
    state.bullets = state.bullets.filter(b => b.life > 0);
  }

  function hitEnemy(e, damage, owner, x, y, angle) {
    e.hp -= damage;
    e.flash = 0.075;
    e.x += Math.cos(angle) * (e.boss ? 2 : 5);
    e.y += Math.sin(angle) * (e.boss ? 2 : 5);
    addText(x, y - e.radius * 0.6, String(Math.round(damage)), owner ? '#ffc98b' : '#bdffdd', 0.55);
    for (let i = 0; i < 5; i++) {
      const a = angle + Math.PI + rand(-1.2, 1.2);
      addParticle(x, y, Math.cos(a) * rand(20, 100), Math.sin(a) * rand(20, 100), i % 2 ? '#f2dfab' : '#8b4f33', rand(0.2, 0.5), rand(1, 2.7));
    }
    state.shake = Math.max(state.shake, e.boss ? 3 : 1.4);
    audio.play('hit');
    if (e.hp <= 0) killEnemy(e, owner);
  }

  function killEnemy(e, owner) {
    if (e.dead) return;
    e.dead = true;
    state.kills++;
    state.score += e.def.score;
    const pieces = e.boss ? 44 : 16;
    for (let i = 0; i < pieces; i++) {
      const a = rand(0, TAU), s = rand(20, e.boss ? 250 : 130);
      addParticle(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, i % 3 === 0 ? '#f4dd9d' : (e.boss ? '#b55036' : '#6a8b4d'), rand(0.35, 0.95), rand(1.2, e.boss ? 5 : 3.4));
    }
    spawnRing(e.x, e.y, e.boss ? 120 : 42, e.boss ? '255,126,86' : '236,218,160');
    state.shake = Math.max(state.shake, e.boss ? 18 : 4);
    addText(e.x, e.y - 28, `+${e.def.score}`, '#ffe7a3', 0.85);
    audio.play('kill');
    if (e.boss) {
      showBanner('TITAN DOWN', 'The island goes quiet', '+900 score');
      state.dino = null;
    }
    const orbCount = e.boss ? 6 : Math.min(3, 1 + Math.floor(e.def.xp / 9));
    for (let i = 0; i < orbCount; i++) {
      const a = rand(0, TAU), sp = rand(40, 130);
      state.pickups.push({
        type: 'xp', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        value: Math.max(1, Math.round(e.def.xp / orbCount)), age: 0, life: 40, radius: 5,
        phase: rand(0, TAU), pull: false
      });
    }
    if (!e.boss && Math.random() < 0.075) {
      state.pickups.push({ type: 'berry', x: e.x, y: e.y, vx: rand(-30, 30), vy: rand(-30, 30), value: 22, age: 0, life: 40, radius: 8, phase: rand(0, TAU), pull: false });
    }
  }

  function updateEnemy(e, dt) {
    e.flash = Math.max(0, e.flash - dt);
    e.attackCd = Math.max(0, e.attackCd - dt);
    e.anim += dt;
    if (e.boss) {
      e.chargeCd -= dt;
      if (e.chargeCd <= 0 && e.charging <= 0) {
        e.charging = 0.85; e.chargeCd = 5.4 + rand(0, 1.2);
        spawnRing(e.x, e.y, 85, '255,88,64');
        state.shake = Math.max(state.shake, 12);
        audio.play('roar');
      }
      e.charging = Math.max(0, e.charging - dt);
    }
    const alive = state.players.filter(p => !p.downed);
    if (!alive.length) return;
    let target = alive[0], bestD = Infinity;
    for (const p of alive) { const d = dist(e, p); if (d < bestD) { bestD = d; target = p; } }
    e.targetId = target.index;
    let dx = target.x - e.x, dy = target.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;

    if (e.type === 'ptero') {
      const t = state.time * 2.2 + e.seed;
      const px = -dy, py = dx;
      dx += px * Math.sin(t) * 0.36;
      dy += py * Math.sin(t) * 0.36;
    } else if (e.type === 'raptor') {
      const px = -dy, py = dx;
      dx += px * Math.sin(state.time * 3.4 + e.seed) * 0.21;
      dy += py * Math.sin(state.time * 3.4 + e.seed) * 0.21;
    }

    let avoidX = 0, avoidY = 0;
    if (!e.fly) {
      for (const t of world.trees) {
        const ox = e.x - t.x, oy = e.y - t.y;
        const od = Math.hypot(ox, oy) || 1;
        const reach = t.r + e.radius + 48;
        if (od < reach) {
          const force = (reach - od) / reach;
          avoidX += ox / od * force * 1.7;
          avoidY += oy / od * force * 1.7;
        }
      }
    }
    for (const other of state.enemies) {
      if (other === e || other.dead) continue;
      const ox = e.x - other.x, oy = e.y - other.y;
      const od = Math.hypot(ox, oy) || 1;
      const reach = e.radius + other.radius + 14;
      if (od < reach) {
        const f = (reach - od) / reach;
        avoidX += ox / od * f * 0.8;
        avoidY += oy / od * f * 0.8;
      }
    }
    let ndx = dx + avoidX, ndy = dy + avoidY;
    const nm = Math.hypot(ndx, ndy) || 1;
    ndx /= nm; ndy /= nm;
    e.angle += angleDelta(e.angle, Math.atan2(ndy, ndx)) * Math.min(1, dt * 8);
    const speedMult = e.charging > 0 ? 2.7 : 1;
    const sp = e.speed * speedMult;
    moveWithCollision(e, ndx * sp * dt, ndy * sp * dt, e.radius, e.type === 'ptero');
    e.walk += dt * (2 + sp * 0.025);

    if (d < e.radius + target.radius + 4 && e.attackCd <= 0) {
      e.attackCd = e.boss ? 1.05 : 0.8;
      hurtPlayer(target, e.damage, e);
      const k = e.boss ? 34 : 18;
      moveWithCollision(target, (target.x - e.x) / d * k, (target.y - e.y) / d * k, target.radius);
    }
  }

  function hurtPlayer(p, amount, source) {
    if (p.invuln > 0 || p.downed) return;
    p.invuln = 0.82;
    p.flash = 0.18;
    p.hp -= amount;
    state.hurtFlash = Math.min(1, state.hurtFlash + 0.5);
    state.shake = Math.max(state.shake, source && source.boss ? 14 : 7);
    addText(p.x, p.y - 26, `-${Math.round(amount)}`, '#ff8f76', 0.65);
    spawnRing(p.x, p.y, 20, '255,93,76');
    for (let i = 0; i < 8; i++) {
      const a = rand(0, TAU);
      addParticle(p.x, p.y, Math.cos(a) * rand(20, 90), Math.sin(a) * rand(20, 90), '#ff8d74', rand(.22, .5), rand(1, 2.8));
    }
    audio.play('hurt');
    if (p.hp <= 0) downPlayer(p);
  }

  function downPlayer(p) {
    if (p.downed) return;
    p.downed = true;
    p.hp = 0;
    p.revive = 0;
    p.dashTime = 0;
    p.invuln = 2;
    state.shake = Math.max(state.shake, 12);
    spawnRing(p.x, p.y, 56, p.index ? '255,179,95' : '120,240,180');
    for (let i = 0; i < 18; i++) {
      const a = rand(0, TAU);
      addParticle(p.x, p.y, Math.cos(a) * rand(20, 120), Math.sin(a) * rand(20, 120), '#f0dcc0', rand(.3, .8), rand(1, 3));
    }
    const mate = state.players.find(o => o !== p);
    if (mate && !mate.downed) {
      showBanner(`${p.name} IS DOWN`, 'Get to your partner', 'Stand close for two seconds to revive.');
    }
  }

  function revivePlayer(p) {
    p.downed = false;
    p.hp = p.maxHp * 0.55;
    p.revive = 0;
    p.invuln = 1.7;
    p.respawnShield = 1.7;
    const mate = state.players.find(o => o !== p);
    if (mate && !mate.downed) {
      grantXp(mate, 16);
      mate.hp = Math.min(mate.maxHp, mate.hp + 12);
    }
    spawnRing(p.x, p.y, 60, p.index ? '255,179,95' : '120,240,180');
    addText(p.x, p.y - 34, 'BACK UP', p.index ? '#ffc27a' : '#a8ffcf', 1);
    showBanner(`${p.name} REVIVED`, 'Stay close', 'Shared health, shared fate.');
    audio.play('revive');
  }

  function grantXp(p, amount, quiet = false) {
    if (p.downed) return;
    p.xp += amount;
    if (!quiet) addText(p.x, p.y - 19, `+${amount} XP`, 'rgba(255,227,160,.92)', 0.55);
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = Math.round(28 * Math.pow(p.level, 1.38));
      levelUp(p);
    }
  }

  function levelUp(p) {
    p.maxHp += 6;
    p.hp = Math.min(p.maxHp, p.hp + 18);
    p.damage += 1;
    let boon;
    if (p.level === 3) {
      p.multiShot = 2;
      boon = { name: 'Twin Darts', icon: '⋔', note: 'Your bow splits in two' };
    } else if (p.level === 5) {
      p.pierce = 1;
      boon = { name: 'Bone Piercer', icon: '➶', note: 'Darts punch through one dino' };
    } else if (p.level === 7) {
      p.multiShot = 3;
      boon = { name: 'Triple Flight', icon: '≡', note: 'Three darts per shot' };
    } else if (p.level === 9) {
      p.pierce = 2;
      boon = { name: 'Island Ballista', icon: '➹', note: 'Darts pierce even deeper' };
    } else {
      boon = D.BOONS[Math.floor(Math.random() * D.BOONS.length)];
      applyBoon(p, boon);
    }
    p.flash = 0.25;
    state.levelFlash = Math.min(1, state.levelFlash + 0.6);
    state.shake = Math.max(state.shake, 3);
    spawnRing(p.x, p.y, 64, p.index ? '255,192,110' : '170,255,207');
    for (let i = 0; i < 28; i++) {
      const a = rand(0, TAU), s = rand(30, 170);
      addParticle(p.x, p.y, Math.cos(a) * s, Math.sin(a) * s, i % 2 ? '#ffe3a0' : (p.index ? '#ffb35f' : '#78f0b4'), rand(.4, .9), rand(1, 3.8));
    }
    showLevelToast(p, boon);
    audio.play('level');
  }

  function applyBoon(p, boon) {
    if (boon.id === 'rapid') p.fireDelay = Math.max(0.18, p.fireDelay * 0.87);
    else if (boon.id === 'power') p.damage += 4;
    else if (boon.id === 'vitality') { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 25); }
    else if (boon.id === 'fleet') p.speed *= 1.07;
    else if (boon.id === 'magnet') p.pickupRadius += 44;
    else if (boon.id === 'regen') { p.regen = Math.min(1.4, p.regen + 0.32); p.hp = Math.min(p.maxHp, p.hp + 20); }
  }

  function updatePickups(dt) {
    for (const orb of state.pickups) {
      orb.age += dt; orb.life -= dt;
      orb.phase += dt * 3;
      let nearest = null, nearD = Infinity;
      for (const p of state.players) {
        if (p.downed) continue;
        const d = dist(orb, p);
        if (d < nearD) { nearD = d; nearest = p; }
      }
      if (nearest && (nearD < nearest.pickupRadius || orb.pull || orb.age > 0.6)) {
        orb.pull = true;
        const n = norm(nearest.x - orb.x, nearest.y - orb.y);
        const accel = 1050;
        orb.vx += n.x * accel * dt;
        orb.vy += n.y * accel * dt;
        const speed = Math.hypot(orb.vx, orb.vy);
        if (speed > 640) { orb.vx = orb.vx / speed * 640; orb.vy = orb.vy / speed * 640; }
      } else {
        orb.vx *= 0.93; orb.vy *= 0.93;
      }
      orb.x += orb.vx * dt; orb.y += orb.vy * dt;
      orb.x = clamp(orb.x, 20, D.W - 20); orb.y = clamp(orb.y, 20, D.H - 20);
      if (nearest && nearD < nearest.radius + 15) {
        if (orb.type === 'xp') {
          grantXp(nearest, orb.value);
          for (const mate of state.players) {
            if (mate !== nearest && !mate.downed) grantXp(mate, Math.ceil(orb.value * 0.8), true);
          }
          orb.life = 0; audio.play('pickup');
        }
        else {
          nearest.hp = Math.min(nearest.maxHp, nearest.hp + orb.value);
          addText(nearest.x, nearest.y - 30, `+${orb.value} HP`, '#a8ffcf', .7);
          spawnRing(nearest.x, nearest.y, 24, '160,255,190'); orb.life = 0; audio.play('pickup');
        }
        for (let i = 0; i < 6; i++) addParticle(orb.x, orb.y, rand(-40, 40), rand(-40, 40), orb.type === 'xp' ? '#ffd16a' : '#ff7b74', .3, rand(1, 2.2));
      }
    }
    state.pickups = state.pickups.filter(o => o.life > 0);
  }

  function moveWithCollision(e, dx, dy, radius, flying) {
    e.x = clamp(e.x + dx, PLAY.l + radius, PLAY.r - radius);
    e.y = clamp(e.y + dy, PLAY.t + radius, PLAY.b - radius);
    if (flying) return;
    for (const t of world.trees) {
      const ox = e.x - t.x, oy = e.y - t.y;
      const d = Math.hypot(ox, oy) || 0.001;
      const min = t.r + radius * 0.58;
      if (d < min) {
        e.x = t.x + ox / d * min;
        e.y = t.y + oy / d * min;
      }
    }
  }

  function endGame() {
    state.mode = 'gameover';
    state.gameOverDelay = 0;
    const best = Math.max(state.best || 0, state.score);
    state.best = best;
    try { localStorage.setItem('dinoduo.best', String(best)); } catch {}
    if (D.onGameOver) D.onGameOver();
  }

  /* ---------------- Effects ---------------- */
  function addParticle(x, y, vx, vy, color, life, size) {
    if (state.particles.length > 360) state.particles.shift();
    state.particles.push({ x, y, vx, vy, color, life, max: life, size, drag: rand(.88, .95), gravity: rand(0, 24) });
  }
  function spawnRing(x, y, r, rgb) {
    state.rings.push({ x, y, r, life: 0.5, max: 0.5, rgb });
  }
  function addText(x, y, text, color, life) {
    if (state.texts.length > 50) state.texts.shift();
    state.texts.push({ x, y, text, color, life, max: life, vy: -26 });
  }
  function updateParticles(dt) {
    for (const p of state.particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.pow(p.drag, dt * 60); p.vy = p.vy * Math.pow(p.drag, dt * 60) + p.gravity * dt;
    }
    state.particles = state.particles.filter(p => p.life > 0);
  }
  function updateRings(dt) {
    for (const r of state.rings) r.life -= dt;
    state.rings = state.rings.filter(r => r.life > 0);
  }
  function updateTexts(dt) {
    for (const t of state.texts) { t.life -= dt; t.y += t.vy * dt; t.vy *= 0.96; }
    state.texts = state.texts.filter(t => t.life > 0);
  }

  /* ---------------- DOM / camera ---------------- */
  let lastLevel = [-1, -1];
  let lastDown = [false, false];
  function updateHUD() {
    for (let i = 0; i < 2; i++) {
      const p = state.players[i];
      if (!p) continue;
      const hp = clamp(p.hp / p.maxHp, 0, 1);
      ui.hp[i].style.width = `${hp * 100}%`;
      ui.hp[i].style.background = hp < .3 ? 'linear-gradient(90deg,#ff594d,#ff9f7a)' : '';
      ui.hpText[i].textContent = String(Math.max(0, Math.ceil(p.hp)));
      ui.xp[i].style.width = `${clamp(p.xp / p.xpNext, 0, 1) * 100}%`;
      if (lastLevel[i] !== p.level) { ui.levels[i].textContent = `LV ${p.level}`; lastLevel[i] = p.level; }
      if (lastDown[i] !== p.downed) { ui.cards[i].classList.toggle('downed', p.downed); lastDown[i] = p.downed; }
      const cooling = p.dashCd > 0.05;
      ui.dash[i].classList.toggle('cooling', cooling);
      D.ui.dashButtons[i].classList.toggle('cooling', cooling || p.downed);
    }
    ui.score.textContent = fmt(state.score);
    ui.mobileScore.textContent = `SCORE ${fmt(state.score)}`;
    ui.wave.textContent = `WAVE ${Math.max(1, state.wave)}`;
    if (state.intermission) ui.waveSub.textContent = `NEXT WAVE IN ${Math.max(0, Math.ceil(state.interTimer))}s`;
    else if (state.spawnQueue.length) ui.waveSub.textContent = `${state.enemies.length + state.spawnQueue.length} DINOS INBOUND`;
    else ui.waveSub.textContent = state.enemies.length ? `${state.enemies.length} DINOS LEFT` : 'CLEAR THE HERD';
    const boss = state.enemies.find(e => e.boss && !e.dead);
    const showBoss = !!boss;
    ui.boss.classList.toggle('is-hidden', !showBoss);
    if (boss) ui.bossBar.style.width = `${clamp(boss.hp / boss.maxHp, 0, 1) * 100}%`;
  }

  function showBanner(kicker, title, small) {
    ui.bannerKick.textContent = kicker;
    ui.bannerTitle.textContent = title;
    ui.bannerSmall.textContent = small || '';
    ui.banner.classList.remove('show');
    void ui.banner.offsetWidth;
    ui.banner.classList.add('show');
  }

  function showLevelToast(p, boon) {
    const el = document.createElement('div');
    el.className = 'level-toast' + (p.index ? ' is-p2' : '');
    el.innerHTML = `<div class="lvl-badge">${p.level}</div><div class="lvl-copy"><b>${p.name} · LEVEL ${p.level}</b><span>${boon.name} — ${boon.note}</span></div><div class="lvl-icon">${boon.icon}</div>`;
    ui.toast.appendChild(el);
    while (ui.toast.children.length > 3) ui.toast.firstChild.remove();
    window.setTimeout(() => el.remove(), 3200);
  }

  function updateCamera(dt) {
    const w = D.view.w, h = D.view.h;
    if (!w || !h) return;
    const fixed = (w / h > 1.5) || (w >= 900 && w / h > 1.1);
    let targetZoom;
    if (fixed) targetZoom = Math.max(w / D.W, h / D.H) * 1.008;
    else targetZoom = Math.max(w / 620, h / 980);
    targetZoom = clamp(targetZoom, 0.55, 1.9);
    const cam = state.camera;
    cam.zoom = lerp(cam.zoom || targetZoom, targetZoom, Math.min(1, dt * 6));
    let tx = D.W / 2, ty = D.H / 2;
    if (!fixed && state.players && state.players.length) {
      const alive = state.players.filter(p => !p.downed);
      const list = alive.length ? alive : state.players;
      tx = list.reduce((s, p) => s + p.x, 0) / list.length;
      ty = list.reduce((s, p) => s + p.y, 0) / list.length;
    }
    const vw = w / cam.zoom, vh = h / cam.zoom;
    if (vw < D.W) tx = clamp(tx, vw / 2, D.W - vw / 2); else tx = D.W / 2;
    if (vh < D.H) ty = clamp(ty, vh / 2, D.H - vh / 2); else ty = D.H / 2;
    cam.x = lerp(cam.x, tx, Math.min(1, dt * 5));
    cam.y = lerp(cam.y, ty, Math.min(1, dt * 5));
  }

  D.createPlayer = createPlayer;
  D.createEnemy = createEnemy;
  D.startGame = startGame;
  D.showMenu = showMenu;
  D.startWave = startWave;
  D.update = update;
  D.updateCamera = updateCamera;
  D.updateHUD = updateHUD;
  D.updatePickups = updatePickups;
  D.moveWithCollision = moveWithCollision;
  D.grantXp = grantXp;
  D.levelUp = levelUp;
  D.hurtPlayer = hurtPlayer;
  D.spawnEnemy = spawnEnemy;
  D.DINO = DINO;
  D.showBanner = showBanner;
  D.updateEffects = (dt) => { updateParticles(dt); updateRings(dt); updateTexts(dt); };
})();
