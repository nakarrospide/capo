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
      if (k === 'arrowleft' || k === 'a') i.l = true;
      else if (k === 'arrowright' || k === 'd') i.r = true;
      else if (k === ' ' || k === 'arrowup' || k === 'w') { if (!e.repeat) i.jumpPressed = true; i.jump = true; }
      else if (k === 'b' && !e.repeat) api.dance();
      else return;
      e.preventDefault();
    });
    addEventListener('keyup', e => {
      const k = e.key.toLowerCase(), i = api.input;
      if (k === 'arrowleft' || k === 'a') i.l = false;
      if (k === 'arrowright' || k === 'd') i.r = false;
      if (k === ' ' || k === 'arrowup' || k === 'w') i.jump = false;
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

  // Zonas invisibles: mitad izquierda arrastrás para caminar (aparece un stick donde apoyás),
  // mitad derecha tocás para saltar (mantener = salto más largo).
  function zones(el, api, stick, knob) {
    let mover = null, jumper = null, ox = 0, oy = 0, side = 0;
    const R = 46;
    function moveTo(e) {
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const n = dx > 12 ? 1 : dx < -12 ? -1 : 0;
      if (n !== side && n !== 0) haptic(6);
      side = n;
      api.input.r = n > 0; api.input.l = n < 0;
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
      } else if (!left && jumper === null) {
        jumper = e.pointerId;
        api.input.jumpPressed = true; api.input.jump = true;
        haptic(12); ripple(el, e.clientX, e.clientY);
      }
    });
    el.addEventListener('pointermove', e => { if (e.pointerId === mover) moveTo(e); });
    const end = e => {
      if (e.pointerId === mover) { mover = null; side = 0; api.input.l = api.input.r = false; stick.classList.remove('show'); }
      if (e.pointerId === jumper) { jumper = null; api.input.jump = false; }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', e => e.preventDefault());
    return {
      release() { mover = jumper = null; api.input.l = api.input.r = api.input.jump = false; stick.classList.remove('show'); }
    };
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

  return { keyboard, hold, pad, cross, zones, shake, haptic, ripple };
})();
