// Piezas pintadas compartidas por los niveles armados (Vigilia, Párpado).
// Cada nivel llama CapoPiezas.make(G) con su tamaño de celda y usa paint/paintPiece.
window.CapoPiezas = (function () {
  function rng(seed) {
    let a = seed * 2654435761 >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Imágenes de la hoja de Vigilia. Los niveles nuevos reusan las mismas piezas.
  function images() {
    const im = {};
    for (const n of ['izq', 'med1', 'med2', 'med3', 'der', 'isla', 'sube', 'baja']) im[n] = `assets/vigilia/plat_${n}.png`;
    im.pilar = 'assets/vigilia/pilar.png';
    im.fragil = 'assets/vigilia/fragil.png';
    im.rebote = 'assets/vigilia/rebote.png';
    im.haz = 'assets/vigilia/haz.png';
    im.impacto = 'assets/vigilia/impacto.png';
    return im;
  }

  function make(G) {
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

    // Frágil dibujada en código (solo si falta la pieza pintada).
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

    // Pad azul pintado. 42 = fila del borde pisable en rebote.png (el centro de la curva).
    const REBOTE_TOP = 42;
    function bounce(ctx, r, p, im) {
      const X = p.x * G, Y = p.y * G, Wp = p.w * G;
      const w = Wp + 12, s = w / im.rebote.width;
      ctx.drawImage(im.rebote, X - 6, Y - REBOTE_TOP * s, w, im.rebote.height * s);
    }

    // Espinas: rojo puro, que en este mundo es lo único que mata. Van paradas sobre el borde de una cresta.
    function thorns(ctx, r, p) {
      const X = p.x * G, Y = p.y * G + 3, Wp = p.w * G;
      ctx.save();
      ctx.lineJoin = 'round';
      let x = X + 2;
      while (x < X + Wp - 6) {
        const b = 7 + r() * 6, h = 11 + r() * 8, lean = (r() - 0.5) * 5;
        ctx.beginPath();
        ctx.moveTo(x, Y);
        ctx.quadraticCurveTo(x + b * 0.35, Y - h * 0.5, x + b / 2 + lean, Y - h);
        ctx.quadraticCurveTo(x + b * 0.65, Y - h * 0.5, x + b, Y);
        ctx.closePath();
        ctx.fillStyle = `rgba(${190 + r() * 25 | 0},${12 + r() * 14 | 0},${24 + r() * 10 | 0},0.95)`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(70,6,14,0.85)'; ctx.lineWidth = 1.1; ctx.stroke();
        x += b * (0.7 + r() * 0.35);
      }
      // Gotas que chorrean sobre la cresta.
      for (let i = 0; i < p.w * 2; i++) {
        const dx = X + r() * Wp, dl = 3 + r() * 9;
        ctx.strokeStyle = 'rgba(200,15,29,0.55)'; ctx.lineWidth = 1.2 + r();
        ctx.beginPath(); ctx.moveTo(dx, Y); ctx.lineTo(dx + (r() - 0.5), Y + dl); ctx.stroke();
      }
      ctx.restore();
    }

    // Isla suelta: la usan las piezas que se mueven. El párpado lleva un ojo cerrado con pestañas.
    function island(ctx, r, p, im) {
      const X = p.x * G, Y = p.y * G, Wp = p.w * G;
      piece(ctx, im.isla, X - 4, Y, Wp + 8);
      if (p.t === 'parpado') {
        const cx = X + Wp / 2, cy = Y + Wp * 0.3, rw = Wp * 0.3;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(40,10,30,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - rw, cy); ctx.quadraticCurveTo(cx, cy + rw * 0.55, cx + rw, cy); ctx.stroke();
        ctx.lineWidth = 1.1;
        for (let i = 0; i <= 8; i++) {
          const t = i / 8, px = cx - rw + t * rw * 2, py = cy + Math.sin(t * Math.PI) * rw * 0.27;
          const a = Math.PI / 2 + (t - 0.5) * 1.3;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * 6, py + Math.sin(a) * (6 + r() * 4)); ctx.stroke();
        }
        ctx.restore();
      }
      edge(ctx, r, X + 2, Y + 2, Wp - 4);
    }

    // Primero las crestas, encima pilares, frágiles, rebote y espinas.
    function paint(platforms) {
      return function (ctx, im) {
        const order = { plt: 0, pilar: 1, fragil: 2, rebote: 3, espinas: 4 };
        platforms.map((p, i) => [p, i]).filter(([p]) => p.t in order)
          .sort((a, b) => order[a[0].t] - order[b[0].t]).forEach(([p, i]) => {
            const r = rng(i + 7);
            if (p.t === 'pilar') pillar(ctx, r, p, im);
            else if (p.t === 'fragil') { if (!im.fragil) fragile(ctx, r, p); } // con la pieza pintada la arma el motor
            else if (p.t === 'rebote') bounce(ctx, r, p, im);
            else if (p.t === 'espinas') thorns(ctx, r, p);
            else ridge(ctx, r, p, im);
          });
      };
    }
    // Para piezas que el motor mueve (móvil, párpado): se pintan solas en su propia textura.
    function paintPiece(ctx, p, im) { island(ctx, rng(Math.round(p.x * 13 + p.y * 7)), p, im); }

    return { paint, paintPiece };
  }

  return { make, images, rng };
})();
