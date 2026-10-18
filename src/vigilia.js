// Vigilia: primer nivel armado por piezas (no sale de una foto).
// Fondo en dos capas con parallax y plataformas armadas con las piezas pintadas
// (tools/prep_plataformas.py las recorta de la hoja). Frágil y rebote siguen dibujadas en código.
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

  function rng(seed) {
    let a = seed * 2654435761 >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Línea blanca nerviosa del borde pisable.
  function edge(ctx, r, X, Y, Wp) {
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    let pen = false;
    for (let px = X + 2; px <= X + Wp - 2; px += 4) {
      if (r() < 0.04) { pen = false; continue; }
      const yy = Y + (r() - 0.5) * 1.8;
      if (pen) ctx.lineTo(px, yy); else ctx.moveTo(px, yy);
      pen = true;
    }
    ctx.stroke();
  }

  // Pieza pintada escalada al ancho pedido, con el borde pisable arriba.
  function piece(ctx, img, x, y, w, sx, sw) {
    const s = w / (sw || img.width);
    ctx.drawImage(img, sx || 0, 0, sw || img.width, img.height, x, y, w, img.height * s);
  }

  // Cresta: tapa izquierda, centros alternados y tapa derecha. Si no entra, isla.
  // Los centros miden 3 celdas.
  function ridge(ctx, r, p, im) {
    const X = p.x * G, Y = p.y * G, Wp = p.w * G;
    const s = 3 * G / im.med1.width;
    const lw = im.izq.width * s, rw = im.der.width * s;
    if (Wp < (lw + rw) * 0.85) {
      piece(ctx, im.isla, X - 4, Y, Wp + 8);
    } else {
      const mids = [im.med1, im.med2, im.med3];
      let x = X + lw - 2;
      while (x < X + Wp - rw) {
        const m = mids[(r() * 3) | 0];
        const left = X + Wp - rw + 2 - x, full = m.width * s;
        if (left >= full) piece(ctx, m, x, Y, full);
        else piece(ctx, m, x, Y, left, 0, left / s);
        x += full - 2;
      }
      piece(ctx, im.izq, X, Y, lw);
      piece(ctx, im.der, X + Wp - rw, Y, rw);
    }
    edge(ctx, r, X + 2, Y + 2, Wp - 4);
  }

  // Pilar: se recorta a la altura que ocupa, apoyado sobre el piso.
  function pillar(ctx, r, p, im) {
    const w = 1.3 * G, X = p.x * G + G / 2 - w / 2, Y = p.y * G, Hp = p.h * G;
    const s = w / im.pilar.width;
    ctx.drawImage(im.pilar, 0, 0, im.pilar.width, Math.min(im.pilar.height, Hp / s), X, Y, w, Math.min(im.pilar.height * s, Hp));
    edge(ctx, r, X + 3, Y + 2, w - 6);
  }

  function fragile(ctx, r, p) {
    const X = p.x * G, Y = p.y * G, Wp = p.w * G, Hp = Math.max(1, p.h) * G * 0.6;
    ctx.save();
    ctx.lineCap = 'round';
    for (let row = 0; row < 4; row++) {
      const yy = Y + 4 + row * (Hp / 4);
      for (let px = X; px < X + Wp - 6; px += 10 + r() * 6) {
        ctx.strokeStyle = `rgba(150,60,100,${0.55 + r() * 0.35})`;
        ctx.lineWidth = 4 + r() * 3;
        ctx.beginPath(); ctx.moveTo(px, yy + (r() - 0.5) * 3); ctx.lineTo(px + 4 + r() * 6, yy + (r() - 0.5) * 3); ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let px = X + 3; px < X + Wp - 3; px += 6) ctx.fillRect(px, Y - 1, 2, 2);
    ctx.restore();
  }

  function bounce(ctx, r, p) {
    const X = p.x * G, Y = p.y * G, Wp = p.w * G, Hp = p.h * G;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(X, Y + 4);
    ctx.quadraticCurveTo(X + Wp / 2, Y - 4, X + Wp, Y + 4);
    ctx.lineTo(X + Wp - 2, Y + Hp);
    ctx.lineTo(X + 2, Y + Hp);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, Y, 0, Y + Hp);
    g.addColorStop(0, '#3577e8');
    g.addColorStop(1, '#173f9c');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    for (let i = 0; i < p.w * 26; i++) {
      ctx.strokeStyle = `rgba(200,225,255,${0.25 + r() * 0.5})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(X + r() * Wp, Y + r() * Hp, 1 + r() * 3, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(X + 1, Y + 4);
    ctx.quadraticCurveTo(X + Wp / 2, Y - 4, X + Wp - 1, Y + 4);
    ctx.stroke();
  }

  // Primero las crestas, encima pilares, frágiles y rebote.
  function paint(ctx, im) {
    const order = { plt: 0, pilar: 1, fragil: 2, rebote: 3 };
    platforms.map((p, i) => [p, i]).sort((a, b) => order[a[0].t] - order[b[0].t]).forEach(([p, i]) => {
      const r = rng(i + 7);
      if (p.t === 'pilar') pillar(ctx, r, p, im);
      else if (p.t === 'fragil') fragile(ctx, r, p);
      else if (p.t === 'rebote') bounce(ctx, r, p);
      else ridge(ctx, r, p, im);
    });
  }

  const images = {};
  for (const n of ['izq', 'med1', 'med2', 'med3', 'der', 'isla', 'sube', 'baja']) images[n] = `assets/vigilia/plat_${n}.png`;
  images.pilar = 'assets/vigilia/pilar.png';

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
    paint
  };
})();
