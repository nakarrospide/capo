"""Prepara el haz y el impacto del láser.

    python3 tools/prep_laser.py hoja.png assets/vigilia

Del haz toma un tramo del medio y funde los bordes para que se repita sin costura.
Del impacto recorta la salpicadura. Los dos quedan con transparencia.
"""
import sys
import numpy as np
from PIL import Image


def unwhite(a):
    alpha = np.clip((1 - a.min(axis=2)) * 1.8, 0, 1)
    alpha[alpha < 0.05] = 0
    rgb = np.clip((a - (1 - alpha[..., None])) / np.maximum(alpha, 1e-3)[..., None], 0, 1)
    return np.dstack([rgb, alpha])


def bbox(px):
    occ = px[..., 3] > 0.1
    ys, xs = np.flatnonzero(occ.any(1)), np.flatnonzero(occ.any(0))
    return px[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]


def main(src, outdir):
    a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255
    H = a.shape[0]
    beam_rows = a[: int(H * 0.42)]
    occ = (1 - beam_rows.min(axis=2)) > 0.1
    xs = np.flatnonzero(occ.sum(0) > 20)
    x0, x1 = xs[0] + 40, xs[-1] - 40
    mid = (x0 + x1) // 2
    seg = unwhite(beam_rows[:, mid - 380:mid + 380])
    o = 120
    t = np.linspace(0, 1, o)[None, :, None]
    tile = seg[:, :-o].copy()
    tile[:, :o] = seg[:, -o:] * (1 - t) + seg[:, :o] * t
    ys = np.flatnonzero((tile[..., 3] > 0.1).any(1))
    tile = tile[ys[0]:ys[-1] + 1]
    im = Image.fromarray((tile * 255).astype(np.uint8), 'RGBA')
    im.resize((im.width // 2, im.height // 2), Image.LANCZOS).save(f'{outdir}/haz.png', optimize=True)
    hit = bbox(unwhite(a[int(H * 0.42):, int(a.shape[1] * 0.3):int(a.shape[1] * 0.7)]))
    im = Image.fromarray((hit * 255).astype(np.uint8), 'RGBA')
    im.resize((im.width // 2, im.height // 2), Image.LANCZOS).save(f'{outdir}/impacto.png', optimize=True)
    print('ok')


if __name__ == '__main__':
    main(*sys.argv[1:3])
