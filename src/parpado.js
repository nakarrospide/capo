// Párpado: segundo nivel. Mismo mundo que Vigilia, ya de noche, con piezas que se mueven.
// Enseña de a una cosa por tramo: plataforma que viaja, bajar atravesando, párpados que se cierran,
// ascensor con ojo barredor, espinas y rebote, y un final con cobertura.
// Medidas en celdas de 36 px. y es la fila del borde de arriba (lo que se pisa); el piso está en la fila 20.
(function () {
  const G = 36;

  // t: plt (cresta; si mide 2 de alto o menos es fina y se puede bajar de ella tirando el stick para abajo),
  // pilar, rebote, espinas (rojo: matan), movil (va de x,y a "to" y vuelve en "period" segundos),
  // parpado (abierto "on" segundos, cerrado "off"; offset corre el ciclo, en fracción del ciclo).
  // En una fila de párpados el offset va bajando: cada uno se abre un poco después que el anterior,
  // así siempre hay un momento en que los dos vecinos están abiertos (una ola de izquierda a derecha).
  const platforms = [
    // 1. El viaje: una isla que lleva de un lado al otro y un puente fino con premio abajo
    { t: 'plt', x: 0, y: 20, w: 10, h: 4 },
    { t: 'movil', x: 11, y: 19, w: 3, to: [18, 19], period: 4.6 },
    { t: 'plt', x: 22, y: 20, w: 6, h: 4 },
    { t: 'plt', x: 27, y: 16, w: 14, h: 1 },
    { t: 'plt', x: 32, y: 20, w: 4, h: 4 },
    { t: 'plt', x: 41, y: 20, w: 8, h: 4 },

    // 2. Párpados: se abren y se cierran a ritmo; en el medio, un descanso bajo un ojo que mira para abajo
    { t: 'parpado', x: 51, y: 19, w: 3, on: 2.0, off: 1.4, offset: 0 },
    { t: 'parpado', x: 56, y: 18, w: 3, on: 2.0, off: 1.4, offset: -0.3 },
    { t: 'parpado', x: 61, y: 19, w: 3, on: 2.0, off: 1.4, offset: -0.6 },
    { t: 'plt', x: 65, y: 20, w: 4, h: 4 },
    { t: 'parpado', x: 70, y: 18, w: 3, on: 1.8, off: 1.5, offset: 0.1 },
    { t: 'parpado', x: 75, y: 19, w: 3, on: 1.8, off: 1.5, offset: -0.2 },
    { t: 'plt', x: 79, y: 20, w: 10, h: 4 },

    // 3. El ascensor: sube a una cornisa con un ojo barredor; el pilar cubre. Abajo, espinas.
    { t: 'movil', x: 90, y: 20, w: 3, to: [90, 10], period: 5.2 },
    { t: 'plt', x: 94, y: 10, w: 10, h: 2 },
    { t: 'pilar', x: 99, y: 7, w: 1, h: 3 },
    { t: 'plt', x: 106, y: 14, w: 3, h: 2 },
    { t: 'plt', x: 94, y: 20, w: 19, h: 4 },
    { t: 'espinas', x: 94, y: 20, w: 12 },

    // 4. Espinas y rebote: el pad azul tira por encima de las espinas (más alto si mantenés el salto)
    { t: 'rebote', x: 109, y: 20, w: 3, h: 1 },
    { t: 'plt', x: 113, y: 20, w: 16, h: 4 },
    { t: 'espinas', x: 113, y: 20, w: 16 },
    { t: 'plt', x: 116, y: 15, w: 3, h: 1 },
    { t: 'movil', x: 120, y: 17, w: 3, to: [125, 17], period: 3.4 },

    // 5. Final: pilares para cubrirse de un rastreador que cuelga, y la puerta
    { t: 'plt', x: 129, y: 20, w: 21, h: 4 },
    { t: 'pilar', x: 136, y: 16, w: 1, h: 4 },
    { t: 'pilar', x: 141, y: 16, w: 1, h: 4 }
  ];

  const eyes = [
    // Sobre el descanso de los párpados: dispara derecho para abajo, se espera a un costado
    { x: 67, y: 12, down: true, type: 'fijo', angle: 90 },
    // En la cornisa: barre de abajo hacia arriba, el pilar corta el haz
    { x: 103.5, y: 10, type: 'barredor', angle: 180, arc: 60 },
    // Antes de la puerta: cuelga y apunta a Capo
    { x: 144, y: 8, down: true, type: 'rastreador' }
  ];

  const checkpoints = [{ x: 41, y: 20 }, { x: 79, y: 20 }, { x: 106, y: 20 }, { x: 129, y: 20 }];

  // Centro de cada gota, en celdas.
  const drops = [
    // 1
    [6, 19.2], [12.5, 17.6], [16, 17.6], [19.5, 17.6], [33, 19.2], [35, 19.2], [38, 15],
    // 2
    [57.5, 16.8], [67, 19.2], [71.5, 16.8],
    // 3
    [91.5, 15], [91.5, 12], [97, 9.2],
    // 4
    [114, 13.6], [117.5, 14.2], [124.5, 16.2],
    // 5
    [139, 19.2], [144.5, 19.2]
  ];

  const piezas = CapoPiezas.make(G);

  CapoEngine.LEVELS.parpado = {
    name: 'Párpado',
    built: true,
    grid: G,
    w: 150 * G,
    h: 24 * G,
    start: { x: 3 * G, y: 20 * G },
    // Mismo fondo que Vigilia, teñido de noche para que se sienta otro momento.
    layers: [
      { key: 'lejano', src: 'assets/vigilia/lejano.jpg', height: 24 * G, bottom: 24 * G, parallax: 0.12, tint: 0xb9a3c4 },
      { key: 'medio', src: 'assets/vigilia/medio.png', height: 300, bottom: 20 * G + 24, parallax: 0.4, alpha: 0.75, tint: 0xd2b4d0 }
    ],
    platforms,
    images: CapoPiezas.images(),
    sheets: { ojo: { src: 'assets/vigilia/ojo.png', fw: 240, fh: 300, cy: 148 } },
    eyes,
    checkpoints,
    drops,
    door: { x: 147.5, y: 20 },
    next: 'vigilia',
    paint: piezas.paint(platforms),
    paintPiece: piezas.paintPiece
  };
})();
