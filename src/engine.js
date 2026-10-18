// Motor de Capo: carga una obra, saca de la imagen dónde se puede pisar,
// mueve a Capo con física propia y dibuja sus poses.
// Lo usan el juego (index.html) y la mesa de trabajo (mesa.html).
window.CapoEngine = (function () {
  // Las obras fotografiadas miden 720×826. Los niveles armados por piezas (built) traen su propio tamaño.
  const PW = 720, PH = 826, CELL = 4;
  let W = PW, H = PH, COLS = PW / CELL, ROWS = Math.ceil(PH / CELL);
  function setDims(w, h) { W = w; H = h; COLS = Math.ceil(w / CELL); ROWS = Math.ceil(h / CELL); }

  const LEVELS = {
    color: { src: 'assets/levels/color.jpg', start: { x: 70, y: 690 }, name: 'Líneas de color' },
    negro: { src: 'assets/levels/negro.jpg', start: { x: 470, y: 740 }, name: 'Línea negra' }
  };

  // Celdas de 4px marcadas como pintura cuando el color se aleja del papel.
  // 1 = pintura, 2 = pintura azul (rebota).
  function sampleImage(img) {
    setDims(PW, PH);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data;
    const rs = [], gs = [], bs = [];
    for (let i = 0; i < d.length; i += 4 * 997) { rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); }
    const med = a => a.sort((p, q) => p - q)[a.length >> 1];
    const pr = med(rs), pg = med(gs), pb = med(bs);
    const m = new Uint8Array(COLS * ROWS);
    for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
      let hit = 0, blue = 0, n = 0;
      for (let yy = 0; yy < CELL; yy++) for (let xx = 0; xx < CELL; xx++) {
        const px = cc * CELL + xx, py = r * CELL + yy;
        if (py >= H) continue;
        const i = (py * W + px) * 4; n++;
        const R = d[i], G = d[i + 1], B = d[i + 2];
        if (Math.hypot(R - pr, G - pg, B - pb) > 105) { hit++; if (B > R + 40 && B > G + 10) blue++; }
      }
      if (n && hit / n >= 0.5) m[r * COLS + cc] = blue > hit * 0.5 ? 2 : 1;
    }
    return m;
  }

  // Nivel armado: cada pieza ocupa sus celdas. 2 = rebote.
  function buildMask(L) {
    const m = new Uint8Array(COLS * ROWS), g = L.grid / CELL;
    for (const p of L.platforms) {
      const v = p.t === 'rebote' ? 2 : 1;
      const r0 = Math.round(p.y * g), r1 = Math.min(ROWS, Math.round((p.y + (p.h || 1)) * g));
      const c0 = Math.max(0, Math.round(p.x * g)), c1 = Math.min(COLS, Math.round((p.x + p.w) * g));
      for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) if (!m[r * COLS + c] || r === r0) m[r * COLS + c] = v;
    }
    return m;
  }

  // Solo importan los bordes de arriba: Capo pisa la parte superior de cada trazo
  // y atraviesa los trazos desde abajo.
  function surfaces(mask) {
    const tops = [];
    for (let c = 0; c < COLS; c++) {
      const col = [];
      for (let r = 0; r < ROWS; r++) {
        const v = mask[r * COLS + c];
        if (v && (r === 0 || !mask[(r - 1) * COLS + c])) col.push({ y: r * CELL, b: v === 2 });
      }
      tops.push(col);
    }
    return tops;
  }

  const pick = (arr, prev) => {
    if (!arr || !arr.length) return prev;
    let n, guard = 0;
    do { n = arr[(Math.random() * arr.length) | 0]; } while (n === prev && arr.length > 1 && guard++ < 10);
    return n;
  };

  function create(opts) {
    const parent = opts.parent;
    let cfg = opts.cfg;
    const on = opts.on || (() => {});
    const input = { l: false, r: false, jump: false, jumpPressed: false };
    let scene, player, fx, dbg, bg, capoImg, camTarget, frames = {};
    let sprite = null, spriteMeta = null;
    let tops = [], masks = {}, particles = [], showSurf = false, ready = false, built = [];
    let levelId = new URLSearchParams(location.search).get('nivel') || cfg.level;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    function viewSize() {
      const r = parent.getBoundingClientRect();
      return { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
    }
    const vs0 = viewSize();

    const game = new Phaser.Game({
      type: Phaser.AUTO, parent,
      width: vs0.w * dpr, height: vs0.h * dpr,
      backgroundColor: opts.background || '#141519',
      scale: { mode: Phaser.Scale.NONE },
      render: { antialias: true },
      scene: { preload, create: createScene, update }
    });

    function styleCanvas() {
      const v = viewSize();
      game.canvas.style.width = v.w + 'px';
      game.canvas.style.height = v.h + 'px';
      game.canvas.style.display = 'block';
    }
    // El zoom de juego se mide siempre contra el ancho de una obra, así Capo se ve igual en todos los niveles.
    const playZoom = () => viewSize().w * dpr * cfg.camera.zoom / PW;
    const isBuilt = () => !!(LEVELS[levelId] && LEVELS[levelId].built);
    const fullZoom = () => {
      const v = viewSize();
      return isBuilt() ? v.h * dpr / H : Math.min(v.w * dpr / W, v.h * dpr / H);
    };

    function resize() {
      if (!scene) return;
      const v = viewSize();
      game.scale.resize(v.w * dpr, v.h * dpr);
      scene.cameras.main.setSize(v.w * dpr, v.h * dpr);
      styleCanvas();
      scene.cameras.main.setZoom(player && player.dancing ? fullZoom() : playZoom());
    }

    function preload() {
      for (const id in LEVELS) {
        const L = LEVELS[id];
        if (L.built) for (const ly of L.layers) this.load.image('lvl-' + id + '-' + ly.key, ly.src);
        else this.load.image('lvl-' + id, L.src);
      }
      this.load.image('capo', 'assets/capo/atlas.png');
      this.load.json('capo-frames', 'assets/capo/frames.json');
    }

    function createScene() {
      scene = this;
      styleCanvas();
      frames = this.cache.json.get('capo-frames') || {};
      const tex = this.textures.get('capo');
      for (const n in frames) { const q = frames[n]; tex.add(n, 0, q[0], q[1], q[2], q[3]); }
      const firstPhoto = Object.keys(LEVELS).find(k => !LEVELS[k].built);
      bg = this.add.image(0, 0, 'lvl-' + firstPhoto).setOrigin(0).setDisplaySize(PW, PH).setDepth(-30);
      dbg = this.add.graphics().setDepth(10);
      fx = this.add.graphics().setDepth(11);
      capoImg = this.add.image(0, 0, 'capo', cfg.capo.idle).setOrigin(0.5, 1).setDepth(12);
      camTarget = this.add.zone(0, 0, 1, 1);
      player = {
        x: 0, feet: 0, vx: 0, vy: 0, grounded: false, coyote: 0, buffer: 0, dir: 1, phase: 0,
        squash: 1, squashV: 0, airT: 0, idleT: 0, spin: 0, rot: 0,
        dancing: false, danceT: 0, beat: 0, danceFrame: cfg.capo.dance[0]
      };
      const cam = this.cameras.main;
      cam.setBounds(0, 0, W, H).setZoom(playZoom()).startFollow(camTarget, true, 0.12, 0.12);
      setLevel(levelId);
      ready = true;
      on('ready');
    }

    function setLevel(id) {
      if (!LEVELS[id]) id = 'color';
      levelId = id;
      if (!scene) return;
      built.forEach(o => o.destroy()); built = [];
      const L = LEVELS[id];
      if (L.built) {
        setDims(L.w, L.h);
        bg.setVisible(false);
        buildScene(id, L);
        if (!masks[id]) masks[id] = buildMask(L);
      } else {
        bg.setVisible(true).setTexture('lvl-' + id).setDisplaySize(PW, PH);
        if (!masks[id]) masks[id] = sampleImage(scene.textures.get('lvl-' + id).getSourceImage());
        setDims(PW, PH);
      }
      scene.cameras.main.setBounds(0, 0, W, H);
      tops = surfaces(masks[id]);
      respawn();
      if (player.dancing) stopDance();
    }

    // Capas de fondo con parallax y las plataformas pintadas en canvas.
    // Las plataformas se parten en tiras de 1440 px porque varios celulares no aceptan texturas de más de 4096.
    function buildScene(id, L) {
      L.layers.forEach((ly, i) => {
        const key = 'lvl-' + id + '-' + ly.key;
        const src = scene.textures.get(key).getSourceImage();
        const t = scene.add.tileSprite(0, ly.bottom - ly.height, W, ly.height, key)
          .setOrigin(0).setTileScale(ly.height / src.height)
          .setScrollFactor(ly.parallax, 1).setAlpha(ly.alpha == null ? 1 : ly.alpha).setDepth(-20 + i);
        built.push(t);
      });
      const STRIP = 1440;
      for (let x0 = 0; x0 < W; x0 += STRIP) {
        const key = 'plat-' + id + '-' + x0;
        if (!scene.textures.exists(key)) {
          const c = document.createElement('canvas');
          c.width = Math.min(STRIP, W - x0); c.height = H;
          const ctx = c.getContext('2d');
          ctx.translate(-x0, 0);
          L.paint(ctx);
          scene.textures.addCanvas(key, c);
        }
        built.push(scene.add.image(x0, 0, key).setOrigin(0).setDepth(-5));
      }
    }

    function respawn() {
      const s = LEVELS[levelId].start;
      Object.assign(player, { x: s.x, feet: s.y, vx: 0, vy: 0, grounded: false, coyote: 0, spin: 0, rot: 0 });
      if (camTarget) { camTarget.setPosition(s.x, s.y - 50); scene.cameras.main.centerOn(s.x, s.y - 50); }
    }

    function findSurface(x, from, to) {
      let best = null;
      const c0 = Math.max(0, Math.floor((x - 6) / CELL)), c1 = Math.min(COLS - 1, Math.floor((x + 6) / CELL));
      for (let c = c0; c <= c1; c++) for (const s of tops[c]) {
        if (s.y >= from && s.y <= to && (!best || s.y < best.y)) best = s;
      }
      return best;
    }

    function dust(x, y, n, col) {
      for (let i = 0; i < n; i++) particles.push({
        x: x + (Math.random() - 0.5) * 14, y, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 90,
        life: 0.5 + Math.random() * 0.3, t: 0, col: col || 0x3a3a40
      });
    }

    function update(time, deltaMs) {
      if (!player) return;
      const dt = Math.min(deltaMs / 1000, 1 / 30);
      const p = player, F = cfg.feel;

      if (p.dancing) { danceStep(dt); draw(dt); return; }

      const ax = (input.r ? 1 : 0) - (input.l ? 1 : 0);
      if (ax) p.dir = ax;
      const acc = p.grounded ? 2600 : 1600;
      const target = ax * F.speed;
      p.vx += Math.sign(target - p.vx) * Math.min(Math.abs(target - p.vx), acc * dt);

      if (input.jumpPressed) { p.buffer = 0.13; input.jumpPressed = false; }
      p.buffer -= dt; p.coyote -= dt;
      if (p.buffer > 0 && (p.grounded || p.coyote > 0)) {
        p.vy = -F.jump; p.grounded = false; p.coyote = 0; p.buffer = 0; p.squashV = -3.2;
        dust(p.x, p.feet, 5); on('jump');
      }

      let g = F.grav;
      if (p.vy < 0 && !input.jump) g *= 2.2;
      if (Math.abs(p.vy) < 60 && !p.grounded) g *= 0.6;
      p.vy = Math.min(p.vy + g * dt, 1150);
      p.x = Phaser.Math.Clamp(p.x + p.vx * dt, 8, W - 8);

      const nf = p.feet + p.vy * dt;
      if (p.vy >= 0) {
        const s = findSurface(p.x, p.feet - (p.grounded ? 10 : 2), nf + (p.grounded ? 12 : 0));
        if (s) {
          if (!p.grounded) {
            const impact = p.vy;
            if (s.b && impact > 120) {
              p.feet = s.y;
              p.vy = -Math.min(Math.max(F.jump * F.bounce, impact * 1.06), 1250);
              p.squash = 0.62; p.squashV = 4; p.spin = 1; p.rot = 0;
              dust(p.x, s.y, 10, 0x1d66ad); on('bounce');
            } else {
              p.feet = s.y; p.vy = 0; p.grounded = true;
              p.squash = Math.max(0.7, 1 - impact / 2600); p.squashV = 0;
              if (impact > 260) { dust(p.x, s.y, Math.min(12, impact / 80 | 0)); on('land', impact); }
            }
          } else { p.feet = s.y; p.vy = 0; }
        } else {
          if (p.grounded) p.coyote = cfg.feel.coyote / 1000;
          p.grounded = false; p.feet = nf;
        }
      } else { p.grounded = false; p.feet = nf; }

      if (p.feet > H + 90) respawn();

      if (p.grounded) {
        p.airT = 0;
        if (Math.abs(p.vx) < 12 && !ax) p.idleT += dt; else p.idleT = 0;
        if (p.spin) { p.spin = 0; p.rot = 0; }
      } else { p.airT += dt; p.idleT = 0; }
      if (p.spin > 0) { p.rot += dt * Math.PI * 2 / 0.6; if (p.rot >= Math.PI * 2) { p.rot = 0; p.spin = 0; } }

      p.squashV += (1 - p.squash) * 180 * dt;
      p.squashV *= Math.pow(0.0009, dt);
      p.squash = Phaser.Math.Clamp(p.squash + p.squashV * dt, 0.55, 1.35);
      p.phase += dt * (Math.abs(p.vx) / F.speed) * 12;

      on('state', stateName());
      draw(dt);
    }

    function stateName() {
      const p = player;
      if (p.dancing) return 'bailando';
      if (!p.grounded) return p.spin ? 'giro' : p.vy < 0 ? 'subiendo' : 'cayendo';
      if (Math.abs(p.vx) > 10) return 'corriendo';
      return p.idleT > cfg.capo.yogaAfter ? 'yoga' : 'quieto';
    }

    function frameName() {
      const p = player, C = cfg.capo;
      if (p.dancing) return p.danceFrame;
      if (!p.grounded) {
        if (p.spin > 0) return C.spin;
        if (p.vy < -60) return p.airT < 0.09 ? C.takeoff : C.rise;
        return C.fall;
      }
      if (Math.abs(p.vx) > 12) return C.walk[Math.floor(p.phase * 0.9) % C.walk.length];
      if (p.idleT > C.yogaAfter) return C.yoga[Math.floor((p.idleT - C.yogaAfter) / 1.8) % C.yoga.length];
      return C.idle;
    }

    function draw(dt) {
      const p = player;
      fx.clear(); dbg.clear();
      camTarget.setPosition(p.x, p.feet - 50);

      particles = particles.filter(q => {
        q.t += dt; q.vy += 500 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
        const a = 1 - q.t / q.life;
        if (a <= 0) return false;
        fx.fillStyle(q.col, a * 0.7); fx.fillCircle(q.x, q.y, 1.6);
        return true;
      });

      if (showSurf) {
        for (let c = 0; c < COLS; c++) for (const s of tops[c]) {
          dbg.fillStyle(s.b ? 0x1d66ad : 0xff2d55, 0.85); dbg.fillRect(c * CELL, s.y - 1, CELL, 2);
        }
      }

      const sy = p.dancing ? 1 : p.squash, sx = p.dancing ? 1 : 1 / Math.sqrt(p.squash);

      if (sprite) {
        capoImg.setVisible(false);
        sprite.setVisible(true).setPosition(p.x, p.feet).setFlipX(p.dir < 0);
        const s = cfg.capo.height / spriteMeta.fh;
        sprite.setScale(s * sx, s * sy);
        const n = spriteMeta.n;
        let f = 0;
        if (p.dancing) f = Math.floor(p.danceT * spriteMeta.fps) % n;
        else if (!p.grounded) f = Math.min(n - 1, Math.floor(n / 2));
        else if (Math.abs(p.vx) > 10) f = Math.floor(p.phase * spriteMeta.fps / 12) % n;
        sprite.setFrame(f);
        return;
      }

      const f = frameName();
      const s = cfg.capo.height / 172;
      capoImg.setFrame(frames[f] ? f : cfg.capo.idle).setVisible(true).setFlipX(p.dir < 0);
      if (p.spin) {
        const q = frames[f] || [0, 0, 0, 120];
        capoImg.setOrigin(0.5, 0.5).setPosition(p.x, p.feet - q[3] * s * 0.5 - 8).setRotation(-p.rot * p.dir);
      } else {
        capoImg.setOrigin(0.5, 1).setPosition(p.x, p.feet + 2)
          .setRotation(p.dancing ? Math.sin(p.danceT * 5) * 0.07 : 0);
      }
      capoImg.setScale(s * sx, s * sy);
    }

    /* baile: la cámara se aleja hasta ver la obra entera y Capo alterna poses */
    function startDance() {
      const p = player;
      if (!p || p.dancing || !p.grounded) return false;
      p.dancing = true; p.danceT = 0; p.beat = 0; p.vx = 0;
      p.danceFrame = pick(cfg.capo.dance, p.danceFrame);
      const cam = scene.cameras.main;
      cam.stopFollow();
      cam.removeBounds(); // sin límites la obra queda centrada con bandas parejas arriba y abajo
      // En una obra se ve el cuadro entero; en un nivel largo, la altura completa alrededor de Capo.
      const vw = viewSize().w * dpr / fullZoom();
      const cx = isBuilt() ? Phaser.Math.Clamp(p.x, vw / 2, W - vw / 2) : W / 2;
      cam.pan(cx, H / 2, 1400, 'Sine.easeInOut', true);
      cam.zoomTo(fullZoom(), 1400, 'Sine.easeInOut', true);
      on('dance', true);
      return true;
    }
    function stopDance() {
      const p = player;
      if (!p || !p.dancing) return;
      p.dancing = false;
      const cam = scene.cameras.main;
      cam.panEffect.reset();
      cam.setBounds(0, 0, W, H);
      cam.zoomTo(playZoom(), 800, 'Sine.easeInOut', true);
      cam.startFollow(camTarget, true, 0.08, 0.08);
      on('dance', false);
    }
    function danceStep(dt) {
      const p = player;
      p.danceT += dt; p.beat += dt;
      if (p.beat >= cfg.dance.beat) {
        p.beat -= cfg.dance.beat;
        p.danceFrame = pick(cfg.capo.dance, p.danceFrame);
        if (Math.random() < 0.3) p.dir *= -1;
        on('beat');
      }
      if (input.l || input.r || input.jumpPressed) { input.jumpPressed = false; stopDance(); }
      on('state', 'bailando');
    }

    function setConfig(next) {
      const levelChanged = next.level !== cfg.level;
      cfg = next;
      if (!scene) return;
      if (levelChanged) setLevel(cfg.level);
      if (!player.dancing) scene.cameras.main.setZoom(playZoom());
    }

    function setSheet(img, fw, fh, fps) {
      if (!scene) return 0;
      const n = Math.max(1, Math.floor(img.width / fw)) * Math.max(1, Math.floor(img.height / fh));
      const key = 'sheet' + Date.now();
      scene.textures.addSpriteSheet(key, img, { frameWidth: fw, frameHeight: fh });
      if (sprite) sprite.destroy();
      sprite = scene.add.sprite(player.x, player.feet, key, 0).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.MULTIPLY);
      spriteMeta = { n, fw, fh, fps };
      return n;
    }
    function clearSheet() { if (sprite) sprite.destroy(); sprite = null; spriteMeta = null; }

    // Salto disparado desde afuera (sacudir el celular): toque corto con altura media.
    function jump(holdMs) {
      input.jumpPressed = true; input.jump = true;
      setTimeout(() => { input.jump = false; }, holdMs || 180);
    }

    return {
      input, game, resize, setConfig, setLevel, setSheet, clearSheet, jump, respawn,
      dance: () => (player && player.dancing ? (stopDance(), false) : startDance()),
      isDancing: () => !!(player && player.dancing),
      showSurfaces: v => { showSurf = !!v; },
      isReady: () => ready,
      get config() { return cfg; }
    };
  }

  return { create, LEVELS, W, H };
})();
