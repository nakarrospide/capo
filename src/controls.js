// Controles compartidos: teclado, botones táctiles y sacudir el celular.
window.CapoControls = (function () {
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
      el.classList.add('on'); down();
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
    if (d) d.addEventListener('pointerdown', e => { e.preventDefault(); api.dance(); });
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

  return { keyboard, hold, pad, shake };
})();
