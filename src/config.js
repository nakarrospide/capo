// Ajustes de Capo.
// config.json es la base que vive en el repo.
// La mesa de trabajo "pushea" ajustes a localStorage y el juego los toma en ese mismo dispositivo.
// En el celu la mesa está apagada: el juego usa solo config.json, que es lo que le llega a todos.
window.CapoConfig = (function () {
  const KEY = 'capo-config';

  const FALLBACK = {
    version: 2,
    level: 'vigilia',
    feel: { grav: 1120, jump: 690, speed: 260, coyote: 95, bounce: 1.6 },
    camera: { zoom: 2.2 },
    shake: { enabled: true, threshold: 14 },
    dance: { beat: 0.57 },
    capo: {
      height: 74, idle: 'A4', walk: ['D2', 'D3'], walkFps: 9,
      takeoff: 'D4', rise: 'D5', spin: 'D6', fall: 'A8', land: 'D4',
      // Las poses de la fila D están dibujadas más grandes: se achican para que la cabeza mida igual.
      scale: { D2: 0.78, D3: 0.76, D4: 0.78, D5: 0.78, D6: 0.85, A8: 0.85 },
      // Punto de apoyo horizontal (0 a 1). En la carrera va bajo la cabeza para que no salte entre cuadros.
      anchor: { D2: 0.7, D3: 0.62, D5: 0.6 },
      yogaAfter: 3.5,
      yoga: ['C7', 'C3', 'C4', 'C1', 'C2', 'C5', 'C6', 'B7', 'B6', 'C0', 'B4'],
      dance: ['A0', 'A1', 'A2', 'A3', 'A5', 'A6', 'A7', 'A8', 'B0', 'B1', 'B2', 'B3', 'B5']
    }
  };

  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function deep(a, b) {
    const out = isObj(a) ? { ...a } : {};
    if (!isObj(b)) return out;
    for (const k of Object.keys(b)) out[k] = isObj(b[k]) && isObj(a[k]) ? deep(a[k], b[k]) : b[k];
    return out;
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  async function base() {
    try {
      const r = await fetch('config.json', { cache: 'no-store' });
      if (r.ok) return deep(FALLBACK, await r.json());
    } catch (e) { /* sin red o abierto como archivo: usamos los valores de respaldo */ }
    return clone(FALLBACK);
  }
  function local() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  // Pantalla táctil sin mouse ni trackpad: celu (o tablet sin teclado).
  function tactil() {
    try { return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches; }
    catch (e) { return false; }
  }
  async function load() {
    const b = await base();
    const l = tactil() ? null : local();
    // Si lo pusheado es de una versión anterior, las poses vienen de la base (cambió el mapa de cuadros).
    if (l && l.version !== b.version) delete l.capo;
    return l ? deep(b, { ...l, version: b.version }) : b;
  }
  function push(cfg) {
    try { localStorage.setItem(KEY, JSON.stringify({ ...cfg, pushedAt: new Date().toISOString() })); return true; }
    catch (e) { return false; }
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* nada */ } }

  return { KEY, FALLBACK, deep, clone, base, load, push, clear, tactil, hasLocal: () => !!local() };
})();
