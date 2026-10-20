// Editor de niveles: se arrastran piezas desde el panel, se acomodan en el nivel y se guarda
// el archivo levels/<id>.json en la carpeta del repo. Después se pushea y le llega a todos.
// Todo se mide en celdas de 36 px, igual que en el juego. y es la fila del borde de arriba (lo que se pisa).
(async function () {
  const $ = id => document.getElementById(id);
  if (CapoConfig.tactil()) { document.body.classList.add('off'); return; }

  const G = CapoNiveles.G;
  const BORRADORES = 'capo-editor-borradores';
  const cv = $('cv'), lienzo = $('lienzo');
  let ctx = cv.getContext('2d');
  const piezas = CapoPiezas.make(G);

  /* ---------- imágenes ---------- */
  function loadImg(src) {
    return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  }
  const im = {};
  const srcs = { ...CapoPiezas.images(), lejano: 'assets/vigilia/lejano.jpg', medio: 'assets/vigilia/medio.png', ojo: 'assets/vigilia/ojo.png', atlas: 'assets/capo/atlas.png' };
  await Promise.all(Object.entries(srcs).map(async ([k, s]) => { const i = await loadImg(s); if (i) im[k] = i; }));
  let frames = {};
  try { frames = await (await fetch('assets/capo/frames.json')).json(); } catch (e) { /* sin Capo de referencia */ }
  const cfg = await CapoConfig.base();

  /* ---------- estado ---------- */
  let orden = [];          // lista de levels/index.json
  let d = null;            // nivel en edición (mismo formato que el archivo)
  let fileId = null;       // id con el que vino del archivo (para renombrar)
  let fileText = '';       // contenido del archivo tal como está en el repo
  let sel = null;          // { k: 'p'|'e'|'d'|'c'|'door'|'start', i }
  let preview = null;      // pieza que se está arrastrando desde el panel
  let showGrid = true;
  const view = { z: 1, ox: 40, oy: 40 };
  let undo = [], redo = [];

  /* ---------- formato del archivo ---------- */
  const r3 = v => Math.round(v * 1000) / 1000;
  function clean(o) {
    if (Array.isArray(o)) return o.map(clean);
    if (o && typeof o === 'object') {
      const out = {};
      for (const k of Object.keys(o)) if (o[k] !== undefined && o[k] !== null && o[k] !== '') out[k] = clean(o[k]);
      return out;
    }
    return typeof o === 'number' ? r3(o) : o;
  }
  // Una pieza por línea: se lee fácil y los cambios quedan claros en git.
  function serialize(data) {
    const c = clean(data);
    const keys = ['id', 'name', 'w', 'h', 'fondo', 'start', 'platforms', 'eyes', 'checkpoints', 'drops', 'door', 'next'];
    const line = a => a.length ? '[\n    ' + a.map(o => JSON.stringify(o)).join(',\n    ') + '\n  ]' : '[]';
    const rows = keys.filter(k => c[k] !== undefined).map(k => `  "${k}": ` + (Array.isArray(c[k]) ? line(c[k]) : JSON.stringify(c[k])));
    return '{\n' + rows.join(',\n') + '\n}\n';
  }
  const snapshot = () => JSON.stringify(d);

  /* ---------- borradores (por si se cierra la pestaña) ---------- */
  function drafts() { try { return JSON.parse(localStorage.getItem(BORRADORES) || '{}'); } catch (e) { return {}; } }
  let draftKey = null;
  function saveDraft() {
    const all = drafts();
    // Un nivel nuevo al que se le cambia el id: el borrador viejo se reemplaza.
    if (draftKey && draftKey !== (fileId || d.id) && !fileId) delete all[draftKey];
    draftKey = fileId || d.id;
    if (serialize(d) === fileText) delete all[fileId || d.id];
    else all[fileId || d.id] = { data: d, at: Date.now(), nuevo: !fileText };
    try { localStorage.setItem(BORRADORES, JSON.stringify(all)); } catch (e) { /* lleno o privado */ }
  }
  function dropDraft(id) { const all = drafts(); delete all[id]; try { localStorage.setItem(BORRADORES, JSON.stringify(all)); } catch (e) { /* nada */ } }

  /* ---------- cambios y deshacer ---------- */
  let before = null;
  function begin() { if (before == null) before = snapshot(); }
  function commit() {
    if (before == null) return;
    if (before !== snapshot()) { undo.push(before); if (undo.length > 200) undo.shift(); redo = []; changed(); }
    before = null;
  }
  function changed() { saveDraft(); paintStatus(); renderProps(); dirtyBg(); draw(); }
  function step(from, to) {
    if (!from.length) return;
    to.push(snapshot());
    d = JSON.parse(from.pop());
    if (sel && !getItem(sel)) sel = null;
    changed();
  }

  /* ---------- piezas del panel ---------- */
  const PALETA = [
    ['Plataformas', [
      { label: 'Cresta', k: 'p', o: { t: 'plt', w: 6, h: 4 } },
      { label: 'Fina', k: 'p', o: { t: 'plt', w: 4, h: 1 } },
      { label: 'Isla', k: 'p', o: { t: 'plt', w: 2, h: 2 } },
      { label: 'Pilar', k: 'p', o: { t: 'pilar', w: 1, h: 4 } },
      { label: 'Rebote', k: 'p', o: { t: 'rebote', w: 3, h: 1 } },
      { label: 'Frágil', k: 'p', o: { t: 'fragil', w: 3, h: 1 } },
      { label: 'Espinas', k: 'p', o: { t: 'espinas', w: 4 } },
      { label: 'Móvil', k: 'p', o: { t: 'movil', w: 3, to: [5, 0], period: 4 } },
      { label: 'Párpado', k: 'p', o: { t: 'parpado', w: 3, on: 2, off: 1.4, offset: 0 } }
    ]],
    ['Ojos láser', [
      { label: 'Fijo', k: 'e', o: { type: 'fijo', angle: 180 } },
      { label: 'Rastreador', k: 'e', o: { type: 'rastreador' } },
      { label: 'Barredor', k: 'e', o: { type: 'barredor', angle: 180, arc: 60 } },
      { label: 'Cuelga', k: 'e', o: { type: 'fijo', angle: 90, down: true } }
    ]],
    ['Recorrido', [
      { label: 'Gota', k: 'd' },
      { label: 'Control', k: 'c' },
      { label: 'Puerta', k: 'door' },
      { label: 'Inicio', k: 'start' }
    ]]
  ];

  // Crea la pieza del panel en una celda (cx, cy en celdas, sin redondear).
  function place(tpl, cx, cy, free) {
    const o = tpl.o ? JSON.parse(JSON.stringify(tpl.o)) : {};
    if (tpl.k === 'p') {
      o.x = Math.round(cx - o.w / 2); o.y = Math.round(cy);
      if (o.to) o.to = [o.x + o.to[0], o.y + o.to[1]];
      return { k: 'p', o: { t: o.t, x: o.x, y: o.y, ...o } };
    }
    if (tpl.k === 'e') return { k: 'e', o: { x: snap(cx, 0.5, free), y: Math.round(cy), ...o } };
    if (tpl.k === 'd') return { k: 'd', o: [snap(cx, 0.5, free), snap(cy, 0.5, free)] };
    if (tpl.k === 'c') return { k: 'c', o: { x: Math.floor(cx), y: Math.round(cy) } };
    if (tpl.k === 'door') return { k: 'door', o: { x: snap(cx, 0.5, free), y: Math.round(cy) } };
    return { k: 'start', o: { x: Math.round(cx), y: Math.round(cy) } };
  }
  function snap(v, s, free) { const q = free ? 0.1 : s; return r3(Math.round(v / q) * q); }

  function add(it) {
    begin();
    if (it.k === 'p') { d.platforms.push(it.o); sel = { k: 'p', i: d.platforms.length - 1 }; }
    else if (it.k === 'e') { d.eyes.push(it.o); sel = { k: 'e', i: d.eyes.length - 1 }; }
    else if (it.k === 'd') { d.drops.push(it.o); sel = { k: 'd', i: d.drops.length - 1 }; }
    else if (it.k === 'c') { d.checkpoints.push(it.o); d.checkpoints.sort((a, b) => a.x - b.x); sel = { k: 'c', i: d.checkpoints.indexOf(it.o) }; }
    else if (it.k === 'door') { d.door = it.o; sel = { k: 'door' }; }
    else { d.start = it.o; sel = { k: 'start' }; }
    commit();
  }

  /* ---------- acceso a cada cosa del nivel ---------- */
  function getItem(s) {
    if (!s || !d) return null;
    if (s.k === 'p') return d.platforms[s.i];
    if (s.k === 'e') return d.eyes[s.i];
    if (s.k === 'd') return d.drops[s.i];
    if (s.k === 'c') return d.checkpoints[s.i];
    if (s.k === 'door') return d.door;
    if (s.k === 'start') return d.start;
    return null;
  }
  function pos(s) { const o = getItem(s); return s.k === 'd' ? { x: o[0], y: o[1] } : { x: o.x, y: o.y }; }
  function setPos(s, x, y) {
    const o = getItem(s);
    if (s.k === 'd') { o[0] = x; o[1] = y; return; }
    if (o.to) { o.to = [r3(o.to[0] + x - o.x), r3(o.to[1] + y - o.y)]; }
    o.x = x; o.y = y;
  }
  // Caja en celdas de cada cosa, para elegirla con el mouse.
  function box(s, o) {
    o = o || getItem(s);
    if (s.k === 'p') {
      if (o.t === 'espinas') return [o.x, o.y - 0.6, o.w, 0.8];
      if (o.t === 'rebote') return [o.x, o.y - 0.4, o.w, 1];
      if (o.t === 'movil' || o.t === 'parpado') return [o.x, o.y, o.w, 1.2];
      return [o.x, o.y, o.w, o.h || 1];
    }
    if (s.k === 'e') return o.down ? [o.x - 0.6, o.y, 1.2, 1.8] : [o.x - 0.6, o.y - 1.8, 1.2, 1.8];
    if (s.k === 'd') return [o[0] - 0.4, o[1] - 0.5, 0.8, 1];
    if (s.k === 'c') return [o.x + 0.1, o.y - 1.6, 0.8, 1.6];
    if (s.k === 'door') return [o.x - 1, o.y - 3, 2, 3];
    return [o.x - 0.6, o.y - 2.1, 1.2, 2.1];
  }
  const inBox = (b, x, y) => x >= b[0] && x <= b[0] + b[2] && y >= b[1] && y <= b[1] + b[3];
  function hit(x, y) {
    if (d.start && inBox(box({ k: 'start' }), x, y)) return { k: 'start' };
    if (d.door && inBox(box({ k: 'door' }), x, y)) return { k: 'door' };
    for (let i = d.drops.length - 1; i >= 0; i--) if (inBox(box({ k: 'd', i }), x, y)) return { k: 'd', i };
    for (let i = d.checkpoints.length - 1; i >= 0; i--) if (inBox(box({ k: 'c', i }), x, y)) return { k: 'c', i };
    for (let i = d.eyes.length - 1; i >= 0; i--) if (inBox(box({ k: 'e', i }), x, y)) return { k: 'e', i };
    // Lo chico y lo que va encima primero; las crestas grandes al final.
    const rank = p => (p.t === 'plt' ? 2 : 0);
    let best = null;
    for (let i = d.platforms.length - 1; i >= 0; i--) {
      const p = d.platforms[i];
      if (!inBox(box({ k: 'p', i }), x, y)) continue;
      if (!best || rank(p) < rank(d.platforms[best.i])) best = { k: 'p', i };
    }
    return best;
  }

  /* ---------- vista ---------- */
  let W = 1, H = 1, DPR = 1;
  function resize() {
    const r = lienzo.getBoundingClientRect();
    DPR = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    draw();
  }
  const toWorld = (sx, sy) => ({ x: (sx - view.ox) / view.z / G, y: (sy - view.oy) / view.z / G });
  function fit() {
    if (!d) return;
    view.z = Math.max(0.15, Math.min(2.5, (H - 70) / (d.h * G)));
    view.ox = 30; view.oy = (H - d.h * G * view.z) / 2;
    draw();
  }
  function zoomAt(f, sx, sy) {
    const z = Math.max(0.12, Math.min(3, view.z * f));
    view.ox = sx - (sx - view.ox) * z / view.z;
    view.oy = sy - (sy - view.oy) * z / view.z;
    view.z = z;
    draw();
  }

  /* ---------- fondo (mismas capas que el juego, sin parallax) ---------- */
  let bg = null, bgKey = '';
  function dirtyBg() { const k = [d.w, d.h, d.fondo].join(); if (k !== bgKey) { bgKey = k; bg = null; } }
  function tinted(img, w, h, tint) {
    const strip = () => {
      const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h);
      const x = c.getContext('2d'), tw = h * img.width / img.height;
      for (let px = 0; px < w; px += tw) x.drawImage(img, px, 0, tw, h);
      return c;
    };
    const base = strip();
    if (tint == null) return base;
    // Teñido como en el juego: se multiplica el color y se recupera la transparencia de la capa.
    const c = strip(), x = c.getContext('2d');
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = '#' + tint.toString(16).padStart(6, '0'); x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(base, 0, 0);
    return c;
  }
  function makeBg() {
    const c = document.createElement('canvas'), w = d.w * G, h = d.h * G;
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    for (const ly of CapoNiveles.layers(d.fondo, d.h)) {
      const img = im[ly.key]; if (!img) continue;
      x.globalAlpha = ly.alpha == null ? 1 : ly.alpha;
      x.drawImage(tinted(img, w, ly.height, ly.tint), 0, ly.bottom - ly.height);
    }
    return c;
  }

  /* ---------- dibujo ---------- */
  let pending = false;
  function draw() { if (!pending) { pending = true; requestAnimationFrame(render); } }
  function render() {
    pending = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0f1013'; ctx.fillRect(0, 0, cv.width, cv.height);
    if (!d) return;
    const z = view.z;
    ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * view.ox, DPR * view.oy);
    const LW = d.w * G, LH = d.h * G;

    if (!bg) bg = makeBg();
    ctx.drawImage(bg, 0, 0);
    if (showGrid) drawGrid(LW, LH);

    // Plataformas pintadas igual que en el juego.
    const all = preview && preview.k === 'p' ? d.platforms.concat([preview.o]) : d.platforms;
    const imgs = { ...im };
    piezas.paint(all)(ctx, imgs);
    for (const p of all) if (p.t === 'fragil') drawFragil(p);
    for (const p of all) if (p.t === 'movil' || p.t === 'parpado') drawMover(p);
    for (const p of all) if (p.t === 'movil') drawMoverPath(p);
    for (const c of d.checkpoints) drawStake(c);
    for (const e of d.eyes) drawEye(e);
    for (const g of d.drops) drawDrop(g[0], g[1]);
    if (d.door) drawDoor(d.door);
    if (d.start) drawCapo(d.start);
    if (preview && preview.k !== 'p') {
      ctx.save(); ctx.globalAlpha = 0.75;
      if (preview.k === 'e') drawEye(preview.o);
      else if (preview.k === 'd') drawDrop(preview.o[0], preview.o[1]);
      else if (preview.k === 'c') drawStake(preview.o);
      else if (preview.k === 'door') drawDoor(preview.o);
      else drawCapo(preview.o);
      ctx.restore();
    }

    // Bordes del nivel: afuera se oscurece.
    ctx.fillStyle = 'rgba(15,16,19,0.72)';
    const big = 1e5;
    ctx.fillRect(-big, -big, big * 2 + LW, big); ctx.fillRect(-big, LH, big * 2 + LW, big);
    ctx.fillRect(-big, 0, big, LH); ctx.fillRect(LW, 0, big, LH);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1 / z; ctx.strokeRect(0, 0, LW, LH);

    if (sel && getItem(sel)) drawSelection();
    drawRuler();
    $('zoomTxt').textContent = Math.round(z * 100) + '%';
  }

  function drawGrid(LW, LH) {
    const z = view.z, a = toWorld(0, 0), b = toWorld(W, H);
    const c0 = Math.max(0, Math.floor(a.x)), c1 = Math.min(d.w, Math.ceil(b.x));
    const r0 = Math.max(0, Math.floor(a.y)), r1 = Math.min(d.h, Math.ceil(b.y));
    ctx.lineWidth = 1 / z;
    for (let c = c0; c <= c1; c++) {
      if (z < 0.35 && c % 5) continue;
      ctx.strokeStyle = c % 10 === 0 ? 'rgba(255,255,255,0.22)' : c % 5 === 0 ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.moveTo(c * G, 0); ctx.lineTo(c * G, LH); ctx.stroke();
    }
    for (let r = r0; r <= r1; r++) {
      if (z < 0.35 && r % 5) continue;
      ctx.strokeStyle = r % 5 === 0 ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.moveTo(0, r * G); ctx.lineTo(LW, r * G); ctx.stroke();
    }
  }
  // Números de columna arriba, cada 10 celdas: sirven para hablar del nivel ("el tramo de la 40").
  function drawRuler() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.font = '10px "IBM Plex Mono", monospace'; ctx.fillStyle = 'rgba(235,233,228,0.5)'; ctx.textBaseline = 'top';
    const step = view.z < 0.3 ? 20 : 10;
    for (let c = 0; c <= d.w; c += step) {
      const sx = view.ox + c * G * view.z;
      if (sx < -20 || sx > W + 20) continue;
      ctx.fillText(String(c), sx + 3, 6);
    }
    ctx.setTransform(DPR * view.z, 0, 0, DPR * view.z, DPR * view.ox, DPR * view.oy);
  }

  function drawFragil(p) {
    const X = p.x * G, Y = p.y * G, w = p.w * G, img = im.fragil;
    if (img) { const sc = (w + 12) / img.width; ctx.drawImage(img, X - 6, Y, w + 12, img.height * sc); }
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (let dx = 9; dx < w + 2; dx += 9) ctx.fillRect(X - 6 + dx, Y + 1, 5, 1.6);
  }
  function drawMover(p) { piezas.paintPiece(ctx, p, im); }
  function drawMoverPath(p) {
    if (!p.to) return;
    const ax = (p.x + p.w / 2) * G, ay = p.y * G, bx = (p.to[0] + p.w / 2) * G, by = p.to[1] * G;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.translate((p.to[0] - p.x) * G, (p.to[1] - p.y) * G);
    piezas.paintPiece(ctx, p, im);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.5 / view.z; ctx.setLineDash([6 / view.z, 5 / view.z]);
    ctx.beginPath(); ctx.moveTo(ax, ay - 4); ctx.lineTo(bx, by - 4); ctx.stroke();
    ctx.restore();
  }

  const EYE = { height: 62, fw: 240, fh: 300, cy: 148 };
  function eyeGeom(e) {
    const sc = EYE.height / EYE.fh, bx = e.x * G, by = e.y * G, lift = (EYE.fh - EYE.cy) * sc;
    return { sc, bx, by, cx: bx, cy: e.down ? by + lift : by - lift };
  }
  function eyeHandle(e) {
    const g = eyeGeom(e), a = (e.angle || 0) * Math.PI / 180, L = 3.2 * G;
    return { x: g.cx + Math.cos(a) * L, y: g.cy + Math.sin(a) * L };
  }
  function drawEye(e) {
    const g = eyeGeom(e), w = EYE.fw * g.sc, h = EYE.height;
    // Hacia dónde mira: fijo una línea, barredor el abanico, rastreador un círculo (apunta a Capo).
    ctx.save();
    ctx.lineWidth = 1.5 / view.z;
    ctx.strokeStyle = 'rgba(214,40,60,0.85)'; ctx.fillStyle = 'rgba(214,40,60,0.14)';
    const a = (e.angle || 0) * Math.PI / 180, L = 3.2 * G;
    if (e.type === 'rastreador') {
      ctx.setLineDash([4 / view.z, 4 / view.z]);
      ctx.beginPath(); ctx.arc(g.cx, g.cy, 2.2 * G, 0, Math.PI * 2); ctx.stroke();
    } else if (e.type === 'barredor') {
      const arc = (e.arc || 60) * Math.PI / 180;
      ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.arc(g.cx, g.cy, L, a - arc / 2, a + arc / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.lineTo(g.cx + Math.cos(a) * L, g.cy + Math.sin(a) * L); ctx.stroke();
    }
    ctx.restore();
    if (!im.ojo) return;
    ctx.save();
    ctx.translate(g.bx, g.by);
    if (e.down) ctx.scale(1, -1);
    ctx.drawImage(im.ojo, EYE.fw, 0, EYE.fw, EYE.fh, -w / 2, -h, w, h);
    ctx.restore();
  }

  function drawDrop(x, y) {
    ctx.save();
    ctx.translate(x * G - 12.6, y * G - 15.3); ctx.scale(0.9, 0.9);
    const path = () => {
      ctx.beginPath(); ctx.moveTo(14, 2);
      ctx.bezierCurveTo(17, 10, 25, 15, 25, 22); ctx.bezierCurveTo(25, 29, 20, 32, 14, 32);
      ctx.bezierCurveTo(8, 32, 3, 29, 3, 22); ctx.bezierCurveTo(3, 15, 11, 10, 14, 2); ctx.closePath();
    };
    const gr = ctx.createRadialGradient(11, 20, 1, 14, 22, 13);
    gr.addColorStop(0, 'rgba(250,214,120,0.95)'); gr.addColorStop(0.7, 'rgba(222,160,46,0.92)'); gr.addColorStop(1, 'rgba(176,110,20,0.95)');
    path(); ctx.fillStyle = gr; ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(120,70,10,0.75)'; path(); ctx.stroke();
    ctx.restore();
  }
  function drawStake(c) {
    ctx.save();
    ctx.translate((c.x + 0.5) * G - 0.27 * 24, c.y * G + 2 - 48); ctx.scale(0.8, 0.8);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#141418'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(8, 59); ctx.lineTo(7.5, 30); ctx.lineTo(8.5, 4); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.moveTo(9, 5); ctx.quadraticCurveTo(18, 7, 27, 6); ctx.lineTo(23, 12); ctx.lineTo(28, 18);
    ctx.quadraticCurveTo(18, 17, 9, 19); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
  }
  function drawDoor(o) {
    const X = o.x * G, Y = o.y * G;
    ctx.save();
    const halo = ctx.createRadialGradient(X, Y - 22, 0, X, Y - 22, 48);
    halo.addColorStop(0, 'rgba(255,236,190,0.45)'); halo.addColorStop(1, 'rgba(250,214,130,0)');
    ctx.fillStyle = halo; ctx.fillRect(X - 48, Y - 70, 96, 96);
    ctx.translate(X - 33.25, Y + 2 - 104.5); ctx.scale(0.95, 0.95);
    const arch = k => { ctx.beginPath(); ctx.moveTo(12 - k, 108); ctx.lineTo(12 - k, 40); ctx.bezierCurveTo(12 - k, 10 - k, 58 + k, 10 - k, 58 + k, 40); ctx.lineTo(58 + k, 108); };
    const gr = ctx.createRadialGradient(35, 70, 4, 35, 64, 46);
    gr.addColorStop(0, 'rgba(255,246,214,1)'); gr.addColorStop(0.55, 'rgba(250,214,130,0.95)'); gr.addColorStop(1, 'rgba(222,160,46,0.55)');
    arch(0); ctx.closePath(); ctx.fillStyle = gr; ctx.fill();
    ctx.lineCap = 'round'; ctx.strokeStyle = '#141418'; ctx.lineWidth = 2.6; arch(0); ctx.stroke();
    ctx.restore();
  }
  function drawCapo(o) {
    const X = o.x * G, Y = o.y * G, q = frames[cfg.capo.idle];
    if (im.atlas && q) {
      const h = cfg.capo.height, w = q[2] * h / q[3];
      ctx.drawImage(im.atlas, q[0], q[1], q[2], q[3], X - w / 2, Y - h, w, h);
    } else {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X, Y - 64, 8, 0, 7); ctx.moveTo(X, Y - 56); ctx.lineTo(X, Y - 20); ctx.lineTo(X - 8, Y); ctx.moveTo(X, Y - 20); ctx.lineTo(X + 8, Y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(194,48,122,0.9)';
    ctx.font = '600 11px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText('inicio', X, Y + 14); ctx.textAlign = 'left';
  }

  // Manijas de la pieza elegida: ancho a la derecha, alto abajo, destino del móvil y mira del ojo.
  function handles() {
    const o = getItem(sel), out = [];
    if (!o) return out;
    if (sel.k === 'p') {
      const b = box(sel);
      out.push({ id: 'w', x: (o.x + o.w) * G, y: (b[1] + b[3] / 2) * G });
      if (o.t === 'plt' || o.t === 'pilar') out.push({ id: 'h', x: (o.x + o.w / 2) * G, y: (o.y + (o.h || 1)) * G });
      if (o.t === 'movil' && o.to) out.push({ id: 'to', x: (o.to[0] + o.w / 2) * G, y: o.to[1] * G });
    }
    if (sel.k === 'e' && o.type !== 'rastreador') { const h = eyeHandle(o); out.push({ id: 'angle', x: h.x, y: h.y }); }
    return out;
  }
  function drawSelection() {
    const b = box(sel), z = view.z;
    ctx.save();
    ctx.strokeStyle = '#e2559c'; ctx.lineWidth = 2 / z; ctx.setLineDash([]);
    ctx.strokeRect(b[0] * G - 3 / z, b[1] * G - 3 / z, b[2] * G + 6 / z, b[3] * G + 6 / z);
    for (const h of handles()) {
      const s = 9 / z;
      ctx.fillStyle = h.id === 'to' || h.id === 'angle' ? '#ffffff' : '#e2559c';
      ctx.strokeStyle = '#0f1013'; ctx.lineWidth = 1.5 / z;
      ctx.beginPath();
      if (h.id === 'to' || h.id === 'angle') ctx.arc(h.x, h.y, s / 1.6, 0, 7); else ctx.rect(h.x - s / 2, h.y - s / 2, s, s);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- mouse en el lienzo ---------- */
  let drag = null, space = false;
  const local = e => { const r = cv.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; };

  cv.addEventListener('pointerdown', e => {
    if (!d) return;
    cv.setPointerCapture(e.pointerId);
    const { sx, sy } = local(e), w = toWorld(sx, sy);
    if (space || e.button === 1) { drag = { mode: 'pan', sx, sy, ox: view.ox, oy: view.oy }; lienzo.classList.add('panning'); return; }
    if (e.button !== 0) return;
    if (sel) {
      for (const h of handles()) {
        if (Math.hypot(h.x * view.z + view.ox - sx, h.y * view.z + view.oy - sy) < 9) {
          begin(); drag = { mode: h.id }; return;
        }
      }
    }
    const found = hit(w.x, w.y);
    if (found) {
      sel = found; begin();
      const p = pos(found);
      drag = { mode: 'move', wx: w.x, wy: w.y, x: p.x, y: p.y };
      renderProps(); draw();
    } else {
      if (sel) { sel = null; renderProps(); }
      drag = { mode: 'pan', sx, sy, ox: view.ox, oy: view.oy }; lienzo.classList.add('panning');
      draw();
    }
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const { sx, sy } = local(e), w = toWorld(sx, sy), free = e.altKey;
    const o = getItem(sel);
    if (drag.mode === 'pan') { view.ox = drag.ox + sx - drag.sx; view.oy = drag.oy + sy - drag.sy; draw(); return; }
    if (!o) return;
    if (drag.mode === 'move') {
      const s = sel.k === 'p' || sel.k === 'c' || sel.k === 'start' ? 1 : 0.5;
      const nx = snap(drag.x + w.x - drag.wx, s, free && s !== 1), ny = snap(drag.y + w.y - drag.wy, sel.k === 'd' ? 0.5 : 1, free && sel.k === 'd');
      setPos(sel, nx, ny);
    } else if (drag.mode === 'w') {
      o.w = Math.max(1, Math.round(w.x - o.x));
    } else if (drag.mode === 'h') {
      o.h = Math.max(1, Math.round(w.y - o.y));
    } else if (drag.mode === 'to') {
      o.to = [Math.round(w.x - o.w / 2), Math.round(w.y)];
    } else if (drag.mode === 'angle') {
      const g = eyeGeom(o);
      let a = Math.atan2(w.y * G - g.cy, w.x * G - g.cx) * 180 / Math.PI;
      a = e.shiftKey ? Math.round(a / 15) * 15 : Math.round(a);
      o.angle = (a + 360) % 360;
    }
    renderPropsValues(); draw();
  });
  function endDrag() {
    if (!drag) return;
    lienzo.classList.remove('panning');
    if (drag.mode !== 'pan') commit();
    drag = null;
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const { sx, sy } = local(e);
    if (e.ctrlKey || e.metaKey) { zoomAt(Math.exp(-e.deltaY * 0.0025), sx, sy); return; }
    let dx = e.deltaX, dy = e.deltaY;
    // Rueda de mouse común (sin desplazamiento lateral): mueve de costado, que es para donde crecen los niveles.
    if (e.shiftKey || (dx === 0 && (e.deltaMode === 1 || Math.abs(dy) >= 50))) { dx = dy; dy = 0; }
    const k = e.deltaMode === 1 ? 16 : 1;
    view.ox -= dx * k; view.oy -= dy * k;
    draw();
  }, { passive: false });

  /* ---------- arrastrar desde el panel ---------- */
  const fantasma = $('fantasma');
  function thumb(tpl) {
    const c = document.createElement('canvas'); c.width = 144; c.height = 96;
    const x = c.getContext('2d');
    const it = place(tpl, 0, 0);
    const b = box({ k: it.k }, it.o);
    let bw = b[2], bh = b[3];
    if (it.k === 'p' && it.o.to) bw = it.o.to[0] - it.o.x + it.o.w;
    const s = Math.min(130 / (bw * G), 80 / (bh * G + 20), 1.6);
    x.translate(72 - (b[0] + bw / 2) * G * s, 48 - (b[1] + bh / 2) * G * s);
    x.scale(s, s);
    withCtx(x, () => {
      if (it.k === 'p') {
        piezas.paint([it.o])(x, im);
        if (it.o.t === 'fragil') drawFragil(it.o);
        if (it.o.t === 'movil' || it.o.t === 'parpado') drawMover(it.o);
        if (it.o.t === 'movil') drawMoverPath(it.o);
      } else if (it.k === 'e') drawEye(it.o);
      else if (it.k === 'd') drawDrop(0, 0);
      else if (it.k === 'c') drawStake(it.o);
      else if (it.k === 'door') drawDoor(it.o);
      else drawCapo(it.o);
    });
    return c;
  }
  // Las funciones de dibujo usan ctx; para las miniaturas se cambia por un rato.
  let ctxSwap = null;
  function withCtx(c, fn) {
    const realZ = view.z; ctxSwap = ctx; ctx = c; view.z = 1;
    try { fn(); } finally { ctx = ctxSwap; view.z = realZ; }
  }

  const paleta = $('paleta');
  for (const [title, items] of PALETA) {
    const sec = document.createElement('section');
    sec.innerHTML = `<h2>${title}</h2><div class="items"></div>`;
    const grid = sec.querySelector('.items');
    for (const tpl of items) {
      const el = document.createElement('div');
      el.className = 'item'; el.title = 'Arrastrá al nivel o hacé click';
      const c = thumb(tpl);
      el.appendChild(c);
      el.insertAdjacentHTML('beforeend', `<span>${tpl.label}</span>`);
      el.addEventListener('pointerdown', e => startNew(e, tpl, c));
      grid.appendChild(el);
    }
    paleta.appendChild(sec);
  }

  let newDrag = null;
  function startNew(e, tpl, c) {
    if (e.button !== 0 || !d) return;
    e.preventDefault();
    newDrag = { tpl, x0: e.clientX, y0: e.clientY, moved: false };
    fantasma.innerHTML = ''; const copy = document.createElement('canvas'); copy.width = c.width; copy.height = c.height;
    copy.getContext('2d').drawImage(c, 0, 0); fantasma.appendChild(copy);
    moveNew(e);
  }
  function overCanvas(e) {
    const r = cv.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }
  function moveNew(e) {
    if (!newDrag) return;
    if (Math.hypot(e.clientX - newDrag.x0, e.clientY - newDrag.y0) > 4) newDrag.moved = true;
    if (newDrag.moved) fantasma.hidden = false;
    fantasma.style.transform = `translate(${e.clientX - 40}px, ${e.clientY - 28}px)`;
    const over = overCanvas(e);
    fantasma.classList.toggle('sobre', over);
    if (over) { const { sx, sy } = local(e), w = toWorld(sx, sy); preview = place(newDrag.tpl, w.x, w.y, e.altKey); }
    else preview = null;
    draw();
  }
  addEventListener('pointermove', moveNew);
  addEventListener('pointerup', e => {
    if (!newDrag) return;
    if (newDrag.moved && overCanvas(e) && preview) add(preview);
    else if (!newDrag.moved) { const w = toWorld(W / 2, H / 2); add(place(newDrag.tpl, w.x, Math.min(d.h - 1, w.y))); }
    newDrag = null; preview = null; fantasma.hidden = true; draw();
  });

  /* ---------- propiedades ---------- */
  const NOMBRES = { plt: 'Cresta', pilar: 'Pilar', rebote: 'Rebote', fragil: 'Frágil', espinas: 'Espinas', movil: 'Móvil', parpado: 'Párpado' };
  const propsEl = $('props');
  let fields = [];

  function field(label, get, set, opt) {
    opt = opt || {};
    const lab = document.createElement('label');
    if (opt.wide) lab.className = 'ancho';
    let input;
    if (opt.options) {
      input = document.createElement('select');
      for (const [v, t] of opt.options) { const o = document.createElement('option'); o.value = v; o.textContent = t; input.appendChild(o); }
    } else {
      input = document.createElement('input');
      input.type = opt.text ? 'text' : 'number';
      if (!opt.text) input.step = opt.step || 1;
      if (opt.min != null) input.min = opt.min;
    }
    lab.append(label, input);
    const sync = () => { if (document.activeElement !== input) input.value = get() ?? ''; };
    sync();
    const apply = () => {
      let v = input.value;
      if (!opt.text && !opt.options) { if (v === '' || isNaN(+v)) return; v = +v; if (opt.min != null) v = Math.max(opt.min, v); }
      begin(); set(v); dirtyBg(); draw(); paintStatus();
    };
    input.addEventListener('input', apply);
    input.addEventListener('change', () => { apply(); commit(); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
    fields.push(sync);
    return lab;
  }
  function check(label, get, set) {
    const lab = document.createElement('label'); lab.className = 'check';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!get();
    input.addEventListener('change', () => { begin(); set(input.checked); commit(); });
    lab.append(input, label);
    fields.push(() => { input.checked = !!get(); });
    return lab;
  }
  function btn(text, fn, cls) { const b = document.createElement('button'); b.className = 'btn small ' + (cls || ''); b.textContent = text; b.addEventListener('click', fn); return b; }
  function group(...kids) { const g = document.createElement('div'); g.className = 'campos'; g.append(...kids); return g; }
  function title(t, small) { const h = document.createElement('div'); h.className = 'titulo'; h.innerHTML = `<h3></h3><small></small>`; h.querySelector('h3').textContent = t; h.querySelector('small').textContent = small || ''; return h; }

  function renderPropsValues() { fields.forEach(f => f()); }
  function renderProps() {
    fields = [];
    propsEl.innerHTML = '';
    if (!d) return;
    const o = getItem(sel);
    if (!o) return renderLevelProps();
    const s = sel, sec = document.createElement('section');
    const xy = [
      field('x', () => pos(s).x, v => setPos(s, v, pos(s).y), { step: s.k === 'p' || s.k === 'c' || s.k === 'start' ? 1 : 0.5 }),
      field('y', () => pos(s).y, v => setPos(s, pos(s).x, v), { step: s.k === 'd' ? 0.1 : 1 })
    ];
    if (s.k === 'p') {
      sec.append(title(NOMBRES[o.t] || o.t, o.t === 'plt' && (o.h || 1) <= 2 ? 'fina: se baja tirando abajo' : ''));
      const g = group(...xy, field('ancho', () => o.w, v => (o.w = v), { min: 1 }));
      if (o.t === 'plt' || o.t === 'pilar') g.append(field('alto', () => o.h || 1, v => { o.h = v; renderTitleSoon(); }, { min: 1 }));
      if (o.t === 'movil') g.append(
        field('va a x', () => o.to[0], v => (o.to[0] = v)), field('va a y', () => o.to[1], v => (o.to[1] = v)),
        field('ida y vuelta (s)', () => o.period, v => (o.period = v), { step: 0.1, min: 0.5, wide: true }));
      if (o.t === 'parpado') g.append(
        field('abierto (s)', () => o.on, v => (o.on = v), { step: 0.1, min: 0.2 }), field('cerrado (s)', () => o.off, v => (o.off = v), { step: 0.1, min: 0.2 }),
        field('desfase (fracción del ciclo)', () => o.offset || 0, v => (o.offset = v), { step: 0.05, wide: true }));
      sec.append(g);
      if (o.t === 'espinas') sec.append(note('Van paradas sobre una cresta: ponelas a la misma y que el borde.'));
      if (o.t === 'parpado') sec.append(note('En una fila, bajá el desfase de a poco (0, -0,3, -0,6) para que se abran en ola.'));
    } else if (s.k === 'e') {
      sec.append(title('Ojo láser', o.down ? 'cuelga desde arriba' : 'nace del piso'));
      const g = group(...xy, field('tipo', () => o.type || 'fijo', v => { o.type = v; if (v !== 'rastreador' && o.angle == null) o.angle = 180; renderPropsSoon(); }, { options: [['fijo', 'fijo'], ['rastreador', 'rastreador'], ['barredor', 'barredor']], wide: true }));
      if (o.type !== 'rastreador') g.append(field('ángulo', () => o.angle || 0, v => (o.angle = v), { step: 1 }));
      if (o.type === 'barredor') g.append(field('abanico', () => o.arc || 60, v => (o.arc = v), { step: 5, min: 5 }));
      g.append(field('demora 1er disparo (s)', () => o.offset || 0, v => (o.offset = v || undefined), { step: 0.05, min: 0, wide: true }));
      g.append(check('cuelga desde arriba', () => o.down, v => { o.down = v || undefined; renderPropsSoon(); }));
      sec.append(g, note('Ángulo: 0 derecha, 90 abajo, 180 izquierda. Se gira con la manija blanca (Shift de a 15°).'));
    } else {
      const T = { d: ['Gota', 'se junta'], c: ['Punto de control', 'vuelve acá si muere'], door: ['Puerta de luz', 'fin del nivel'], start: ['Inicio', 'donde arranca Capo'] }[s.k];
      sec.append(title(T[0], T[1]), group(...xy));
    }
    const b = document.createElement('div'); b.className = 'btns';
    if (s.k !== 'start') b.append(btn('Duplicar', duplicate), btn('Borrar', remove, 'danger'));
    b.append(btn('Listo', () => { sel = null; renderProps(); draw(); }));
    sec.append(b);
    propsEl.append(sec);
  }
  const renderPropsSoon = () => setTimeout(renderProps);
  const renderTitleSoon = () => setTimeout(() => { const s = propsEl.querySelector('.titulo small'); const o = getItem(sel); if (s && o && o.t === 'plt') s.textContent = (o.h || 1) <= 2 ? 'fina: se baja tirando abajo' : ''; });
  function note(t) { const p = document.createElement('p'); p.className = 'nota'; p.textContent = t; return p; }

  function renderLevelProps() {
    const sec = document.createElement('section');
    sec.append(title('Nivel', fileText ? 'levels/' + (fileId || d.id) + '.json' : 'nuevo'));
    const nexts = [['', 'sigue el orden']].concat(orden.filter(id => id !== d.id).map(id => [id, id]));
    sec.append(group(
      field('nombre', () => d.name, v => { d.name = v; paintLevelList(); }, { text: true, wide: true }),
      field('archivo (id)', () => d.id, v => { d.id = slug(v); paintLevelList(); }, { text: true, wide: true }),
      field('ancho (celdas)', () => d.w, v => (d.w = Math.round(v)), { min: 10 }),
      field('alto (celdas)', () => d.h, v => (d.h = Math.round(v)), { min: 8 }),
      field('fondo', () => d.fondo || 'dia', v => (d.fondo = v), { options: [['dia', 'día'], ['noche', 'noche']] }),
      field('después va a', () => d.next || '', v => (d.next = v || undefined), { options: nexts })
    ));
    propsEl.append(sec);

    const c = document.createElement('section');
    c.innerHTML = '<h2>En el nivel</h2>';
    const n = t => d.platforms.filter(p => p.t === t).length;
    const rows = [['crestas', n('plt')], ['móviles y párpados', n('movil') + n('parpado')], ['ojos', d.eyes.length], ['gotas', d.drops.length], ['puntos de control', d.checkpoints.length]];
    const cuenta = document.createElement('div'); cuenta.className = 'cuenta';
    for (const [k, v] of rows) cuenta.insertAdjacentHTML('beforeend', `<span>${k}</span><b>${v}</b>`);
    c.append(cuenta);
    const av = avisos();
    if (av.length) { const ul = document.createElement('ul'); ul.className = 'avisos'; av.forEach(a => { const li = document.createElement('li'); li.textContent = a; ul.append(li); }); c.append(ul); }
    propsEl.append(c);

    const f = document.createElement('section');
    f.innerHTML = '<h2>Archivo</h2>';
    const b = document.createElement('div'); b.className = 'btns';
    b.append(btn('Descargar .json', download), btn('Copiar JSON', copyJSON));
    if (drafts()[fileId || d.id] && fileText) b.append(btn('Descartar cambios', discard, 'danger'));
    if (gh) b.append(btn('Cambiar token', openGh));
    f.append(b, note(ghNote()));
    propsEl.append(f);
  }
  function avisos() {
    const a = [];
    if (!d.door) a.push('Falta la puerta: el nivel no se puede terminar.');
    else if (d.door.x > d.w || d.door.y > d.h) a.push('La puerta quedó afuera del nivel.');
    if (d.start.x > d.w || d.start.y > d.h) a.push('El inicio quedó afuera del nivel.');
    if (!/^[a-z0-9-]+$/.test(d.id)) a.push('El id solo puede tener minúsculas, números y guiones.');
    return a;
  }
  const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'nivel';

  function duplicate() {
    const o = getItem(sel); if (!o || sel.k === 'start' || sel.k === 'door') return;
    const c = JSON.parse(JSON.stringify(o));
    if (sel.k === 'd') { c[0] += 1; add({ k: 'd', o: c }); return; }
    const dx = sel.k === 'p' ? o.w + 1 : 2;
    c.x += dx; if (c.to) c.to[0] += dx;
    add({ k: sel.k, o: c });
  }
  function remove() {
    if (!sel || sel.k === 'start') return;
    begin();
    if (sel.k === 'p') d.platforms.splice(sel.i, 1);
    else if (sel.k === 'e') d.eyes.splice(sel.i, 1);
    else if (sel.k === 'd') d.drops.splice(sel.i, 1);
    else if (sel.k === 'c') d.checkpoints.splice(sel.i, 1);
    else if (sel.k === 'door') d.door = null;
    sel = null;
    commit();
  }
  function nudge(dx, dy) {
    if (!sel) return;
    const p = pos(sel);
    begin(); setPos(sel, r3(p.x + dx), r3(p.y + dy)); commit();
  }

  /* ---------- teclado ---------- */
  const typing = () => /INPUT|SELECT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName);
  addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); publish(); return; }
    if (typing()) return;
    if (e.code === 'Space') { space = true; lienzo.classList.add('pan'); e.preventDefault(); return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? step(redo, undo) : step(undo, redo); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); step(redo, undo); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return; }
    if (e.key === 'Escape') { sel = null; renderProps(); draw(); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && sel) { e.preventDefault(); const k = e.shiftKey ? 5 : (e.altKey ? 0.1 : 1); nudge(arrows[e.key][0] * k, arrows[e.key][1] * k); return; }
    if (mod) return;
    if (e.key === 'g') { showGrid = !showGrid; draw(); }
    else if (e.key === 'f') fit();
    else if (e.key === 'p') probar();
    else if (e.key === '0') { zoomAt(1 / view.z, W / 2, H / 2); }
    else if (e.key === '+' || e.key === '=') zoomAt(1.2, W / 2, H / 2);
    else if (e.key === '-') zoomAt(1 / 1.2, W / 2, H / 2);
  });
  addEventListener('keyup', e => { if (e.code === 'Space') { space = false; lienzo.classList.remove('pan'); } });

  /* ---------- cargar niveles ---------- */
  const nivelSel = $('nivel');
  async function loadIndex() {
    try { orden = JSON.parse(await readText('levels/index.json')).orden || []; } catch (e) { orden = []; }
  }
  function paintLevelList() {
    const ids = orden.slice();
    for (const id in drafts()) if (!ids.includes(id)) ids.push(id);
    if (d && !ids.includes(fileId || d.id)) ids.push(fileId || d.id);
    nivelSel.innerHTML = '';
    for (const id of ids) {
      const o = document.createElement('option'); o.value = id;
      const isCur = d && id === (fileId || d.id);
      const name = isCur ? d.name : (drafts()[id] ? drafts()[id].data.name : id);
      o.textContent = name + (orden.includes(id) ? '' : ' (sin publicar)');
      nivelSel.appendChild(o);
    }
    if (d) nivelSel.value = fileId || d.id;
  }
  function normalize(x) {
    x.platforms = x.platforms || []; x.eyes = x.eyes || []; x.drops = x.drops || []; x.checkpoints = x.checkpoints || [];
    x.start = x.start || { x: 3, y: x.h - 4 }; if (x.door === undefined) x.door = null;
    return x;
  }
  async function openLevel(id) {
    let text = '';
    text = (await readText('levels/' + id + '.json')) || '';
    const draft = drafts()[id];
    const fromFile = text ? JSON.parse(text) : null;
    fileText = fromFile ? serialize(normalize(fromFile)) : '';
    fileId = fromFile ? id : null;
    d = normalize(draft ? draft.data : fromFile || newLevelData(id));
    sel = null; undo = []; redo = []; bgKey = ''; bg = null; draftKey = fileId || d.id;
    dirtyBg(); paintLevelList(); renderProps(); paintStatus(); fit();
    try { localStorage.setItem('capo-editor-ultimo', id); } catch (e) { /* nada */ }
  }
  function newLevelData(id) {
    const n = orden.length + 1;
    return {
      id: id || 'nivel-' + n, name: 'Nivel ' + n, w: 80, h: 20, fondo: 'dia', start: { x: 3, y: 16 },
      platforms: [{ t: 'plt', x: 0, y: 16, w: 12, h: 4 }, { t: 'plt', x: 68, y: 16, w: 12, h: 4 }],
      eyes: [], checkpoints: [], drops: [], door: { x: 77.5, y: 16 }
    };
  }
  nivelSel.addEventListener('change', () => openLevel(nivelSel.value));
  $('nuevo').addEventListener('click', () => {
    let n = orden.length + 1, id;
    do { id = 'nivel-' + n++; } while (orden.includes(id) || drafts()[id]);
    fileText = ''; fileId = null;
    d = newLevelData(id); d.name = 'Nivel ' + (n - 1);
    sel = null; undo = []; redo = []; bgKey = ''; bg = null; draftKey = fileId || d.id;
    saveDraft(); dirtyBg(); paintLevelList(); renderProps(); paintStatus(); fit();
  });

  function discard() {
    dropDraft(fileId || d.id);
    openLevel(fileId || d.id);
  }

  /* ---------- estado arriba ---------- */
  const estado = $('estado');
  function paintStatus(msg, warn) {
    const dirty = serialize(d) !== fileText;
    $('guardar').textContent = dirty ? 'Publicar •' : 'Publicar';
    if (msg) { estado.textContent = msg; estado.classList.toggle('aviso', !!warn); return; }
    const av = avisos();
    estado.classList.toggle('aviso', av.length > 0);
    estado.textContent = av.length ? av[0] : (dirty ? (fileText ? 'cambios sin publicar (quedan como borrador en este navegador)' : 'nivel nuevo, todavía no está publicado') : 'igual que lo publicado');
  }

  /* ---------- probar ---------- */
  function probar() {
    try { localStorage.setItem(CapoNiveles.PRUEBA, JSON.stringify(clean(d))); }
    catch (e) { paintStatus('No se pudo guardar la prueba (¿modo privado?)', true); return; }
    window.open('index.html?prueba=1', 'capo-prueba');
  }
  $('probar').addEventListener('click', probar);

  /* ---------- publicar en GitHub ---------- */
  // El editor hace el commit directo en el repo con la API de GitHub y Pages publica solo.
  // Hace falta un token del repo (se pega una vez y queda guardado en este navegador).
  const GH_KEY = 'capo-editor-github';
  function repoGuess() {
    const h = location.hostname, seg = location.pathname.split('/').filter(Boolean)[0];
    if (h.endsWith('.github.io') && seg) return { owner: h.split('.')[0], repo: seg };
    return { owner: 'nakarrospide', repo: 'capo' };
  }
  let gh = null;
  try { gh = JSON.parse(localStorage.getItem(GH_KEY) || 'null'); } catch (e) { gh = null; }

  async function api(path, opt) {
    opt = opt || {};
    const r = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}${path}`, {
      method: opt.method || 'GET', cache: 'no-store',
      headers: { Authorization: 'Bearer ' + gh.token, Accept: opt.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: opt.body ? JSON.stringify(opt.body) : undefined
    });
    if (opt.raw && r.status === 404) return null;
    if (!r.ok) {
      let msg = r.status + '';
      try { msg += ' ' + (await r.json()).message; } catch (e) { /* sin detalle */ }
      if (r.status === 401) msg = 'el token no sirve o venció';
      if (r.status === 403 || r.status === 404) msg = 'el token no tiene permiso de escritura en ' + gh.owner + '/' + gh.repo;
      throw new Error(msg);
    }
    return opt.raw ? r.text() : r.json();
  }
  // Lee del repo (lo último publicado) si hay token; si no, del sitio.
  async function readText(path) {
    if (gh) { try { return await api(`/contents/${path}?ref=${gh.branch}`, { raw: true }); } catch (e) { /* cae al sitio */ } }
    try { const r = await fetch(path, { cache: 'no-store' }); return r.ok ? r.text() : null; } catch (e) { return null; }
  }

  // Un solo commit con el nivel y el orden (y el archivo viejo borrado si se renombró).
  async function commitFiles(files, message) {
    const ref = await api(`/git/ref/heads/${gh.branch}`);
    const head = await api(`/git/commits/${ref.object.sha}`);
    const tree = await api('/git/trees', {
      method: 'POST',
      body: { base_tree: head.tree.sha, tree: files.map(f => f.content == null ? { path: f.path, mode: '100644', type: 'blob', sha: null } : { path: f.path, mode: '100644', type: 'blob', content: f.content }) }
    });
    const commit = await api('/git/commits', { method: 'POST', body: { message, tree: tree.sha, parents: [head.sha] } });
    await api(`/git/refs/heads/${gh.branch}`, { method: 'PATCH', body: { sha: commit.sha } });
    return commit;
  }

  let publishing = false;
  async function publish() {
    if (publishing) return;
    const av = avisos().filter(a => a.startsWith('El id'));
    if (av.length) { paintStatus(av[0], true); return; }
    if (!gh) { openGh(); return; }
    if (fileText && serialize(d) === fileText && fileId === d.id) { paintStatus('no hay cambios para publicar'); return; }
    publishing = true;
    paintStatus('publicando…');
    try {
      let idx = { orden: [] };
      const idxText = await api(`/contents/levels/index.json?ref=${gh.branch}`, { raw: true });
      if (idxText) idx = JSON.parse(idxText);
      idx.orden = idx.orden || [];
      const text = serialize(d), files = [{ path: `levels/${d.id}.json`, content: text }];
      const renamed = fileId && fileId !== d.id;
      if (renamed) { files.push({ path: `levels/${fileId}.json`, content: null }); idx.orden = idx.orden.map(id => (id === fileId ? d.id : id)); }
      if (!idx.orden.includes(d.id)) idx.orden.push(d.id);
      files.push({ path: 'levels/index.json', content: JSON.stringify(idx, null, 2) + '\n' });
      const verb = renamed ? `Renombra ${fileId} a ${d.id}` : (fileText ? 'Actualiza' : 'Nuevo nivel:');
      await commitFiles(files, `${verb} ${d.name} (editor)`);
      if (renamed) dropDraft(fileId);
      orden = idx.orden; fileText = text; fileId = d.id;
      dropDraft(d.id);
      paintLevelList(); renderProps();
      const t = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      paintStatus(`publicado a las ${t} · en el juego en uno o dos minutos`);
    } catch (e) {
      paintStatus('No se pudo publicar: ' + (e && e.message || e), true);
    } finally { publishing = false; }
  }
  $('guardar').addEventListener('click', publish);

  // Conectar: se pega el token una vez.
  const dlg = $('gh');
  function openGh() {
    const g = gh || { ...repoGuess(), branch: 'main' };
    $('ghRepo').textContent = g.owner + '/' + g.repo;
    $('ghToken').value = '';
    $('ghMsg').textContent = '';
    $('ghOut').hidden = !gh;
    dlg.showModal();
    $('ghToken').focus();
  }
  $('ghOk').addEventListener('click', async e => {
    e.preventDefault();
    const token = $('ghToken').value.trim();
    if (!token) { $('ghMsg').textContent = 'Pegá el token.'; return; }
    const prev = gh;
    gh = { ...repoGuess(), branch: 'main', token };
    $('ghMsg').textContent = 'probando…';
    try {
      const info = await api('');
      if (!info.permissions || !info.permissions.push) throw new Error('el token no tiene permiso de escritura en ' + gh.owner + '/' + gh.repo);
      gh.branch = info.default_branch || 'main';
      try { localStorage.setItem(GH_KEY, JSON.stringify(gh)); } catch (er) { /* se pide de nuevo */ }
      dlg.close();
      renderProps();
      publish();
    } catch (er) {
      gh = prev;
      $('ghMsg').textContent = 'No anduvo: ' + er.message;
    }
  });
  $('ghOut').addEventListener('click', e => {
    e.preventDefault();
    gh = null; try { localStorage.removeItem(GH_KEY); } catch (er) { /* nada */ }
    dlg.close(); renderProps();
    paintStatus('desconectado de GitHub');
  });
  $('ghCancel').addEventListener('click', e => { e.preventDefault(); dlg.close(); });
  function ghNote() {
    return gh ? `Publica en ${gh.owner}/${gh.repo} (${gh.branch}). Cada publicación es un commit.` : 'Publicar pide un token de GitHub la primera vez.';
  }

  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([serialize(d)], { type: 'application/json' }));
    a.download = d.id + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function copyJSON() {
    try { await navigator.clipboard.writeText(serialize(d)); paintStatus('JSON copiado'); }
    catch (e) { paintStatus('No se pudo copiar', true); }
  }

  addEventListener('beforeunload', () => { if (d) saveDraft(); });
  new ResizeObserver(resize).observe(lienzo);

  /* ---------- arranque ---------- */
  await loadIndex();
  let first = null;
  try { first = localStorage.getItem('capo-editor-ultimo'); } catch (e) { /* nada */ }
  if (!first || (!orden.includes(first) && !drafts()[first])) first = orden[0] || null;
  resize();
  if (first) await openLevel(first); else $('nuevo').click();

  window.editor = { get data() { return d; }, get sel() { return sel; }, view, serialize: () => serialize(d), open: openLevel };
})();
