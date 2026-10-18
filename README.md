# Capo

Un plataformas donde Capo, un stickman dibujado a mano, camina sobre pinturas abstractas.
Se pisa lo pintado, el azul rebota y Capo gira 360, y si lo dejás quieto hace yoga.

- **Juego:** `index.html`. Pensado para el celular, con botones tipo consola. Sacudí el teléfono para saltar.
- **Mesa de trabajo:** `mesa.html`. Ajustes en vivo (salto, cámara, baile, sacudida), elección de obra y prueba de hojas de secuencia. El botón **Pushear al juego** guarda los ajustes en el dispositivo y el juego los toma al abrirse.

## Estructura

```
index.html          juego
mesa.html           mesa de trabajo
config.json         ajustes base del juego
src/config.js       carga config.json y los ajustes pusheados desde la mesa
src/engine.js       motor: superficies a partir de la imagen, física, poses de Capo, baile
src/controls.js     teclado, botones táctiles y sacudir el celular
src/vigilia.js      nivel Vigilia: capas de fondo, plataformas y recorrido
src/game.js         arranque del juego
src/mesa.js         arranque de la mesa
assets/levels/      obras (una imagen por nivel, 720×826)
assets/vigilia/     capas de fondo de Vigilia (lejano y medio)
tools/prep_fragil.py tramo de la plataforma frágil
tools/prep_capa.py  prepara capas nuevas: escala, funde bordes, saca el blanco
tools/prep_plataformas.py  recorta la hoja de plataformas y el pilar en piezas
assets/capo/        atlas de poses y frames.json con la posición de cada pose
```

## Agregar una obra

1. Foto de frente, sin sombra ni dedos, recortada al papel y llevada a 720×826.
2. Guardarla en `assets/levels/`.
3. Sumarla en `LEVELS` dentro de `src/engine.js` con su punto de inicio.

Las superficies se sacan solas: todo lo que se aleja del color del papel se puede pisar, y lo azul rebota.

## Vigilia

Primer nivel armado por piezas en vez de una foto. Mide 120 × 20 celdas de 36 px.

- **Fondo:** `lejano.jpg` (parallax 0,12) y `medio.png`, los tallos con ojos dormidos (parallax 0,4, al 70%).
- **Plataformas:** piezas pintadas (tapas, tres centros, isla, rampas y pilar) recortadas de la hoja con `tools/prep_plataformas.py`. La línea blanca pisable la dibuja el juego encima. Frágil y rebote siguen dibujadas en código. El recorrido de los 5 tramos está en `src/vigilia.js`.
- **Probarlo:** `index.html?nivel=vigilia`, o elegir Vigilia en la mesa y pushear.

Para cambiar las plataformas: `python3 tools/prep_plataformas.py hoja.png pilar.png assets/vigilia`.

Para cambiar una capa: `python3 tools/prep_capa.py lejano foto.png assets/vigilia/lejano.jpg 720` (o `medio … 560`).

## Poses de Capo

Cada pose tiene un nombre por fila y posición en la hoja (A arriba, D abajo). En `config.json` se elige qué pose va a cada acción: quieto, caminata, despegue, subida, giro, caída, yoga y baile.

## Probar en local

Hace falta un servidor (el navegador no carga las imágenes abriendo el archivo directo):

```
python3 -m http.server 8000
```

y abrir `http://localhost:8000`.
