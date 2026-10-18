// Juego para celular: pantalla completa, botones tipo consola y salto al sacudir.
(async function () {
  // El juego siempre arranca en Vigilia, aunque la mesa haya pusheado otra obra.
  const START_LEVEL = 'vigilia';
  const loadCfg = async () => ({ ...(await CapoConfig.load()), level: START_LEVEL });
  let cfg = await loadCfg();
  const $ = id => document.getElementById(id);
  const stateEl = $('state'), startEl = $('start'), shakeBtn = $('shakeBtn');

  const vibrate = ms => CapoControls.haptic(ms);
  const gameEl = $('game');

  // Dos UIs para comparar: "botones" (vidrio sobre la obra) y "zonas" (sin botones fijos).
  // Se elige con ?ui=zonas o con el botón de arriba, y queda guardada en el celu.
  const UI_KEY = 'capo-ui';
  const HINTS = {
    botones: 'Cruceta para caminar\narriba o A salta · B baila',
    zonas: 'Izquierda: arrastrá para caminar\nDerecha: tocá para saltar'
  };
  let ui = new URLSearchParams(location.search).get('ui');
  if (!HINTS[ui]) { try { ui = localStorage.getItem(UI_KEY); } catch (_) { ui = null; } }
  if (!HINTS[ui]) ui = 'botones';

  const api = CapoEngine.create({
    parent: $('view'),
    cfg,
    background: '#0f1013',
    bottomInset: () => (ui === 'botones' ? $('pad').getBoundingClientRect().height : 0),
    on(evt, val) {
      if (evt === 'state') stateEl.textContent = val;
      else if (evt === 'bounce') vibrate([12, 30, 12]);
      else if (evt === 'land' && val > 520) vibrate(10);
      else if (evt === 'dance') { $('bD').classList.toggle('on', val); $('zD').classList.toggle('on', val); }
    }
  });

  CapoControls.keyboard(api);
  CapoControls.pad(api, { jump: 'bJ', dance: 'bD' });
  const crossPad = CapoControls.cross($('cross'), api, $('crossGlass'));
  const zonePad = CapoControls.zones($('zones'), api, $('stick'), $('knob'));
  $('zD').addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    CapoControls.haptic(14); CapoControls.ripple($('zD'), e.clientX, e.clientY); api.dance();
  });

  function setUI(next) {
    ui = next;
    crossPad.release(); zonePad.release();
    gameEl.dataset.ui = ui;
    $('uiHint').textContent = HINTS[ui];
    try { localStorage.setItem(UI_KEY, ui); } catch (_) { /* nada */ }
    api.resize();
  }
  setUI(ui);
  $('uiSwap').addEventListener('click', () => { CapoControls.haptic(10); setUI(ui === 'botones' ? 'zonas' : 'botones'); });

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
    cfg = await loadCfg();
    api.setConfig(cfg);
    paintShake();
    stateEl.textContent = 'ajustes nuevos';
  });

  addEventListener('resize', () => api.resize());
  if (window.visualViewport) visualViewport.addEventListener('resize', () => api.resize());
})();
