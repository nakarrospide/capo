// Ajustes de Capo.
// config.json es la base que vive en el repo.
// La mesa de trabajo "pushea" ajustes a localStorage y el juego los toma en ese mismo dispositivo.
window.CapoConfig = (function () {
  const KEY = 'capo-config';

  const FALLBACK = {
    version: 1,
    level: 'color',
    feel: { grav: 1500, jump: 620, speed: 230, coyote: 110, bounce: 1.45 },
    camera: { zoom: 2.4 },
    shake: { enabled: true, threshold: 14 },
    dance: { beat: 0.52 },
    capo: {
      height: 70, idle: 'A4', walk: ['D1', 'D2', 'D3'],
      takeoff: 'D4', rise: 'D5', spin: 'D6', fall: 'A8',
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
  async function load() {
    const b = await base();
    const l = local();
    return l ? deep(b, l) : b;
  }
  function push(cfg) {
    try { localStorage.setItem(KEY, JSON.stringify({ ...cfg, pushedAt: new Date().toISOString() })); return true; }
    catch (e) { return false; }
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* nada */ } }

  return { KEY, FALLBACK, deep, clone, base, load, push, clear, hasLocal: () => !!local() };
})();
