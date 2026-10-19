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

  // Nivel armado: cada pieza ocupa sus celdas. 2 = rebote, 3 = plataforma fina (se puede bajar de ella).
  // Frágiles, móviles, párpados y espinas se manejan aparte porque cambian con el tiempo.
  const DYNAMIC = { fragil: 1, movil: 1, parpado: 1, espinas: 1 };
  function buildMask(L) {
    const m = new Uint8Array(COLS * ROWS), g = L.grid / CELL;
    for (const p of L.platforms) {
      if (DYNAMIC[p.t]) continue;
      const v = p.t === 'rebote' ? 2 : (p.t === 'plt' && (p.h || 1) <= 2 ? 3 : 1);
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
        if (v && (r === 0 || !mask[(r - 1) * COLS + c])) col.push({ y: r * CELL, b: v === 2, thin: v === 3 });
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
    // mag: cuánto se empuja el stick (0 a 1). Sin stick (teclado, botones) se corre a fondo.
    const input = { l: false, r: false, jump: false, jumpPressed: false, down: false, downPressed: false, mag: null };
    let scene, player, fx, dbg, bg, capoImg, camTarget, frames = {};
    let sprite = null, spriteMeta = null;
    let tops = [], masks = {}, particles = [], showSurf = false, ready = false, built = [], fragiles = [], eyes = [], checkpoint = -1;
    let movers = [], spikes = [], drops = [], stakes = [], door = null, levelT = 0, winT = 0;
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
    // Franja inferior tapada por controles flotantes (px CSS). La cámara sube a Capo hacia el área libre, sin salirse de la obra.
    const inset = () => Math.max(0, Math.min((opts.bottomInset && opts.bottomInset()) || 0, viewSize().h * 0.6));
    const fullZoom = () => {
      const v = viewSize(), h = v.h;
      return isBuilt() ? h * dpr / H : Math.min(v.w * dpr / W, h * dpr / H);
    };
    const insetWorld = z => inset() * dpr / z;
    function playFrame(cam) {
      const iw = insetWorld(playZoom());
      cam.setBounds(0, 0, W, H); // la obra llega hasta el borde: nunca se ve fondo negro
      cam.setFollowOffset(0, -iw / 2);
      return iw;
    }

    function resize() {
      if (!scene) return;
      const v = viewSize();
      game.scale.resize(v.w * dpr, v.h * dpr);
      scene.cameras.main.setSize(v.w * dpr, v.h * dpr);
      styleCanvas();
      const dancing = player && player.dancing;
      scene.cameras.main.setZoom(dancing ? fullZoom() : playZoom());
      if (!dancing) playFrame(scene.cameras.main);
    }

    function preload() {
      for (const id in LEVELS) {
        const L = LEVELS[id];
        if (L.built) {
          for (const ly of L.layers) this.load.image('lvl-' + id + '-' + ly.key, ly.src);
          for (const n in L.images || {}) this.load.image('lvl-' + id + '-img-' + n, L.images[n]);
          for (const n in L.sheets || {}) {
            const sh = L.sheets[n];
            this.load.spritesheet('lvl-' + id + '-sheet-' + n, sh.src, { frameWidth: sh.fw, frameHeight: sh.fh });
          }
        }
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
        tilt: 0, skid: 0, landT: 0, dropT: 0, dropY: 0, ground: null, life: 0,
        dancing: false, danceT: 0, beat: 0, danceFrame: cfg.capo.dance[0]
      };
      makeTextures();
      const cam = this.cameras.main;
      cam.setZoom(playZoom()).startFollow(camTarget, true, 0.12, 0.12);
      playFrame(cam);
      setLevel(levelId);
      ready = true;
      on('ready');
    }

    function setLevel(id) {
      if (!LEVELS[id]) id = 'color';
      levelId = id;
      if (!scene) return;
      built.forEach(o => o.destroy()); built = []; fragiles = []; eyes = []; checkpoint = -1;
      movers = []; spikes = []; drops = []; stakes = []; door = null; winT = 0;
      if (player) player.won = false;
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
      playFrame(scene.cameras.main);
      tops = surfaces(masks[id]);
      respawn();
      if (player.dancing) stopDance();
      on('level', { id, name: L.name, total: drops.length });
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
        if (ly.tint != null) t.setTint(ly.tint);
        built.push(t);
      });
      // Se pinta al doble de resolución porque la cámara de juego acerca bastante.
      const STRIP = 1440, RES = 2, imgs = {};
      for (const n in L.images || {}) imgs[n] = scene.textures.get('lvl-' + id + '-img-' + n).getSourceImage();
      for (let x0 = 0; x0 < W; x0 += STRIP) {
        const key = 'plat-' + id + '-' + x0, sw = Math.min(STRIP, W - x0);
        if (!scene.textures.exists(key)) {
          const c = document.createElement('canvas');
          c.width = sw * RES; c.height = H * RES;
          const ctx = c.getContext('2d');
          ctx.scale(RES, RES);
          ctx.translate(-x0, 0);
          L.paint(ctx, imgs);
          scene.textures.addCanvas(key, c);
        }
        built.push(scene.add.image(x0, 0, key).setOrigin(0).setDisplaySize(sw, H).setDepth(-5));
      }
      const fkey = 'lvl-' + id + '-img-fragil';
      if (scene.textures.exists(fkey)) for (const p of L.platforms) if (p.t === 'fragil') makeFragile(p, L.grid, fkey);
      for (const e of L.eyes || []) makeEye(e, L, id);
      L.platforms.forEach((p, i) => {
        if (p.t === 'movil' || p.t === 'parpado') makeMover(p, L, id, i, imgs);
        else if (p.t === 'espinas') spikes.push({ x0: p.x * L.grid, x1: (p.x + p.w) * L.grid, y: p.y * L.grid });
      });
      for (const [x, y] of L.drops || []) makeDrop(x * L.grid, y * L.grid);
      for (const c of L.checkpoints || []) makeStake((c.x + 0.5) * L.grid, c.y * L.grid);
      if (L.door) makeDoor(L.door.x * L.grid, L.door.y * L.grid);
    }

    /* Texturas dibujadas en código: gota ocre, estaca de control y puerta de salida.
       Ocre es el color de lo que se junta; la estaca y la puerta van en tinta. */
    function canvasTex(key, w, h, draw) {
      if (scene.textures.exists(key)) return;
      const c = document.createElement('canvas'), R = 3;
      c.width = w * R; c.height = h * R;
      const ctx = c.getContext('2d');
      ctx.scale(R, R);
      draw(ctx);
      scene.textures.addCanvas(key, c);
    }
    function makeTextures() {
      canvasTex('gota', 28, 34, ctx => {
        // Gota de acuarela: mancha ocre con el borde más oscuro, como cuando se seca.
        const path = () => {
          ctx.beginPath();
          ctx.moveTo(14, 2);
          ctx.bezierCurveTo(17, 10, 25, 15, 25, 22);
          ctx.bezierCurveTo(25, 29, 20, 32, 14, 32);
          ctx.bezierCurveTo(8, 32, 3, 29, 3, 22);
          ctx.bezierCurveTo(3, 15, 11, 10, 14, 2);
          ctx.closePath();
        };
        const g = ctx.createRadialGradient(11, 20, 1, 14, 22, 13);
        g.addColorStop(0, 'rgba(250,214,120,0.95)');
        g.addColorStop(0.7, 'rgba(222,160,46,0.92)');
        g.addColorStop(1, 'rgba(176,110,20,0.95)');
        path(); ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(120,70,10,0.75)'; path(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,248,225,0.85)';
        ctx.beginPath(); ctx.ellipse(10, 20, 2, 4, -0.4, 0, 6.3); ctx.fill();
      });
      canvasTex('estaca', 30, 60, ctx => {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = '#141418'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(8, 59); ctx.lineTo(7.5, 30); ctx.lineTo(8.5, 4); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath(); ctx.moveTo(9, 5); ctx.quadraticCurveTo(18, 7, 27, 6); ctx.lineTo(23, 12); ctx.lineTo(28, 18);
        ctx.quadraticCurveTo(18, 17, 9, 19); ctx.closePath(); ctx.fill();
        ctx.lineWidth = 1.4; ctx.stroke();
      });
      canvasTex('halo', 64, 64, ctx => {
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,236,190,0.9)');
        g.addColorStop(0.45, 'rgba(250,214,130,0.35)');
        g.addColorStop(1, 'rgba(250,214,130,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
      });
      canvasTex('puerta', 70, 110, ctx => {
        // Vano de luz cálida con marco de tinta temblorosa.
        const arch = (o) => {
          ctx.beginPath();
          ctx.moveTo(12 - o, 108); ctx.lineTo(12 - o, 40);
          ctx.bezierCurveTo(12 - o, 10 - o, 58 + o, 10 - o, 58 + o, 40);
          ctx.lineTo(58 + o, 108);
        };
        const g = ctx.createRadialGradient(35, 70, 4, 35, 64, 46);
        g.addColorStop(0, 'rgba(255,246,214,1)');
        g.addColorStop(0.55, 'rgba(250,214,130,0.95)');
        g.addColorStop(1, 'rgba(222,160,46,0.55)');
        arch(0); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
        ctx.lineCap = 'round'; ctx.strokeStyle = '#141418';
        ctx.lineWidth = 2.6; arch(0); ctx.stroke();
        ctx.lineWidth = 1; ctx.globalAlpha = 0.6; arch(3); ctx.stroke(); ctx.globalAlpha = 1;
      });
    }

    function makeDrop(x, y) {
      const o = scene.add.image(x, y, 'gota').setScale(1 / 3 * 0.9).setDepth(9);
      built.push(o);
      drops.push({ x, y, o, got: false, ph: Math.random() * 6.3 });
    }
    function makeStake(x, y) {
      const o = scene.add.image(x, y + 2, 'estaca').setOrigin(0.27, 1).setScale(1 / 3 * 0.8).setDepth(-2).setAlpha(0.45);
      built.push(o);
      stakes.push({ o, on: false, t: 0 });
    }
    function makeDoor(x, y) {
      const glow = scene.add.image(x, y - 22, 'halo').setScale(1.5).setAlpha(0.5).setDepth(-6);
      const o = scene.add.image(x, y + 2, 'puerta').setOrigin(0.5, 1).setScale(1 / 3 * 0.95).setDepth(-3);
      built.push(glow, o);
      door = { x, y, o, glow };
    }

    /* Piezas que se mueven: "movil" va y vuelve entre dos puntos; "parpado" se abre y se cierra a ritmo.
       Se pintan una vez en una textura y se mueven como imagen. */
    function makeMover(p, L, id, i, imgs) {
      const G = L.grid, w = p.w * G, key = 'mov-' + id + '-' + i, PAD = 8, RES = 2;
      const ch = Math.round(w * 1.1 + 20);
      if (!scene.textures.exists(key)) {
        const c = document.createElement('canvas');
        c.width = (w + PAD * 2) * RES; c.height = ch * RES;
        const ctx = c.getContext('2d');
        ctx.scale(RES, RES);
        ctx.translate(PAD - p.x * G, 6 - p.y * G);
        (L.paintPiece || (() => {}))(ctx, p, imgs);
        scene.textures.addCanvas(key, c);
      }
      const img = scene.add.image(0, 0, key).setOrigin(PAD / (w + PAD * 2), 6 / ch).setDisplaySize(w + PAD * 2, ch).setDepth(-4);
      built.push(img);
      const to = p.to || [p.x, p.y];
      const m = {
        kind: p.t, w, img, ax: p.x * G, ay: p.y * G, bx: to[0] * G, by: to[1] * G,
        period: p.period || 4, offset: p.offset || 0, on: p.on || 2.2, off: p.off || 1.4,
        x: p.x * G, y: p.y * G, dx: 0, dy: 0, solid: true, sy: 1, alpha: 1, baseSY: img.scaleY
      };
      if (m.kind === 'parpado') m.ghost = scene.add.graphics().setDepth(-4);
      if (m.ghost) built.push(m.ghost);
      movers.push(m);
      placeMover(m, 0, true);
    }
    const BLINK = { warn: 0.5, shut: 0.14 };
    function placeMover(m, t, first) {
      const px = m.x, py = m.y;
      if (m.kind === 'movil') {
        // Va y vuelve con una pausa corta en cada punta, para poder subirse con calma.
        const ph = (((t / m.period + m.offset) % 1) + 1) % 1, tri = ph < 0.5 ? ph * 2 : 2 - ph * 2;
        const q = Phaser.Math.Clamp((tri - 0.12) / 0.76, 0, 1), u = q * q * (3 - 2 * q);
        m.x = m.ax + (m.bx - m.ax) * u; m.y = m.ay + (m.by - m.ay) * u;
      } else {
        // Ciclo: abierto, aviso (tiembla), se cierra, cerrado (queda el contorno), se abre.
        const T = m.on + m.off, k = ((t + m.offset * T) % T + T) % T;
        let sy = 1, a = 1, shake = 0, solid = true;
        if (k < m.on - BLINK.warn) { /* abierto */ }
        else if (k < m.on) { shake = (k - (m.on - BLINK.warn)) / BLINK.warn; }
        else if (k < m.on + BLINK.shut) { const q = (k - m.on) / BLINK.shut; sy = 1 - q * 0.92; a = 1 - q * 0.85; solid = false; }
        else if (k < T - BLINK.shut) { sy = 0.08; a = 0.15; solid = false; }
        else { const q = (k - (T - BLINK.shut)) / BLINK.shut; sy = 0.08 + q * 0.92; a = 0.15 + q * 0.85; solid = q > 0.5; }
        m.solid = solid; m.sy = sy; m.alpha = a;
        m.x = m.ax + (shake ? Math.sin(t * 70) * 1.4 * (0.4 + shake) : 0);
        m.y = m.ay;
        m.warn = shake;
      }
      m.dx = first ? 0 : m.x - px; m.dy = first ? 0 : m.y - py;
      if (m.kind === 'parpado') m.img.setScale(m.img.scaleX, m.baseSY * m.sy);
      m.img.setPosition(m.x, m.y).setAlpha(m.alpha);
    }

    /* Ojo láser: dormido, despierto, carga (aviso con línea negra), disparo y descanso.
       El haz corta en cualquier superficie sólida, así que los pilares sirven de cobertura. */
    const EYE = { open: 0.6, charge: 0.9, fire: 0.5, rest: 1.5, wake: 200, height: 62, range: 1100, beamW: 18 };
    const FR = { sleep: 0, open: 1, charge: 2, fire: 3, rest: 4 };
    function makeEye(e, L, id) {
      const sh = L.sheets.ojo, G = L.grid, sc = EYE.height / sh.fh;
      const bx = e.x * G, by = e.y * G, down = !!e.down;
      const lift = (sh.fh - sh.cy) * sc;
      const sprite = scene.add.sprite(bx, by, 'lvl-' + id + '-sheet-ojo', FR.sleep)
        .setOrigin(0.5, down ? 0 : 1).setScale(sc).setFlipY(down).setDepth(-3);
      built.push(sprite);
      // Haz y salpicadura pintados (si el nivel los trae); si no, se dibuja con líneas.
      const hk = 'lvl-' + id + '-img-haz', ik = 'lvl-' + id + '-img-impacto';
      let beam = null, splash = null;
      if (scene.textures.exists(hk)) {
        const th = scene.textures.get(hk).getSourceImage().height;
        beam = scene.add.tileSprite(bx, by, 10, EYE.beamW, hk).setOrigin(0, 0.5).setTileScale(EYE.beamW / th).setDepth(11).setVisible(false);
        built.push(beam);
      }
      if (scene.textures.exists(ik)) { splash = scene.add.image(0, 0, ik).setDepth(11).setVisible(false); built.push(splash); }
      eyes.push({
        beam, splash,
        cx: bx, cy: down ? by + lift : by - lift, sprite, type: e.type || 'fijo',
        base: (e.angle || 0) * Math.PI / 180, arc: (e.arc || 60) * Math.PI / 180,
        offset: e.offset || 0, state: 'sleep', t: 0, aim: (e.angle || 0) * Math.PI / 180, end: null, wob: Math.random() * 6
      });
    }
    // Recorre el haz celda por celda hasta tocar algo sólido.
    function castBeam(x, y, a) {
      const dx = Math.cos(a), dy = Math.sin(a), m = masks[levelId];
      for (let d = 22; d < EYE.range; d += 3) {
        const px = x + dx * d, py = y + dy * d;
        if (px < 0 || px >= W || py < 0 || py >= H) return { x: px, y: py, hit: false };
        const c = px / CELL | 0, r = py / CELL | 0;
        if (m[r * COLS + c]) return { x: px, y: py, hit: true };
      }
      return { x: x + dx * EYE.range, y: y + dy * EYE.range, hit: false };
    }
    function segDist(px, py, ax, ay, bx, by) {
      const vx = bx - ax, vy = by - ay, l = vx * vx + vy * vy || 1;
      const t = Phaser.Math.Clamp(((px - ax) * vx + (py - ay) * vy) / l, 0, 1);
      return Math.hypot(px - ax - vx * t, py - ay - vy * t);
    }
    function updateEyes(dt) {
      const p = player;
      for (const e of eyes) {
        e.t += dt;
        const near = Math.abs(p.x - e.cx) < EYE.wake && Math.abs(p.feet - e.cy) < 420;
        const toCapo = Math.atan2(p.feet - 35 - e.cy, p.x - e.cx);
        if (e.state === 'sleep') {
          if (near && !p.dead) { e.state = 'open'; e.t = -e.offset; }
        } else if (e.state === 'open') {
          if (e.type === 'rastreador') e.aim = toCapo;
          if (e.t >= EYE.open) { e.state = 'charge'; e.t = 0; on('eye-charge'); }
        } else if (e.state === 'charge') {
          // El rastreador apunta hasta el 60% de la carga y después queda fijo: el aviso es la trayectoria real.
          if (e.type === 'rastreador' && e.t < EYE.charge * 0.6) e.aim = Phaser.Math.Angle.RotateTo(e.aim, toCapo, 4 * dt);
          if (e.type === 'barredor') e.aim = e.base - e.arc / 2;
          if (e.t >= EYE.charge) { e.state = 'fire'; e.t = 0; on('eye-fire'); }
        } else if (e.state === 'fire') {
          if (e.type === 'barredor') e.aim = e.base - e.arc / 2 + e.arc * (e.t / EYE.fire);
          if (e.t >= EYE.fire) { e.state = 'rest'; e.t = 0; }
        } else if (e.state === 'rest') {
          if (e.t >= EYE.rest) { e.state = near ? 'open' : 'sleep'; e.t = 0; }
        }
        if (e.type !== 'rastreador' && e.type !== 'barredor') e.aim = e.base;
        e.end = (e.state === 'charge' || e.state === 'fire') ? castBeam(e.cx, e.cy, e.aim) : null;
        e.sprite.setFrame(FR[e.state]).setRotation(Math.sin((e.wob += dt * 1.7)) * 0.05);

        if (e.state === 'fire' && e.end && !p.dead) {
          for (let k = 0; k <= 4; k++) {
            const by = p.feet - 6 - k * 13;
            if (segDist(p.x, by, e.cx, e.cy, e.end.x, e.end.y) < 6) { die(); break; }
          }
        }
      }
    }
    function drawEyes() {
      for (const e of eyes) {
        const firing = e.state === 'fire' && e.end;
        if (e.beam) e.beam.setVisible(!!firing);
        if (e.splash) e.splash.setVisible(!!(firing && e.end.hit));
        if (!e.end) continue;
        if (e.state === 'charge' && e.t > 0.12) {
          // Línea de pluma temblorosa: la trayectoria exacta del disparo.
          const a = Math.min(0.9, 0.3 + e.t / EYE.charge);
          const len = Math.hypot(e.end.x - e.cx, e.end.y - e.cy), n = Math.max(2, len / 14 | 0);
          const nx = -(e.end.y - e.cy) / len, ny = (e.end.x - e.cx) / len;
          fx.lineStyle(1.3, 0x111114, a);
          fx.beginPath(); fx.moveTo(e.cx, e.cy);
          for (let i = 1; i <= n; i++) {
            const t = i / n, j = i < n ? (Math.random() - 0.5) * 1.6 : 0;
            fx.lineTo(e.cx + (e.end.x - e.cx) * t + nx * j, e.cy + (e.end.y - e.cy) * t + ny * j);
          }
          fx.strokePath();
        } else if (e.state === 'fire') {
          const f = 1 - Math.max(0, (e.t - EYE.fire + 0.12) / 0.12), w = 6 + Math.random() * 1.5;
          if (e.beam) {
            const len = Math.hypot(e.end.x - e.cx, e.end.y - e.cy), grow = Math.min(1, e.t / 0.06);
            e.beam.setPosition(e.cx, e.cy).setRotation(e.aim).setSize(Math.max(1, len * grow), EYE.beamW)
              .setScale(1, 0.85 + Math.random() * 0.3).setAlpha(f);
            e.beam.tilePositionX -= 14;
            if (e.splash && e.end.hit) {
              e.splash.setPosition(e.end.x, e.end.y).setRotation(Math.random() * 6.3)
                .setScale((26 + Math.random() * 8) / e.splash.width).setAlpha(f);
            }
            fx.lineStyle(w * 3, 0xff2030, 0.12 * f); fx.lineBetween(e.cx, e.cy, e.end.x, e.end.y);
            continue;
          }
          fx.lineStyle(w * 2.4, 0xff2030, 0.16 * f); fx.lineBetween(e.cx, e.cy, e.end.x, e.end.y);
          fx.lineStyle(w, 0xc80f1d, 0.95 * f); fx.lineBetween(e.cx, e.cy, e.end.x, e.end.y);
          fx.lineStyle(2, 0xffd6d6, 0.9 * f); fx.lineBetween(e.cx, e.cy, e.end.x, e.end.y);
          if (e.end.hit) { fx.fillStyle(0xc80f1d, 0.8 * f); fx.fillCircle(e.end.x, e.end.y, 5 + Math.random() * 3); }
        }
      }
    }

    // Párpado cerrado: queda una línea punteada donde va a volver; avisando, el borde parpadea.
    function drawMovers() {
      for (const m of movers) {
        if (!m.ghost) continue;
        m.ghost.clear();
        if (m.sy < 0.99) {
          m.ghost.fillStyle(0xffffff, 0.55);
          for (let x = 4; x < m.w - 4; x += 9) m.ghost.fillRect(m.ax + x, m.ay - 1, 4, 1.6);
        } else if (m.warn > 0 && Math.sin(levelT * 34) > 0) {
          m.ghost.fillStyle(0xffffff, 0.9);
          m.ghost.fillRect(m.x + 2, m.y - 2, m.w - 4, 2);
        }
      }
    }

    // Muerte: salpicadura roja, una pausa corta y vuelta al último punto de control.
    // fell: se cayó al vacío, sin salpicadura (pasa fuera de cuadro).
    function die(fell) {
      const p = player;
      if (p.dead || p.won) return;
      p.dead = fell ? 0.45 : 0.75; p.vx = 0; p.vy = 0;
      if (!fell) dust(p.x, p.feet - 30, 18, 0xc80f1d);
      scene.cameras.main.shake(fell ? 120 : 180, fell ? 0.004 : 0.006);
      on('die', fell ? 'cayo' : 'golpe');
    }
    function updateCheckpoint() {
      const L = LEVELS[levelId], cps = (L && L.checkpoints) || [];
      for (let i = checkpoint + 1; i < cps.length; i++) if (player.x >= cps[i].x * L.grid) {
        checkpoint = i;
        const k = stakes[i];
        if (k && !k.on) {
          k.on = true; k.t = 0; k.o.setAlpha(1);
          scene.tweens.add({ targets: k.o, scaleX: k.o.scaleX * 1.25, scaleY: k.o.scaleY * 1.25, duration: 120, yoyo: true });
          dust(k.o.x, k.o.y - 20, 8, 0xffffff);
          on('checkpoint', i);
        }
      }
    }

    // Gotas: flotan, y al tocarlas se juntan con un brillo. Quedan juntadas aunque Capo muera.
    function updateDrops(dt) {
      const p = player;
      for (const d of drops) {
        if (d.got) continue;
        d.ph += dt * 2.4;
        d.o.setY(d.y + Math.sin(d.ph) * 3).setRotation(Math.sin(d.ph * 0.7) * 0.12);
        if (!p.dead && Math.abs(p.x - d.x) < 20 && p.feet - 64 < d.y + 10 && p.feet + 4 > d.y - 10) {
          d.got = true;
          dust(d.x, d.y, 10, 0xe0a030);
          scene.tweens.add({ targets: d.o, scale: d.o.scale * 1.8, alpha: 0, y: d.y - 18, duration: 260, ease: 'Quad.easeOut' });
          on('drop', { got: drops.filter(q => q.got).length, total: drops.length });
        }
      }
      for (const k of stakes) if (k.on) { k.t += dt; k.o.setRotation(Math.sin(k.t * 3) * 0.03); }
      if (door) door.glow.setAlpha(0.45 + Math.sin(levelT * 2) * 0.1);
    }

    // Llegar a la puerta: Capo festeja bailando y el nivel pasa al siguiente.
    function win() {
      const p = player;
      p.won = true; winT = 0; p.vx = 0; p.x = door.x;
      startDance();
      dust(door.x, door.y - 40, 16, 0xe0a030);
      const L = LEVELS[levelId];
      on('goal', { id: levelId, name: L.name, got: drops.filter(q => q.got).length, total: drops.length, next: L.next });
    }
    function goNext() {
      const L = LEVELS[levelId];
      if (!L || !player.won || player.leaving) return;
      player.leaving = true;
      const cam = scene.cameras.main;
      cam.fadeOut(450, 15, 16, 19);
      cam.once('camerafadeoutcomplete', () => {
        player.leaving = false;
        setLevel(L.next && LEVELS[L.next] ? L.next : levelId);
        cam.fadeIn(500, 15, 16, 19);
      });
    }

    /* Plataforma frágil: al pisarla tiembla, se desarma en pedazos que caen y a los pocos segundos vuelve. */
    const FRAG = { shake: 0.5, gone: 3, fade: 0.4, slices: 6 };
    function makeFragile(p, G, key) {
      const x = p.x * G, y = p.y * G, w = p.w * G;
      const src = scene.textures.get(key).getSourceImage();
      const pad = 6, sc = (w + pad * 2) / src.width;
      const box = scene.add.container(x - pad, y).setDepth(-4);
      const img = scene.add.image(0, 0, key).setOrigin(0).setScale(sc);
      const dash = scene.add.graphics();
      dash.fillStyle(0xffffff, 0.92);
      for (let dx = pad + 3; dx < pad + w - 4; dx += 9) dash.fillRect(dx, 1, 5, 1.6);
      box.add([img, dash]);
      built.push(box);
      fragiles.push({ x0: x, x1: x + w, y, w, key, sc, pad, box, state: 'idle', t: 0, bits: [] });
    }
    function fragileAt(x, from, to) {
      for (const f of fragiles) {
        if (f.state !== 'idle' && f.state !== 'shake') continue;
        if (x + 6 >= f.x0 && x - 6 <= f.x1 && f.y >= from && f.y <= to) return f;
      }
      return null;
    }
    function breakFragile(f) {
      f.state = 'gone'; f.t = 0;
      f.box.setVisible(false).setX(f.x0 - f.pad);
      const src = scene.textures.get(f.key).getSourceImage(), n = FRAG.slices, sw = src.width / n;
      for (let i = 0; i < n; i++) {
        const b = scene.add.image(f.x0 - f.pad + (i * sw + sw / 2) * f.sc, f.y + src.height * f.sc / 2, f.key)
          .setScale(f.sc).setCrop(i * sw, 0, sw, src.height).setDepth(-4);
        b.setOrigin((i * sw + sw / 2) / src.width, 0.5);
        f.bits.push({ o: b, vy: -30 - Math.random() * 60, vx: (Math.random() - 0.5) * 50, vr: (Math.random() - 0.5) * 4, delay: Math.random() * 0.15 });
      }
      dust((f.x0 + f.x1) / 2, f.y, 8, 0x8a3a78);
      on('crumble');
    }
    function resetFragiles() {
      for (const f of fragiles) {
        f.bits.forEach(b => b.o.destroy()); f.bits = [];
        f.state = 'idle'; f.t = 0; f.box.setVisible(true).setAlpha(1).setX(f.x0 - f.pad);
      }
    }
    function updateFragiles(dt) {
      const p = player;
      for (const f of fragiles) {
        f.t += dt;
        if (f.state === 'shake') {
          f.box.setX(f.x0 - f.pad + Math.sin(f.t * 70) * 1.6 * (0.5 + f.t / FRAG.shake));
          if (f.t >= FRAG.shake) breakFragile(f);
        } else if (f.state === 'gone') {
          f.bits = f.bits.filter(b => {
            if (f.t < b.delay) return true;
            b.vy += 900 * dt;
            b.o.x += b.vx * dt; b.o.y += b.vy * dt; b.o.rotation += b.vr * dt;
            b.o.setAlpha(Math.max(0, 1 - (f.t - 0.5) / 0.7));
            if (f.t > 1.3) { b.o.destroy(); return false; }
            return true;
          });
          // Vuelve solo si Capo no está metido donde se arma.
          const inside = p.x + 8 > f.x0 && p.x - 8 < f.x1 && p.feet > f.y - 70 && p.feet < f.y + 30;
          if (f.t >= FRAG.gone && !inside) { f.state = 'back'; f.t = 0; f.box.setVisible(true).setAlpha(0); }
        } else if (f.state === 'back') {
          f.box.setAlpha(Math.min(1, f.t / FRAG.fade));
          if (f.t >= FRAG.fade) { f.state = 'idle'; f.t = 0; }
        }
      }
    }

    function respawn() {
      const L = LEVELS[levelId], cp = L.checkpoints && L.checkpoints[checkpoint];
      const s = cp ? { x: (cp.x + 1) * L.grid, y: cp.y * L.grid } : L.start;
      Object.assign(player, {
        x: s.x, feet: s.y, vx: 0, vy: 0, grounded: false, coyote: 0, spin: 0, rot: 0, dead: 0,
        tilt: 0, skid: 0, landT: 0, dropT: 0, ground: null
      });
      resetFragiles();
      levelT = 0;
      for (const m of movers) placeMover(m, 0, true);
      for (const e of eyes) { e.state = 'sleep'; e.t = 0; e.end = null; }
      if (camTarget) { camTarget.setPosition(s.x, s.y - 50); scene.cameras.main.centerOn(s.x, s.y - 50 + insetWorld(playZoom()) / 2); }
    }

    // Mientras Capo se baja de una plataforma fina, se ignoran las finas que quedan a la altura de donde estaba.
    const skipThin = y => player.dropT > 0 && y <= player.dropY + 4;
    function findSurface(x, from, to) {
      let best = null;
      const c0 = Math.max(0, Math.floor((x - 6) / CELL)), c1 = Math.min(COLS - 1, Math.floor((x + 6) / CELL));
      for (let c = c0; c <= c1; c++) for (const s of tops[c]) {
        if (s.thin && skipThin(s.y)) continue;
        if (s.y >= from && s.y <= to && (!best || s.y < best.y)) best = s;
      }
      const f = fragileAt(x, from, to);
      if (f && !skipThin(f.y) && (!best || f.y < best.y)) best = { y: f.y, b: false, thin: true, frag: f };
      for (const m of movers) {
        if (!m.solid || x + 7 < m.x || x - 7 > m.x + m.w || skipThin(m.y)) continue;
        // Si la pieza sube, también cuenta cuando cruzó los pies en este cuadro, con unos píxeles de tolerancia.
        if (m.y <= to && (m.y >= from - 8 || m.y - m.dy >= from - 1) && (!best || m.y < best.y)) best = { y: m.y, b: false, thin: true, mover: m };
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

      levelT += dt; p.life += dt;
      for (const m of movers) placeMover(m, levelT);
      updateFragiles(dt);
      updateEyes(dt);
      updateDrops(dt);
      if (p.won) { winT += dt; danceStep(dt); draw(dt); if (winT > 3.6 && opts.autoNext !== false) goNext(); return; }
      if (p.dead) {
        p.dead -= dt;
        if (p.dead <= 0) respawn();
        draw(dt);
        return;
      }
      updateCheckpoint();
      if (p.dancing) { danceStep(dt); draw(dt); return; }

      // Parado sobre algo que se mueve: Capo viaja con la pieza.
      if (p.grounded && p.ground && p.ground.mover) {
        const m = p.ground.mover;
        if (m.solid) { p.x += m.dx; p.feet = m.y; }
        else { p.grounded = false; p.coyote = F.coyote / 1000; p.ground = null; }
      }

      const ax = (input.r ? 1 : 0) - (input.l ? 1 : 0);
      if (ax) p.dir = ax;
      // Con el stick, poco empuje camina y a fondo corre. Por debajo del 45% de velocidad no tiene sentido: se siente trabado.
      const mag = input.mag == null ? 1 : 0.45 + 0.55 * Phaser.Math.Clamp(input.mag, 0, 1);
      const target = ax * F.speed * mag;
      // Darse vuelta corriendo frena más fuerte y levanta polvo.
      const turning = ax && p.vx && Math.sign(ax) !== Math.sign(p.vx);
      if (turning && p.grounded && Math.abs(p.vx) > 150 && p.skid <= 0) { p.skid = 0.16; dust(p.x, p.feet, 6); on('skid'); }
      let acc = p.grounded ? (turning ? 4200 : ax ? 2600 : 2200) : 1600;
      p.vx += Math.sign(target - p.vx) * Math.min(Math.abs(target - p.vx), acc * dt);
      p.skid -= dt; p.landT -= dt; p.dropT -= dt;

      if (input.jumpPressed) { p.buffer = 0.13; input.jumpPressed = false; }
      // Abajo sobre una plataforma fina: se baja atravesándola.
      if (input.downPressed) {
        input.downPressed = false;
        if (p.grounded && p.ground && p.ground.thin) {
          p.dropT = 0.22; p.dropY = p.feet; p.grounded = false; p.ground = null; p.vy = 80; p.coyote = 0;
          dust(p.x, p.feet, 4); on('drop-through');
        }
      }
      p.buffer -= dt; p.coyote -= dt;
      if (p.buffer > 0 && (p.grounded || p.coyote > 0)) {
        // Saltar desde algo que sube suma su impulso.
        const lift = p.ground && p.ground.mover ? Math.min(0, p.ground.mover.dy / dt) : 0;
        p.vy = -F.jump + lift * 0.6; p.grounded = false; p.coyote = 0; p.buffer = 0; p.squashV = -3.2; p.ground = null;
        dust(p.x, p.feet, 5); on('jump');
      }

      let g = F.grav;
      if (p.vy < 0 && !input.jump) g *= 2.2;
      if (Math.abs(p.vy) < 60 && !p.grounded) g *= 0.6;
      p.vy = Math.min(p.vy + g * dt, 1150);
      p.x = Phaser.Math.Clamp(p.x + p.vx * dt, 8, W - 8);

      const nf = p.feet + p.vy * dt;
      if (p.vy >= 0) {
        // En el aire hay unos píxeles de tolerancia: si los pies quedaron apenas por debajo de un borde, sube a él.
        const s = findSurface(p.x, p.feet - (p.grounded ? 10 : 7), nf + (p.grounded ? 12 : 0));
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
              // Caída fuerte: un instante agachado antes de seguir.
              if (impact > 420) p.landT = Math.min(0.13, impact / 6500);
              if (impact > 260) { dust(p.x, s.y, Math.min(12, impact / 80 | 0)); on('land', impact); }
            }
          } else { p.feet = s.y; p.vy = 0; }
          if (p.grounded) p.ground = s;
          if (p.grounded && s.frag && s.frag.state === 'idle') { s.frag.state = 'shake'; s.frag.t = 0; on('crack'); }
        } else {
          if (p.grounded) p.coyote = cfg.feel.coyote / 1000;
          p.grounded = false; p.ground = null; p.feet = nf;
        }
      } else { p.grounded = false; p.ground = null; p.feet = nf; }

      if (p.feet > H + 90) { die(true); }
      for (const k of spikes) if (p.x > k.x0 + 5 && p.x < k.x1 - 5 && p.feet > k.y - 18 && p.feet < k.y + 8) { die(); break; }

      if (p.grounded) {
        p.airT = 0;
        if (Math.abs(p.vx) < 12 && !ax) p.idleT += dt; else p.idleT = 0;
        if (p.spin) { p.spin = 0; p.rot = 0; }
      } else { p.airT += dt; p.idleT = 0; }
      if (p.spin > 0) { p.rot += dt * Math.PI * 2 / 0.6; if (p.rot >= Math.PI * 2) { p.rot = 0; p.spin = 0; } }

      p.squashV += (1 - p.squash) * 180 * dt;
      p.squashV *= Math.pow(0.0009, dt);
      p.squash = Phaser.Math.Clamp(p.squash + p.squashV * dt, 0.55, 1.35);
      // La cadencia de la carrera sigue a la velocidad, con un mínimo para que caminar lento no parezca en cámara lenta.
      const ratio = Math.min(1, Math.abs(p.vx) / F.speed);
      p.phase += dt * (cfg.capo.walkFps || 9) * (ratio > 0.05 ? 0.5 + 0.5 * ratio : 0);

      // Inclinación: hacia adelante al correr, hacia atrás al frenar, siguiendo la velocidad en el aire.
      let lean = 0;
      if (p.grounded) lean = p.skid > 0 ? -0.16 * Math.sign(p.vx) : (p.vx / F.speed) * 0.05;
      else if (!p.spin) lean = Phaser.Math.Clamp(p.vx / F.speed, -1, 1) * 0.09;
      p.tilt += (lean - p.tilt) * Math.min(1, dt * 14);

      if (door && !p.won && p.grounded && Math.abs(p.x - door.x) < 16 && Math.abs(p.feet - door.y) < 10) win();

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
      if (p.landT > 0) return C.land || C.takeoff;
      if (Math.abs(p.vx) > 12) return C.walk[Math.floor(p.phase) % C.walk.length];
      if (p.idleT > C.yogaAfter) return C.yoga[Math.floor((p.idleT - C.yogaAfter) / 1.8) % C.yoga.length];
      return C.idle;
    }

    function draw(dt) {
      const p = player;
      fx.clear(); dbg.clear();
      camTarget.setPosition(p.x, p.feet - 50);
      drawEyes();
      drawMovers();

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
        for (const f of fragiles) if (f.state === 'idle' || f.state === 'shake') {
          dbg.fillStyle(0xffb000, 0.9); dbg.fillRect(f.x0, f.y - 1, f.w, 2);
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

      let f = frameName();
      if (!frames[f]) f = cfg.capo.idle;
      const C = cfg.capo, s = C.height / 172 * ((C.scale && C.scale[f]) || 1);
      capoImg.setFrame(f).setVisible(!p.dead).setFlipX(p.dir < 0);
      if (p.spin) {
        const q = frames[f] || [0, 0, 0, 120];
        capoImg.setOrigin(0.5, 0.5).setPosition(p.x, p.feet - q[3] * s * 0.5 - 8).setRotation(-p.rot * p.dir);
      } else {
        // Apoyo bajo la cabeza en la carrera; espejado cuando mira a la izquierda.
        const ox = (C.anchor && C.anchor[f]) || 0.5;
        const running = p.grounded && Math.abs(p.vx) > 12 && !p.dancing;
        // Rebote leve en cada paso y respiración cuando está quieto.
        const bob = running ? -Math.abs(Math.sin(p.phase * Math.PI)) * 2.2 * Math.min(1, Math.abs(p.vx) / cfg.feel.speed) : 0;
        const breath = p.grounded && !running && !p.dancing && p.landT <= 0 ? 1 + Math.sin(p.life * 2.3) * 0.012 : 1;
        capoImg.setOrigin(p.dir < 0 ? 1 - ox : ox, 1).setPosition(p.x, p.feet + 2 + bob)
          .setRotation(p.dancing ? Math.sin(p.danceT * 5) * 0.07 : p.tilt);
        capoImg.setScale(s * sx, s * sy * breath);
        return;
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
      cam.zoomTo(playZoom(), 800, 'Sine.easeInOut', true);
      cam.startFollow(camTarget, true, 0.08, 0.08);
      playFrame(cam);
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
      if (!p.won && (input.l || input.r || input.jumpPressed)) { input.jumpPressed = false; stopDance(); }
      on('state', p.won ? 'festejo' : 'bailando');
    }

    function setConfig(next) {
      const levelChanged = next.level !== cfg.level;
      cfg = next;
      if (!scene) return;
      if (levelChanged) setLevel(cfg.level);
      if (!player.dancing) { scene.cameras.main.setZoom(playZoom()); playFrame(scene.cameras.main); }
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
      input, game, resize, setConfig, setLevel, setSheet, clearSheet, jump, respawn, next: goNext,
      level: () => levelId,
      dance: () => (player && player.dancing ? (stopDance(), false) : startDance()),
      isDancing: () => !!(player && player.dancing),
      showSurfaces: v => { showSurf = !!v; },
      isReady: () => ready,
      get config() { return cfg; },
      get player() { return player; },
      movers: () => movers.map(m => [+(m.x / 36).toFixed(1), +(m.y / 36).toFixed(1), m.solid]),
      stats: () => ({ level: levelId, got: drops.filter(d => d.got).length, total: drops.length, won: !!(player && player.won), checkpoint }),
      // Avanza el juego a mano, en pasos fijos (para probar recorridos sin depender de los cuadros por segundo).
      step(sec, dt) { dt = dt || 1 / 60; for (let t = 0; t < sec; t += dt) update(0, dt * 1000); }
    };
  }

  return { create, LEVELS, W, H };
})();
