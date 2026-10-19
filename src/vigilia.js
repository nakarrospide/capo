// Vigilia: primer nivel armado por piezas (no sale de una foto).
// Fondo en dos capas con parallax y plataformas armadas con las piezas pintadas
// (tools/prep_plataformas.py las recorta de la hoja; el dibujo de cada pieza está en src/piezas.js).
// Termina en la puerta de luz, que lleva a Párpado.
// Las medidas van en celdas de 36 px: Capo ocupa unas 2 de alto.
(function () {
  const G = 36;

  // Primer parpadeo: 5 tramos (ver doc "Capo: Vigilia, assets y prompts").
  // t: plt (cresta), pilar (cobertura), fragil, rebote (azul, gira 360).
  // y es la fila del borde de arriba, que es lo que se pisa.
  const platforms = [
    // 1. Calma
    { t: 'plt', x: 0, y: 16, w: 9, h: 4 },
    { t: 'plt', x: 11, y: 15, w: 4, h: 3 },
    { t: 'plt', x: 17, y: 14, w: 3, h: 2 },
    // 2. El primer ojo
    { t: 'plt', x: 21, y: 16, w: 19, h: 4 },
    // 3. Coberturas
    { t: 'plt', x: 42, y: 16, w: 23, h: 4 },
    { t: 'pilar', x: 46, y: 12, w: 1, h: 4 },
    { t: 'pilar', x: 52, y: 12, w: 1, h: 4 },
    { t: 'pilar', x: 58, y: 12, w: 1, h: 4 },
    // 4. Vertical
    { t: 'plt', x: 67, y: 16, w: 5, h: 4 },
    { t: 'rebote', x: 72, y: 16, w: 3, h: 1 },
    { t: 'plt', x: 77, y: 10, w: 6, h: 2 },
    { t: 'fragil', x: 84, y: 13, w: 3, h: 1 },
    // 5. La estrella
    { t: 'plt', x: 88, y: 16, w: 32, h: 4 },
    { t: 'plt', x: 96, y: 12, w: 3, h: 2 },
    { t: 'plt', x: 104, y: 11, w: 3, h: 2 }
  ];

  const piezas = CapoPiezas.make(G);
  const images = CapoPiezas.images();

  // Ojos láser. x, y: celda donde nace el tallo (down: cuelga desde arriba).
  // angle en grados (0 derecha, 90 abajo, 180 izquierda). offset retrasa el primer disparo.
  const eyes = [
    // 2. El primer ojo: fijo, a la altura del pecho, se salta o se pasa en el descanso
    { x: 38.5, y: 16, type: 'fijo', angle: 180 },
    // 3. Coberturas: rastreador al fondo, los pilares cortan el haz
    { x: 63.5, y: 16, type: 'rastreador' },
    // 4. Vertical: cuelga y dispara hacia abajo entre el pad y la cornisa
    { x: 76, y: 3, down: true, type: 'fijo', angle: 90 },
    // 5. La estrella: cuatro ojos que apuntan al mismo punto, en secuencia
    ...[[108, 7], [111, 6], [114, 6], [117, 7]].map(([x, y], i) => ({
      x, y, type: 'fijo', offset: i * 0.55,
      angle: Math.atan2((13 - (y - 0.85)) * G, (112.5 - x) * G) * 180 / Math.PI
    }))
  ];

  // Puntos de control al empezar cada tramo.
  const checkpoints = [{ x: 21, y: 16 }, { x: 42, y: 16 }, { x: 67, y: 16 }, { x: 88, y: 16 }];

  // Gotas ocre: marcan los arcos de salto y premian mirar arriba. Centro de la gota, en celdas.
  const drops = [
    [10, 14], [16, 13], [20.5, 12.6], [33, 12.8], [49, 15.2],
    [55, 15.2], [73.5, 10.5], [85.5, 11.8], [97.5, 10.8], [105.5, 9.8]
  ];

  CapoEngine.LEVELS.vigilia = {
    name: 'Vigilia',
    built: true,
    grid: G,
    w: 120 * G,
    h: 20 * G,
    start: { x: 3 * G, y: 16 * G },
    layers: [
      { key: 'lejano', src: 'assets/vigilia/lejano.jpg', height: 20 * G, bottom: 20 * G, parallax: 0.12 },
      { key: 'medio', src: 'assets/vigilia/medio.png', height: 300, bottom: 16 * G + 24, parallax: 0.4, alpha: 0.7 }
    ],
    platforms,
    images,
    sheets: { ojo: { src: 'assets/vigilia/ojo.png', fw: 240, fh: 300, cy: 148 } },
    eyes,
    checkpoints,
    drops,
    door: { x: 117.5, y: 16 },
    next: 'parpado',
    paint: piezas.paint(platforms),
    paintPiece: piezas.paintPiece
  };
})();
