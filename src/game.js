// Juego para celular: pantalla completa, botones tipo consola y salto al sacudir.
(async function () {
  let cfg = await CapoConfig.load();
  const $ = id => document.getElementById(id);
  const stateEl = $('state'), startEl = $('start'), shakeBtn = $('shakeBtn');

  const vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) { /* nada */ } };

  const api = CapoEngine.create({
    parent: $('view'),
    cfg,
    background: '#0f1013',
    bottomInset: () => document.querySelector('.controls').getBoundingClientRect().height - 10,
    on(evt, val) {
      if (evt === 'state') stateEl.textContent = val;
      else if (evt === 'bounce') vibrate([12, 30, 12]);
      else if (evt === 'land' && val > 520) vibrate(10);
      else if (evt === 'dance') $('bD').classList.toggle('on', val);
    }
  });

  CapoControls.keyboard(api);
  CapoControls.pad(api, { left: 'bL', right: 'bR', jump: 'bJ', dance: 'bD' });
  // Arriba en la cruceta también salta.
  CapoControls.hold($('bU'), () => { api.input.jumpPressed = true; api.input.jump = true; }, () => (api.input.jump = false));

  // Más fuerte la sacudida, más alto el salto.
  const shake = CapoControls.shake(() => cfg, (mag, th) => {
    api.jump(Math.max(120, Math.min(420, 120 + (mag - th) * 28)));
    vibrate(8);
  });

  function paintShake() {
    shakeBtn.hidden = !shake.supported || !cfg.shake.enabled;
    shakeBtn.textContent = 'sacudir: ' + (shake.enabled ? 'on' : 'off');
    shakeBtn.classList.toggle('on', shake.enabled);
  }
  if (!shake.supported || !cfg.shake.enabled) $('startHint').hidden = true;
  paintShake();

  async function begin() {
    startEl.hidden = true;
    if (cfg.shake.enabled && shake.supported) { await shake.enable(); paintShake(); }
  }
  startEl.addEventListener('pointerdown', e => { e.preventDefault(); begin(); }, { once: true });
  shakeBtn.addEventListener('click', async () => { await shake.enable(); paintShake(); });

  // La mesa de trabajo pushea ajustes nuevos: si el juego está abierto en otra pestaña, los toma al toque.
  addEventListener('storage', async e => {
    if (e.key !== CapoConfig.KEY) return;
    cfg = await CapoConfig.load();
    api.setConfig(cfg);
    paintShake();
    stateEl.textContent = 'ajustes nuevos';
  });

  addEventListener('resize', () => api.resize());
  if (window.visualViewport) visualViewport.addEventListener('resize', () => api.resize());
})();
