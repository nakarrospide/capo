"""Prepara capas de fondo para Capo.

lejano: escala a la altura pedida y funde los bordes para que tilee.
    python3 tools/prep_capa.py lejano entrada.png assets/vigilia/lejano.jpg 720
medio: convierte el blanco del papel en transparencia y escala.
    python3 tools/prep_capa.py medio entrada.png assets/vigilia/medio.png 560
"""
import sys
import numpy as np
from PIL import Image


def lejano(src, dst, h, fade=0.12):
    im = Image.open(src).convert('RGB')
    im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    o = int(a.shape[1] * fade)
    # El tramo final se funde con el inicio: la imagen queda o px más corta y empalma sola.
    t = np.linspace(0, 1, o)[None, :, None]
    out = a[:, : a.shape[1] - o].copy()
    out[:, :o] = a[:, -o:] * (1 - t) + a[:, :o] * t
    Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(dst, quality=86)


def medio(src, dst, h):
    im = Image.open(src).convert('RGB')
    im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255
    # Lo blanco es papel: la tinta sale de cuánto se aleja del blanco el canal más oscuro.
    alpha = np.clip((1 - a.min(axis=2)) * 1.6, 0, 1)
    alpha[alpha < 0.04] = 0
    safe = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip((a - (1 - alpha[..., None])) / safe, 0, 1)
    out = np.dstack([rgb, alpha]) * 255
    Image.fromarray(out.astype(np.uint8), 'RGBA').save(dst, optimize=True)


if __name__ == '__main__':
    kind, src, dst, h = sys.argv[1:5]
    {'lejano': lejano, 'medio': medio}[kind](src, dst, int(h))
