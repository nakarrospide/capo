// Mesa de trabajo: ajustar a Capo, probar en vivo y pushear al juego.
(async function () {
  const $ = id => document.getElementById(id);
  let cfg = await CapoConfig.load();
  const originEl = $('origin');
  const paintOrigin = () => { originEl.textContent = CapoConfig.hasLocal() ? 'ajustes pusheados' : 'config.json'; };
  paintOrigin();

  const api = CapoEngine.create({
    parent: $('view'),
    cfg,
    background: '#e9e4d8',
    on(evt, val) {
      if (evt === 'state') $('state').textContent = 'capo · ' + val;
      else if (evt === 'dance') $('bD').classList.toggle('on', val), ($('bD').textContent = val ? 'Parar' : 'Bailar');
    }
  });
  CapoControls.keyboard(api);
  CapoControls.pad(api, { left: 'bL', right: 'bR', jump: 'bJ', dance: 'bD' });
  addEventListener('resize', () => api.resize());

  let dirty = false;
  function changed() {
    dirty = true;
    api.setConfig(cfg);
    $('pushBtn').textContent = 'Pushear al juego •';
  }

  /* obras */
  const levelsEl = $('levels');
  for (const id in CapoEngine.LEVELS) {
    const b = document.createElement('button');
    b.textContent = CapoEngine.LEVELS[id].name;
    b.dataset.id = id;
    b.addEventListener('click', () => { cfg = { ...cfg, level: id }; paintLevels(); changed(); });
    levelsEl.appendChild(b);
  }
  function paintLevels() { for (const b of levelsEl.children) b.setAttribute('aria-pressed', b.dataset.id === cfg.level); }

  /* deslizadores: [grupo, clave, etiqueta, min, max, paso, formato] */
  const SLIDERS = {
    feel: [
      ['feel', 'grav', 'Gravedad', 600, 2600, 20, v => v],
      ['feel', 'jump', 'Impulso', 300, 900, 10, v => v],
      ['feel', 'speed', 'Velocidad', 100, 420, 5, v => v],
      ['feel', 'coyote', 'Margen al borde', 0, 250, 5, v => v + ' ms'],
      ['feel', 'bounce', 'Rebote azul', 1, 2.2, 0.05, v => '×' + (+v).toFixed(2)]
    ],
    cam: [
      ['camera', 'zoom', 'Zoom de juego', 1, 3.5, 0.1, v => '×' + (+v).toFixed(1)],
      ['dance', 'beat', 'Pulso del baile', 0.25, 1.2, 0.01, v => (+v).toFixed(2) + ' s'],
      ['capo', 'height', 'Altura de Capo', 40, 120, 1, v => v + ' px']
    ],
    shake: [
      ['shake', 'threshold', 'Umbral', 6, 30, 0.5, v => (+v).toFixed(1) + ' m/s²']
    ]
  };
  const inputs = [];
  for (const host in SLIDERS) for (const [grp, key, label, min, max, step, fmt] of SLIDERS[host]) {
    const id = 's-' + grp + '-' + key;
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<label for="${id}">${label}</label><output></output><input type="range" id="${id}" min="${min}" max="${max}" step="${step}">`;
    const input = row.querySelector('input'), out = row.querySelector('output');
    const sync = () => { input.value = cfg[grp][key]; out.textContent = fmt(cfg[grp][key]); };
    input.addEventListener('input', () => {
      cfg = { ...cfg, [grp]: { ...cfg[grp], [key]: +input.value } };
      out.textContent = fmt(+input.value);
      changed();
    });
    inputs.push(sync);
    $(host).appendChild(row);
  }

  const shakeOn = $('shakeOn');
  shakeOn.addEventListener('change', () => { cfg = { ...cfg, shake: { ...cfg.shake, enabled: shakeOn.checked } }; changed(); });

  function paintAll() { paintLevels(); inputs.forEach(f => f()); shakeOn.checked = !!cfg.shake.enabled; }
  paintAll();

  /* push, copiar, volver */
  $('pushBtn').addEventListener('click', () => {
    const ok = CapoConfig.push(cfg);
    const t = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    $('pushNote').textContent = ok
      ? `Pusheado a las ${t}. Abrí el juego en este dispositivo y ya los tiene.`
      : 'No se pudo guardar. Revisá que el navegador no esté en modo privado.';
    $('pushBtn').textContent = 'Pushear al juego';
    dirty = false;
    paintOrigin();
  });

  $('copyBtn').addEventListener('click', async () => {
    const { pushedAt, ...clean } = cfg;
    const text = JSON.stringify(clean, null, 2);
    const area = $('copyArea');
    try {
      await navigator.clipboard.writeText(text);
      $('copyBtn').textContent = 'Copiado';
      setTimeout(() => ($('copyBtn').textContent = 'Copiar config'), 1600);
    } catch (e) {
      area.hidden = false; area.value = text; area.select();
    }
  });

  $('resetBtn').addEventListener('click', async () => {
    CapoConfig.clear();
    cfg = await CapoConfig.base();
    api.setConfig(cfg);
    paintAll(); paintOrigin();
    $('pushNote').textContent = 'Volviste a config.json. El juego también lo usa ahora en este dispositivo.';
  });

  /* hoja de secuencia de prueba */
  let lastSheet = null;
  function applySheet() {
    if (!lastSheet) return;
    const fw = +$('fw').value, fh = +$('fh').value, fps = +$('fps').value || 10;
    if (!(fw > 0 && fh > 0)) { $('sheetStatus').textContent = 'Revisá el tamaño de cuadro'; return; }
    const n = api.setSheet(lastSheet, fw, fh, fps);
    $('sheetStatus').textContent = `Hoja cargada: ${n} cuadros de ${fw}×${fh}`;
    $('sheetOff').hidden = false;
  }
  $('sheetFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => { lastSheet = img; if (img.height < +$('fh').value) $('fh').value = img.height; applySheet(); };
      img.src = r.result;
    };
    r.readAsDataURL(f);
  });
  for (const id of ['fw', 'fh', 'fps']) $(id).addEventListener('change', applySheet);
  $('sheetOff').addEventListener('click', () => {
    api.clearSheet(); lastSheet = null; $('sheetFile').value = '';
    $('sheetOff').hidden = true; $('sheetStatus').textContent = 'Usando la hoja de poses de Capo';
  });

  $('showCol').addEventListener('change', e => api.showSurfaces(e.target.checked));

  addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
})();
