/* Dino Duo — boot, UI wiring and the animation loop. */
(() => {
  'use strict';
  const D = window.DD;
  const { state, ui, input, audio } = D;

  function resize() {
    const w = Math.max(320, window.innerWidth);
    const h = Math.max(320, window.innerHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    D.view.w = w; D.view.h = h; D.view.dpr = dpr;
    D.canvas.width = Math.round(w * dpr);
    D.canvas.height = Math.round(h * dpr);
    D.canvas.style.width = w + 'px';
    D.canvas.style.height = h + 'px';
    if (state.mode === 'menu') {
      state.camera.x = D.W / 2; state.camera.y = D.H / 2;
    }
  }

  function togglePause() {
    if (state.mode === 'playing') {
      state.mode = 'paused';
      input.keys.clear();
      input.touch[0].x = input.touch[0].y = 0;
      input.touch[1].x = input.touch[1].y = 0;
      document.querySelectorAll('.joystick-knob').forEach(k => k.style.transform = '');
      ui.pause.classList.remove('is-hidden');
      audio.play('click');
    } else if (state.mode === 'paused') {
      state.mode = 'playing';
      ui.pause.classList.add('is-hidden');
      audio.init();
      audio.play('click');
    }
  }

  function toMenu() {
    state.mode = 'menu';
    ui.pause.classList.add('is-hidden');
    ui.gameover.classList.add('is-hidden');
    D.showMenu();
  }

  function start() {
    ui.gameover.classList.add('is-hidden');
    ui.pause.classList.add('is-hidden');
    D.startGame();
    audio.play('click');
  }

  function gameOver() {
    ui.resultWave.textContent = String(state.wave);
    ui.resultScore.textContent = D.fmt(state.score);
    ui.resultLevels[0].textContent = String(state.players[0] ? state.players[0].level : 1);
    ui.resultLevels[1].textContent = String(state.players[1] ? state.players[1].level : 1);
    ui.overCopy.textContent = state.wave >= 6
      ? 'The island will tell stories about you.'
      : state.wave >= 4
        ? 'A titan still walks the island. For now.'
        : state.wave >= 2
          ? 'You made a dent in the food chain.'
          : 'The herd was hungrier than you were.';
    ui.best.textContent = D.fmt(state.best);
    document.body.classList.remove('is-playing');
    ui.gameover.classList.remove('is-hidden');
    input.keys.clear();
    ui.dashButtons.forEach(b => b.classList.remove('cooling'));
  }

  function bindEvents() {
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 120));
    window.addEventListener('keydown', (e) => {
      const blocked = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(e.code);
      if (blocked && state.mode !== 'menu') e.preventDefault();
      if (e.repeat) return;
      audio.init();
      input.keys.add(e.code);
      input.pressed.add(e.code);
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (state.mode === 'playing' || state.mode === 'paused') togglePause();
      } else if (e.code === 'Enter' && state.mode === 'menu') {
        start();
      } else if ((e.code === 'Enter' || e.code === 'Space') && state.mode === 'gameover') {
        start();
      }
    });
    window.addEventListener('keyup', (e) => input.keys.delete(e.code));
    window.addEventListener('blur', () => {
      input.keys.clear();
      input.touch[0].x = input.touch[0].y = 0;
      input.touch[1].x = input.touch[1].y = 0;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.mode === 'playing') togglePause();
    });

    ui.start.addEventListener('click', start);
    ui.again.addEventListener('click', start);
    ui.resume.addEventListener('click', togglePause);
    ui.quit.addEventListener('click', toMenu);
    ui.title.addEventListener('click', toMenu);
    ui.pauseBtn.addEventListener('click', togglePause);
    ui.sound.addEventListener('click', () => {
      audio.init();
      audio.setMuted(!audio.muted);
      ui.sound.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
      if (!audio.muted) audio.play('click');
    });

    D.onGameOver = gameOver;
  }

  function boot() {
    D.buildWorld();
    D.warmScene();
    D.setupTouch();
    bindEvents();
    resize();
    D.showMenu();
    // Bake the first frame before the title screen accepts input. This moves the
    // one-time canvas/compositor warm-up out of the player's first interaction.
    D.render();
    D.ctx.getImageData(0, 0, 1, 1);
    ui.sound.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
    ui.best.textContent = D.fmt(state.best);
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.034, Math.max(0, (now - last) / 1000));
      last = now;
      D.update(dt);
      D.render();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // Small, read-only-ish harness for automated smoke checks.
    window.__dinoDuo = {
      snapshot: () => ({
        mode: state.mode, wave: state.wave, score: state.score,
        enemies: state.enemies.length, pickups: state.pickups.length,
        players: state.players.map(p => ({ name: p.name, x: Math.round(p.x), y: Math.round(p.y), hp: Math.round(p.hp), level: p.level, xp: p.xp, downed: p.downed, multiShot: p.multiShot }))
      }),
      start: start,
      pause: togglePause,
      grantXp: (index, amount) => { if (state.players[index]) D.grantXp(state.players[index], amount); },
      spawn: (type) => D.spawnEnemy(type),
      hurt: (index, amount) => { if (state.players[index]) D.hurtPlayer(state.players[index], amount, null); },
      startWave: (n) => D.startWave(n)
    };
  }

  boot();
})();
