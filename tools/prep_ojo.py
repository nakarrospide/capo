"""Arma la hoja del ojo láser: 5 estados en fila (dormido, despierto, carga, disparo, cansado).

    python3 tools/prep_ojo.py hoja.png assets/vigilia/ojo.png

Corta cada cuadro centrado en su tallo, alinea la base del tallo, saca el blanco del papel
pero conserva el blanco del ojo (todo lo que queda encerrado por la pieza sigue opaco).
Cuadros de 240 × 300; el centro del iris queda en (120, 148).
"""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import binary_fill_holes, binary_closing, label


def main(src, dst, out_h=300):
    a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255
    alpha = np.clip((1 - a.min(axis=2)) * 1.8, 0, 1)
    alpha[alpha < 0.06] = 0
    occ = alpha > 0.15
    inside = binary_fill_holes(binary_closing(occ, iterations=2)) & ~occ
    # Solo los huecos grandes son el blanco del ojo; los chicos son aire entre pestañas.
    lab, n = label(inside)
    sizes = np.bincount(lab.ravel())
    inside = np.isin(lab, np.flatnonzero(sizes > 3000)) & (lab > 0)
    alpha[inside] = 1
    rgb = np.clip((a - (1 - alpha[..., None])) / np.maximum(alpha, 1e-3)[..., None], 0, 1)
    rgb[inside] = a[inside]
    occ = alpha > 0.15
    H, W = occ.shape
    ys = np.flatnonzero(occ.any(1)); base = ys[-1] + 1
    idx = np.flatnonzero(occ[base - 60:base].any(0))
    st, s, p = [], idx[0], idx[0]
    for i in idx[1:]:
        if i - p > 20: st.append((s + p) / 2); s = i
        p = i
    st.append((s + p) / 2)
    cuts = [0] + [int((st[i] + st[i + 1]) / 2) for i in range(len(st) - 1)] + [W]
    FW = max(cuts[i + 1] - cuts[i] for i in range(len(st)))
    top = ys[0] - 4; FH = base - top + 4
    sheet = np.zeros((FH, FW * len(st), 4), np.float32)
    for i, cx in enumerate(st):
        x0, x1 = cuts[i] + 6, cuts[i + 1] - 6  # se deja afuera lo que asoma del cuadro vecino
        sub = np.dstack([rgb[top:top + FH, x0:x1], alpha[top:top + FH, x0:x1]])
        ox = int(round(FW / 2 - (cx - x0)))
        l, r = max(0, ox), min(FW, ox + sub.shape[1])
        sheet[:, i * FW + l:i * FW + r] = sub[:, l - ox:r - ox]
    k = out_h / FH
    im = Image.fromarray((sheet * 255).astype(np.uint8), 'RGBA')
    im.resize((round(FW * k) * len(st), out_h), Image.LANCZOS).save(dst, optimize=True)
    print(dst, round(FW * k), out_h)


if __name__ == '__main__':
    main(*sys.argv[1:3])
