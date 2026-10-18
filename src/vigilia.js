// Vigilia: primer nivel armado por piezas (no sale de una foto).
// Fondo en dos capas con parallax y plataformas dibujadas en código como provisorias,
// hasta que llegue la hoja de plataformas pintada.
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
    { t: 'plt', x: 72, y: 17, w: 3, h: 3 },
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

  // Cresta rasgada: cuerpo magenta que se deshace hacia abajo en goteo.
  function ridge(ctx, r, p, cols, solid) {
    const X = p.x * G, Y = p.y * G, Wp = p.w * G, Hp = p.h * G;
    ctx.beginPath();
    ctx.moveTo(X, Y);
    for (let px = X; px <= X + Wp; px += 6) ctx.lineTo(px, Y - r() * 3);
    let py = Y;
    while (py < Y + Hp) { py += 8 + r() * 10; ctx.lineTo(X + Wp + (r() - 0.6) * 8, Math.min(py, Y + Hp)); }
    for (let px = X + Wp; px >= X; px -= 10 + r() * 14) {
      ctx.lineTo(px, Y + Hp + (r() < 0.35 ? r() * 42 : r() * 10));
      ctx.lineTo(px - 4, Y + Hp - r() * 12);
    }
    py = Y + Hp;
    while (py > Y) { py -= 8 + r() * 10; ctx.lineTo(X + (r() - 0.4) * 8, Math.max(Y, py)); }
    ctx.closePath();

    const g = ctx.createLinearGradient(0, Y, 0, Y + Hp + 40);
    g.addColorStop(0, cols[0]);
    g.addColorStop(0.55, cols[1]);
    g.addColorStop(1, solid ? cols[1] : 'rgba(110,50,80,0)');
    ctx.save();
    ctx.globalAlpha = solid ? 1 : 0.93;
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    for (let i = 0; i < p.w * p.h * 3; i++) {
      ctx.fillStyle = `rgba(50,15,35,${0.06 + r() * 0.1})`;
      ctx.beginPath();
      ctx.ellipse(X + r() * Wp, Y + r() * Hp, 6 + r() * 20, 4 + r() * 12, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < p.w * p.h * 30; i++) {
      ctx.fillStyle = `rgba(255,235,245,${r() * 0.22})`;
      ctx.fillRect(X + r() * Wp, Y + 4 + r() * Hp, 1.3, 1.3);
    }
    // Vetas blancas finas, como las grietas de la referencia.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < Math.max(1, p.w / 3); i++) {
      let vx = X + r() * Wp, vy = Y + 6;
      ctx.beginPath(); ctx.moveTo(vx, vy);
      for (let k = 0; k < 6; k++) { vx += (r() - 0.5) * 14; vy += 6 + r() * 10; ctx.lineTo(vx, vy); }
      ctx.stroke();
    }
    ctx.restore();
    edge(ctx, r, X, Y, Wp);
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

  function paint(ctx) {
    platforms.forEach((p, i) => {
      const r = rng(i + 7);
      if (p.t === 'pilar') ridge(ctx, r, p, ['#6e2440', '#4b1427'], true);
      else if (p.t === 'fragil') fragile(ctx, r, p);
      else if (p.t === 'rebote') bounce(ctx, r, p);
      else ridge(ctx, r, p, ['#a2466c', '#78294a'], false);
    });
  }

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
    paint
  };
})();
