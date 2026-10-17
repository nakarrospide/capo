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
src/game.js         arranque del juego
src/mesa.js         arranque de la mesa
assets/levels/      obras (una imagen por nivel, 720×826)
assets/capo/        atlas de poses y frames.json con la posición de cada pose
```

## Agregar una obra

1. Foto de frente, sin sombra ni dedos, recortada al papel y llevada a 720×826.
2. Guardarla en `assets/levels/`.
3. Sumarla en `LEVELS` dentro de `src/engine.js` con su punto de inicio.

Las superficies se sacan solas: todo lo que se aleja del color del papel se puede pisar, y lo azul rebota.

## Poses de Capo

Cada pose tiene un nombre por fila y posición en la hoja (A arriba, D abajo). En `config.json` se elige qué pose va a cada acción: quieto, caminata, despegue, subida, giro, caída, yoga y baile.

## Probar en local

Hace falta un servidor (el navegador no carga las imágenes abriendo el archivo directo):

```
python3 -m http.server 8000
```

y abrir `http://localhost:8000`.
