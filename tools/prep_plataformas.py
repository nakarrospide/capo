"""Recorta la hoja de plataformas y el pilar en piezas sueltas con transparencia.

    python3 tools/prep_plataformas.py hoja.png pilar.png assets/vigilia/

Saca el blanco del papel, separa las piezas por los espacios vacíos y guarda
cada una con su borde superior (lo que se pisa) en y = 0. Las medidas quedan
en piezas.json para que el juego sepa cómo encajarlas.
"""
import json, sys
import numpy as np
from PIL import Image

NAMES_TOP = ['izq', 'med1', 'med2', 'med3', 'der']
NAMES_BOTTOM = ['isla', 'sube', 'baja']


def to_alpha(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255
    alpha = np.clip((1 - a.min(axis=2)) * 1.8, 0, 1)
    alpha[alpha < 0.05] = 0
    rgb = np.clip((a - (1 - alpha[..., None])) / np.maximum(alpha, 1e-3)[..., None], 0, 1)
    return rgb, alpha


def spans(profile, min_gap, min_len):
    on = profile > 0
    out, start, gap = [], None, 0
    for i, v in enumerate(on):
        if v:
            if start is None: start = i
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                if i - gap - start >= min_len: out.append((start, i - gap + 1))
                start, gap = None, 0
    if start is not None and len(on) - start >= min_len: out.append((start, len(on)))
    return out


def save(rgb, alpha, box, path):
    x0, y0, x1, y1 = box
    sub_a = alpha[y0:y1, x0:x1]
    # Borde pisable: primera fila donde la pieza ya es sólida en buena parte del ancho.
    solid = (sub_a > 0.6).mean(axis=1)
    top = int(np.argmax(solid > 0.35))
    rgba = np.dstack([rgb[y0 + top:y1, x0:x1], sub_a[top:]]) * 255
    Image.fromarray(rgba.astype(np.uint8), 'RGBA').save(path, optimize=True)
    return {'w': int(x1 - x0), 'h': int(y1 - y0 - top)}


def sheet(src, outdir):
    rgb, alpha = to_alpha(Image.open(src))
    mask = alpha > 0.12
    rows = spans(mask.sum(axis=1) > 3, 25, 80)
    assert len(rows) == 2, rows
    info = {}
    for (r0, r1), names in zip(rows, [NAMES_TOP, NAMES_BOTTOM]):
        cols = spans(mask[r0:r1].sum(axis=0) > 6, 12, 60)
        assert len(cols) == len(names), (names, cols)
        for (c0, c1), n in zip(cols, names):
            info[n] = save(rgb, alpha, (c0, r0, c1, r1), f'{outdir}/plat_{n}.png')
    return info


def pillar(src, outdir, ref_hue):
    rgb, alpha = to_alpha(Image.open(src))
    # El pilar vino rojo: lo llevo al tono de la hoja para que el rojo quede solo para los láseres.
    import matplotlib.colors as mc
    h = mc.rgb_to_hsv(rgb)
    sel = (h[..., 1] > 0.3) & (alpha > 0.8)
    shift = ref_hue - float(np.median(h[..., 0][sel]))
    h[..., 0] = (h[..., 0] + shift) % 1
    h[..., 1] *= 0.85
    rgb = mc.hsv_to_rgb(h)
    ys, xs = np.where(alpha > 0.12)
    return save(rgb, alpha, (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1), f'{outdir}/pilar.png')


def hue_of(path):
    a = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32) / 255
    px = a[a[..., 3] > 0.8][:, :3]
    import matplotlib.colors as mc
    h = mc.rgb_to_hsv(px[:: max(1, len(px) // 50000)])
    return float(np.median(h[:, 0][h[:, 1] > 0.3]))


if __name__ == '__main__':
    hoja, pil, outdir = sys.argv[1:4]
    info = sheet(hoja, outdir)
    info['pilar'] = pillar(pil, outdir, hue_of(f'{outdir}/plat_med1.png'))
    json.dump(info, open(f'{outdir}/piezas.json', 'w'), indent=1)
    print(json.dumps(info))
