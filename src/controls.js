// Controles compartidos: teclado, botones táctiles y sacudir el celular.
window.CapoControls = (function () {
  // Vibración al tocar. Android usa navigator.vibrate. Safari en iPhone no lo tiene,
  // pero desde iOS 18 tocar un interruptor nativo da un golpecito háptico: usamos uno escondido.
  const haptic = (function () {
    const canVibrate = typeof navigator.vibrate === 'function';
    let label = null;
    function sw() {
      if (label) return label;
      const input = document.createElement('input');
      input.type = 'checkbox'; input.id = 'capo-haptic'; input.setAttribute('switch', '');
      label = document.createElement('label');
      label.htmlFor = 'capo-haptic'; label.setAttribute('aria-hidden', 'true');
      label.style.display = 'none';
      label.appendChild(input);
      document.body.appendChild(label);
      return label;
    }
    return function (ms) {
      if (canVibrate) { try { navigator.vibrate(ms || 10); } catch (_) { /* nada */ } return; }
      try { sw().click(); } catch (_) { /* nada */ }
    };
  })();

  // Onda que sale del punto tocado.
  function ripple(host, x, y) {
    const r = host.getBoundingClientRect();
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.left = (x == null ? r.width / 2 : x - r.left) + 'px';
    s.style.top = (y == null ? r.height / 2 : y - r.top) + 'px';
    host.appendChild(s);
    s.addEventListener('animationend', () => s.remove());
  }

  function keyboard(api) {
    const typing = () => {
      const el = document.activeElement;
      return el && /INPUT|TEXTAREA|SELECT/.test(el.tagName) && !['range', 'checkbox'].includes(el.type);
    };
    addEventListener('keydown', e => {
      if (typing()) return;
      const k = e.key.toLowerCase(), i = api.input;
      if (k === 'arrowleft' || k === 'a') { i.l = true; i.mag = null; }
      else if (k === 'arrowright' || k === 'd') { i.r = true; i.mag = null; }
      else if (k === ' ' || k === 'arrowup' || k === 'w') { if (!e.repeat) i.jumpPressed = true; i.jump = true; }
      else if (k === 'arrowdown' || k === 's') { if (!e.repeat) i.downPressed = true; i.down = true; }
      else if (k === 'b' && !e.repeat) api.dance();
      else return;
      e.preventDefault();
    });
    addEventListener('keyup', e => {
      const k = e.key.toLowerCase(), i = api.input;
      if (k === 'arrowleft' || k === 'a') i.l = false;
      if (k === 'arrowright' || k === 'd') i.r = false;
      if (k === ' ' || k === 'arrowup' || k === 'w') i.jump = false;
      if (k === 'arrowdown' || k === 's') i.down = false;
    });
  }

  // Botón que se mantiene apretado (flechas, salto).
  function hold(el, down, up) {
    if (!el) return;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* nada */ }
      el.classList.add('on'); haptic(10); ripple(el, e.clientX, e.clientY); down();
    });
    const release = () => { el.classList.remove('on'); up(); };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  function pad(api, ids) {
    const $ = id => document.getElementById(id);
    hold($(ids.left), () => (api.input.l = true), () => (api.input.l = false));
    hold($(ids.right), () => (api.input.r = true), () => (api.input.r = false));
    hold($(ids.jump), () => { api.input.jumpPressed = true; api.input.jump = true; }, () => (api.input.jump = false));
    const d = $(ids.dance);
    if (d) d.addEventListener('pointerdown', e => { e.preventDefault(); haptic(14); ripple(d, e.clientX, e.clientY); api.dance(); });
  }

  // Cruceta de una pieza: el pulgar puede deslizarse de un brazo a otro sin levantarse.
  // Arriba salta; en diagonal arriba-costado salta y camina a la vez.
  function cross(el, api, glass) {
    let id = null, dir = { l: false, r: false, u: false };
    function read(e) {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const dz = r.width * 0.1;
      return {
        l: dx < -dz && -dx > Math.abs(dy) * 0.45,
        r: dx > dz && dx > Math.abs(dy) * 0.45,
        u: dy < -dz && -dy > Math.abs(dx) * 0.6
      };
    }
    function apply(n) {
      const pressed = (n.l && !dir.l) || (n.r && !dir.r) || (n.u && !dir.u);
      if (n.u && !dir.u) { api.input.jumpPressed = true; }
      api.input.l = n.l; api.input.r = n.r; api.input.jump = n.u;
      dir = n;
      if (pressed) haptic(8);
      for (const k of ['l', 'r', 'u']) el.classList.toggle('on-' + k, n[k]);
      if (glass) {
        glass.style.setProperty('--tx', (n.r ? 3 : n.l ? -3 : 0) + 'px');
        glass.style.setProperty('--ty', (n.u ? -3 : 0) + 'px');
      }
    }
    el.addEventListener('pointerdown', e => {
      if (id !== null) return;
      e.preventDefault(); id = e.pointerId;
      try { el.setPointerCapture(id); } catch (_) { /* nada */ }
      apply(read(e));
    });
    el.addEventListener('pointermove', e => { if (e.pointerId === id) apply(read(e)); });
    const end = e => { if (e.pointerId !== id) return; id = null; apply({ l: false, r: false, u: false }); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', e => e.preventDefault());
    return { release: () => { id = null; apply({ l: false, r: false, u: false }); } };
  }

  // Zona invisible: en la mitad izquierda, donde apoyás aparece un stick y arrastrás para caminar.
  // Saltar y bailar son botones aparte.
  function zones(el, api, stick, knob) {
    let mover = null, ox = 0, oy = 0, side = 0;
    const R = 46;
    function moveTo(e) {
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      stickInput(api, dx, dy, R);
      const n = dx > 12 ? 1 : dx < -12 ? -1 : 0;
      if (n !== side && n !== 0) haptic(6);
      side = n;
    }
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      const left = e.clientX < innerWidth * 0.5;
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* nada */ }
      if (left && mover === null) {
        mover = e.pointerId; ox = e.clientX; oy = e.clientY; side = 0;
        stick.style.left = ox + 'px'; stick.style.top = oy + 'px';
        knob.style.transform = 'translate(0, 0)';
        stick.classList.add('show');
        haptic(6);
      }
    });
    el.addEventListener('pointermove', e => { if (e.pointerId === mover) moveTo(e); });
    const end = e => {
      if (e.pointerId === mover) { mover = null; side = 0; stickInput(api, 0, 0, R); stick.classList.remove('show'); }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', e => e.preventDefault());
    return {
      release() { mover = null; stickInput(api, 0, 0, R); stick.classList.remove('show'); }
    };
  }

  // Trazos de pluma: círculo temblado y mancha, para que la UI parezca dibujada como Capo.
  const SVGNS = 'http://www.w3.org/2000/svg';
  function wobble(r, jitter, turns) {
    const pts = [], n = 28, a0 = Math.random() * 6.3;
    for (let i = 0; i <= n * turns; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      const rr = r + (Math.random() - 0.5) * jitter + i * 0.06;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += ` Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
    }
    return d;
  }
  // Mancha de tinta: contorno suave e irregular, con algunas puntas si es salpicadura.
  function blob(r, spikes) {
    const n = 22, pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      let rr = r * (0.82 + Math.random() * 0.26);
      if (spikes && Math.random() < 0.25) rr *= 1.25 + Math.random() * 0.35;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    const mid = i => { const p = pts[i % n], q = pts[(i + 1) % n]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; };
    let m = mid(0), d = `M${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
    for (let i = 1; i <= n; i++) {
      const p = pts[i % n], q = mid(i);
      d += ` Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
    }
    return d + 'Z';
  }
  function svgEl(size) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', `${-size / 2} ${-size / 2} ${size} ${size}`);
    s.setAttribute('width', size); s.setAttribute('height', size);
    return s;
  }
  function path(svg, d, cls) {
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d); p.setAttribute('class', cls);
    svg.appendChild(p);
    return p;
  }

  // Stick analógico: cuánto se arrastra decide si camina o corre; tirar para abajo baja de una plataforma fina.
  function stickInput(api, dx, dy, R) {
    const i = api.input;
    i.r = dx > 12; i.l = dx < -12;
    i.mag = i.l || i.r ? Math.max(0, Math.min(1, (Math.abs(dx) - 12) / (R * 0.7 - 12))) : null;
    const down = dy > R * 0.55 && dy > Math.abs(dx) * 1.1;
    if (down && !i.down) { i.downPressed = true; haptic(6); }
    i.down = down;
    if (down) { i.l = i.r = false; }
  }

  // UI "tinta": pantalla limpia. No hay nada dibujado hasta que apoyás un dedo.
  // Izquierda: aparece un círculo de pluma donde apoyás y arrastrás para caminar;
  //   si lo dejás quieto un momento, Capo baila.
  // Derecha: tocás en cualquier lado para saltar (mantener = salto más alto) y queda una mancha de tinta.
  function ink(el, api) {
    const R = 46, DANCE_MS = 550;
    let mover = null, ox = 0, oy = 0, side = 0, ring = null, knob = null, holdT = null, moved = false;
    const jumpers = new Set();

    function makeRing(x, y) {
      const s = svgEl(150);
      s.classList.add('ink-ring');
      path(s, wobble(R, 5, 1.15), 'ink-line');
      path(s, wobble(R - 2, 7, 1.05), 'ink-line thin');
      const k = document.createElementNS(SVGNS, 'g');
      path(k, blob(12), 'ink-fill');
      s.appendChild(k);
      s.style.left = x + 'px'; s.style.top = y + 'px';
      el.appendChild(s);
      requestAnimationFrame(() => s.classList.add('show'));
      return [s, k];
    }
    function dropRing() {
      if (!ring) return;
      const r = ring;
      r.classList.remove('show'); r.classList.add('gone');
      setTimeout(() => r.remove(), 260);
      ring = knob = null;
    }
    function splash(x, y, big) {
      const s = svgEl(200);
      s.classList.add('ink-splash');
      path(s, blob(big ? 34 : 26, true), 'ink-fill soft');
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * 6.3, d = 34 + Math.random() * 30;
        const c = document.createElementNS(SVGNS, 'circle');
        c.setAttribute('cx', (Math.cos(a) * d).toFixed(1)); c.setAttribute('cy', (Math.sin(a) * d).toFixed(1));
        c.setAttribute('r', (1.5 + Math.random() * 3).toFixed(1)); c.setAttribute('class', 'ink-fill soft');
        s.appendChild(c);
      }
      // La animación va en un contenedor: algunos navegadores no pintan un <svg> animado con transform.
      const w = document.createElement('div');
      w.className = 'ink-splash-wrap';
      w.style.left = x + 'px'; w.style.top = y + 'px';
      w.appendChild(s);
      el.appendChild(w);
      const rot = Math.random() * 360, t0 = performance.now(), dur = 520;
      (function frame(now) {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        w.style.opacity = (0.95 * (1 - k)).toFixed(3);
        w.style.transform = `rotate(${rot}deg) scale(${(0.35 + e * 0.85).toFixed(3)})`;
        if (k < 1) requestAnimationFrame(frame); else w.remove();
      })(t0);
    }
    function moveTo(e) {
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > 10) { moved = true; clearTimeout(holdT); }
      if (d > R) { dx *= R / d; dy *= R / d; }
      if (knob) knob.setAttribute('transform', `translate(${dx.toFixed(1)} ${dy.toFixed(1)})`);
      stickInput(api, dx, dy, R);
      const n = dx > 12 ? 1 : dx < -12 ? -1 : 0;
      if (n !== side && n !== 0) haptic(6);
      side = n;
    }
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* nada */ }
      if (e.clientX < innerWidth * 0.5) {
        // Si el navegador se comió el "soltar" del dedo anterior, el stick quedaba trabado:
        // un toque nuevo a la izquierda toma el control y suelta lo que hubiera.
        if (mover !== null) { clearTimeout(holdT); stickInput(api, 0, 0, R); dropRing(); }
        mover = e.pointerId; ox = e.clientX; oy = e.clientY; side = 0; moved = false;
        [ring, knob] = makeRing(ox, oy);
        haptic(6);
        holdT = setTimeout(() => {
          if (moved || mover === null) return;
          if (api.dance()) { haptic(14); ring && ring.classList.add('dance'); }
        }, DANCE_MS);
      } else {
        jumpers.add(e.pointerId);
        api.input.jumpPressed = true; api.input.jump = true;
        haptic(10);
        splash(e.clientX, e.clientY, false);
      }
    });
    el.addEventListener('pointermove', e => { if (e.pointerId === mover) moveTo(e); });
    const end = e => {
      if (e.pointerId === mover) {
        mover = null; side = 0; clearTimeout(holdT);
        stickInput(api, 0, 0, R); dropRing();
      }
      if (jumpers.delete(e.pointerId) && !jumpers.size) api.input.jump = false;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', e => e.preventDefault());
    function release() {
      mover = null; clearTimeout(holdT); jumpers.clear();
      stickInput(api, 0, 0, R); api.input.jump = false; dropRing();
    }
    // Control cruzado con los toques reales: si no queda ningún dedo en la pantalla, se suelta todo,
    // y si no queda ninguno a la izquierda, se suelta el stick (iOS a veces no avisa que se levantó).
    function check(e) {
      const t = e.touches;
      if (!t) return;
      if (!t.length) { if (mover !== null || jumpers.size) release(); return; }
      if (mover !== null && ![...t].some(x => x.clientX < innerWidth * 0.5)) end({ pointerId: mover });
    }
    document.addEventListener('touchend', check, true);
    document.addEventListener('touchcancel', check, true);
    // Si la app se va a segundo plano o pierde el foco, no puede quedar caminando sola.
    addEventListener('blur', release);
    document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
    return { release };
  }

  // Sacudir el celular para saltar. En iPhone hay que pedir permiso desde un toque.
  function shake(getCfg, onShake) {
    let last = 0, enabled = false;
    function handler(e) {
      const cfg = getCfg();
      if (!cfg.shake.enabled) return;
      let mag;
      const a = e.acceleration;
      if (a && a.x != null) mag = Math.hypot(a.x, a.y, a.z);
      else {
        const g = e.accelerationIncludingGravity;
        if (!g || g.x == null) return;
        mag = Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81);
      }
      const now = performance.now();
      if (mag > cfg.shake.threshold && now - last > 380) {
        last = now;
        onShake(mag, cfg.shake.threshold);
      }
    }
    return {
      supported: typeof window.DeviceMotionEvent !== 'undefined',
      get enabled() { return enabled; },
      async enable() {
        if (enabled) return true;
        if (typeof window.DeviceMotionEvent === 'undefined') return false;
        try {
          if (typeof DeviceMotionEvent.requestPermission === 'function') {
            const r = await DeviceMotionEvent.requestPermission();
            if (r !== 'granted') return false;
          }
        } catch (e) { return false; }
        addEventListener('devicemotion', handler);
        enabled = true;
        return true;
      }
    };
  }

  return { keyboard, hold, pad, cross, zones, ink, shake, haptic, ripple };
})();
