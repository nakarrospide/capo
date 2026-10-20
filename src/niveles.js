// Niveles armados por piezas: viven en levels/*.json y se arman con las piezas pintadas de src/piezas.js.
// levels/index.json dice el orden. El editor (editor.html) lee y escribe estos mismos archivos.
// Medidas en celdas de 36 px. y es la fila del borde de arriba, que es lo que se pisa.
window.CapoNiveles = (function () {
  const G = 36;
  const PRUEBA = 'capo-nivel-prueba';
  let orden = [];

  // Fondos: mismas dos capas de Vigilia, de día o teñidas de noche. Se acomodan a la altura del nivel.
  const FONDOS = {
    dia: { tint: null, tintMedio: null, alpha: 0.7 },
    noche: { tint: 0xb9a3c4, tintMedio: 0xd2b4d0, alpha: 0.75 }
  };
  function layers(fondo, h) {
    const f = FONDOS[fondo] || FONDOS.dia;
    const lejano = { key: 'lejano', src: 'assets/vigilia/lejano.jpg', height: h * G, bottom: h * G, parallax: 0.12 };
    const medio = { key: 'medio', src: 'assets/vigilia/medio.png', height: 300, bottom: (h - 4) * G + 24, parallax: 0.4, alpha: f.alpha };
    if (f.tint != null) lejano.tint = f.tint;
    if (f.tintMedio != null) medio.tint = f.tintMedio;
    return [lejano, medio];
  }

  // De los datos del archivo al nivel que entiende el motor.
  function build(d) {
    const piezas = CapoPiezas.make(G);
    const platforms = d.platforms || [];
    return {
      name: d.name || d.id,
      built: true,
      grid: G,
      w: d.w * G,
      h: d.h * G,
      start: { x: d.start.x * G, y: d.start.y * G },
      layers: layers(d.fondo, d.h),
      platforms,
      images: CapoPiezas.images(),
      sheets: { ojo: { src: 'assets/vigilia/ojo.png', fw: 240, fh: 300, cy: 148 } },
      eyes: d.eyes || [],
      checkpoints: d.checkpoints || [],
      drops: d.drops || [],
      door: d.door || null,
      next: d.next,
      paint: piezas.paint(platforms),
      paintPiece: piezas.paintPiece
    };
  }

  function register(d) {
    CapoEngine.LEVELS[d.id] = build(d);
    return d.id;
  }

  async function getJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return r.json();
  }

  // Carga todos los niveles de la lista. Si falta "next", sigue el orden y el último vuelve al primero.
  async function load() {
    try { orden = (await getJSON('levels/index.json')).orden || []; } catch (e) { orden = []; }
    const datos = await Promise.all(orden.map(id => getJSON('levels/' + id + '.json').catch(() => null)));
    orden = orden.filter((id, i) => datos[i]);
    datos.filter(Boolean).forEach((d, i, all) => {
      if (!d.next) d.next = all[(i + 1) % all.length].id;
      register(d);
    });
    // Probar desde el editor: index.html?prueba=1 juega el borrador guardado en este navegador.
    if (new URLSearchParams(location.search).get('prueba')) {
      try {
        const d = JSON.parse(localStorage.getItem(PRUEBA) || 'null');
        if (d) { d.next = d.id; register(d); return d.id; }
      } catch (e) { /* borrador roto: se juega lo normal */ }
    }
    return null;
  }

  return { G, PRUEBA, FONDOS, load, build, register, layers, orden: () => orden.slice(), first: () => orden[0] || 'color' };
})();
