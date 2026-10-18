"""Recorta un tramo de la hoja de la plataforma frágil.

    python3 tools/prep_fragil.py hoja.png assets/vigilia/fragil.png x0 y0 x1 y1

Saca el blanco del papel y deja el borde de arriba (lo que se pisa) en y = 0.
El punteado blanco lo vuelve a dibujar el juego encima, así que no importa que se pierda.
"""
import sys
import numpy as np
from PIL import Image


def main(src, dst, x0, y0, x1, y1):
    a = np.asarray(Image.open(src).convert('RGB').crop((x0, y0, x1, y1))).astype(np.float32) / 255
    alpha = np.clip((1 - a.min(axis=2)) * 1.8, 0, 1)
    alpha[alpha < 0.05] = 0
    rgb = np.clip((a - (1 - alpha[..., None])) / np.maximum(alpha, 1e-3)[..., None], 0, 1)
    solid = (alpha > 0.6).mean(axis=1)
    top = int(np.argmax(solid > 0.35))
    rows = np.flatnonzero((alpha > 0.1).any(axis=1))
    out = np.dstack([rgb, alpha])[top:rows[-1] + 1] * 255
    Image.fromarray(out.astype(np.uint8), 'RGBA').save(dst, optimize=True)
    print(dst, out.shape[1], out.shape[0], 'top', top)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], *map(int, sys.argv[3:7]))
