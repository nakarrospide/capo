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

  // UI principal: "zonas" (stick donde apoyás + saltar y bailar). La cruceta vieja sigue en ?ui=botones.
  const HINTS = {
    botones: 'Cruceta para caminar\narriba o A salta · B baila',
    zonas: 'Izquierda: arrastrá para caminar\nDerecha: saltar y bailar'
  };
  let ui = new URLSearchParams(location.search).get('ui');
  if (!HINTS[ui]) ui = 'zonas';

  const api = CapoEngine.create({
    parent: $('view'),
    cfg,
    background: '#0f1013',
    bottomInset: () => (ui === 'botones' ? $('pad').getBoundingClientRect().height : 0),
    on(evt, val) {
      if (evt === 'state') stateEl.textContent = val;
      else if (evt === 'bounce') vibrate([12, 30, 12]);
      else if (evt === 'crack') vibrate(6);
      else if (evt === 'land' && val > 520) vibrate(10);
      else if (evt === 'dance') { $('bD').classList.toggle('on', val); $('zD').classList.toggle('on', val); }
    }
  });

  CapoControls.keyboard(api);
  CapoControls.pad(api, { jump: 'bJ', dance: 'bD' });
  const crossPad = CapoControls.cross($('cross'), api, $('crossGlass'));
  const zonePad = CapoControls.zones($('zones'), api, $('stick'), $('knob'));
  CapoControls.pad(api, { jump: 'zJ', dance: 'zD' });

  function setUI(next) {
    ui = next;
    crossPad.release(); zonePad.release();
    gameEl.dataset.ui = ui;
    $('uiHint').textContent = HINTS[ui];
    api.resize();
  }
  setUI(ui);

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
