// Juego para celular: pantalla completa, botones tipo consola y salto al sacudir.
(async function () {
  // Los niveles salen de levels/*.json. Con ?prueba=1 se juega el borrador que mandó el editor.
  const prueba = await CapoNiveles.load();
  // El juego siempre arranca en el primer nivel de la lista, aunque la mesa haya pusheado otra obra.
  const START_LEVEL = prueba || CapoNiveles.first();
  const loadCfg = async () => ({ ...(await CapoConfig.load()), level: START_LEVEL });
  let cfg = await loadCfg();
  const $ = id => document.getElementById(id);
  const stateEl = $('state'), startEl = $('start'), shakeBtn = $('shakeBtn');

  const vibrate = ms => CapoControls.haptic(ms);
  const gameEl = $('game');

  // UI principal: "tinta" (pantalla limpia, trazos solo donde tocás).
  // Las anteriores siguen para comparar: ?ui=zonas y ?ui=botones.
  const HINTS = {
    tinta: 'izquierda: apoyá y arrastrá para caminar\nderecha: tocá para saltar\ndejá el dedo quieto a la izquierda y Capo baila',
    botones: 'Cruceta para caminar\narriba o A salta · B baila',
    zonas: 'Izquierda: arrastrá para caminar\nDerecha: saltar y bailar'
  };
  let ui = new URLSearchParams(location.search).get('ui');
  if (!HINTS[ui]) ui = 'tinta';

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
      else if (evt === 'drop') { vibrate(8); showHud(val.got, val.total); }
      else if (evt === 'die') { vibrate(val === 'cayo' ? 20 : [30, 40, 30]); releaseAll(); }
      else if (evt === 'checkpoint') vibrate(12);
      else if (evt === 'skid') vibrate(4);
      else if (evt === 'level') { hudTotal = val.total; showHud(0, val.total, true); if (started) showCard(val.name, '', 1800); }
      else if (evt === 'goal') {
        vibrate([20, 60, 20, 60, 40]);
        const fin = prueba ? '\nprueba del editor' : (val.next === CapoNiveles.first() ? '\nfin, por ahora' : '');
        showCard(val.name, `${val.got} de ${val.total} gotas${fin}`, 3300);
      }
    }
  });

  // Gotas arriba a la izquierda y carteles al entrar a un nivel y al llegar a la puerta.
  let hudTotal = 0, hudT = null, cardT = null, started = false;
  function showHud(got, total, quiet) {
    $('hudN').textContent = `${got}/${total}`;
    const h = $('hud');
    if (quiet || !total) { h.classList.remove('show'); return; }
    h.classList.add('show'); h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop');
    clearTimeout(hudT); hudT = setTimeout(() => h.classList.remove('show'), 2200);
  }
  function showCard(name, sub, ms) {
    $('cardName').textContent = name; $('cardSub').textContent = sub;
    $('card').classList.add('show');
    clearTimeout(cardT); cardT = setTimeout(() => $('card').classList.remove('show'), ms);
  }

  window.capo = api; // a mano desde la consola: capo.setLevel('parpado'), capo.showSurfaces(true)
  CapoControls.keyboard(api);
  CapoControls.pad(api, { jump: 'bJ', dance: 'bD' });
  const crossPad = CapoControls.cross($('cross'), api, $('crossGlass'));
  const zonePad = CapoControls.zones($('zones'), api, $('stick'), $('knob'));
  const inkPad = CapoControls.ink($('inkzone'), api);
  // Al morir se sueltan los controles: si alguno quedó trabado, vuelve a andar.
  function releaseAll() { crossPad.release(); zonePad.release(); inkPad.release(); }
  CapoControls.pad(api, { jump: 'zJ', dance: 'zD' });

  function setUI(next) {
    ui = next;
    crossPad.release(); zonePad.release(); inkPad.release();
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
    started = true;
    const L = CapoEngine.LEVELS[api.level()];
    if (L) showCard(L.name, '', 1800);
    if (cfg.shake.enabled && shake.supported) { await shake.enable(); paintShake(); }
  }
  startEl.addEventListener('pointerdown', e => { e.preventDefault(); begin(); }, { once: true });
  shakeBtn.addEventListener('click', async () => { await shake.enable(); paintShake(); });

  // La mesa de trabajo pushea ajustes nuevos: si el juego está abierto en otra pestaña, los toma al toque.
  addEventListener('storage', async e => {
    if (e.key !== CapoConfig.KEY || CapoConfig.tactil()) return;
    cfg = await loadCfg();
    api.setConfig(cfg);
    paintShake();
    stateEl.textContent = 'ajustes nuevos';
  });

  addEventListener('resize', () => api.resize());
  if (window.visualViewport) visualViewport.addEventListener('resize', () => api.resize());
})();
