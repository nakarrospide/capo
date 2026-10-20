"""Pone una versión nueva en los links a src/ de index.html, mesa.html y editor.html.

Safari guarda los archivos un rato; si cambia el HTML pero no la versión,
puede mezclar HTML nuevo con CSS o JS viejos. Correr antes de cada push:

    python3 tools/bump.py
"""
import re, time, pathlib

v = time.strftime('%Y%m%d%H%M')
root = pathlib.Path(__file__).resolve().parent.parent
for name in ('index.html', 'mesa.html', 'editor.html'):
    p = root / name
    s = re.sub(r'((?:src|href)="src/[^"?]+)(\?v=[^"]*)?"', rf'\1?v={v}"', p.read_text())
    p.write_text(s)
print('versión', v)
