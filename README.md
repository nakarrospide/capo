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
src/piezas.js       cómo se pinta cada pieza (crestas, pilar, rebote, espinas, islas que se mueven)
src/vigilia.js      nivel 1, Vigilia: capas de fondo, plataformas y recorrido
src/parpado.js      nivel 2, Párpado
src/game.js         arranque del juego
src/mesa.js         arranque de la mesa
assets/levels/      obras (una imagen por nivel, 720×826)
assets/vigilia/     capas de fondo de Vigilia (lejano y medio)
tools/prep_fragil.py tramo de la plataforma frágil
tools/prep_ojo.py    hoja del ojo láser (5 estados)
tools/prep_laser.py  haz que se repite e impacto
tools/prep_capa.py  prepara capas nuevas: escala, funde bordes, saca el blanco
tools/prep_plataformas.py  recorta la hoja de plataformas y el pilar en piezas
assets/capo/        atlas de poses y frames.json con la posición de cada pose
```

## Agregar una obra

1. Foto de frente, sin sombra ni dedos, recortada al papel y llevada a 720×826.
2. Guardarla en `assets/levels/`.
3. Sumarla en `LEVELS` dentro de `src/engine.js` con su punto de inicio.

Las superficies se sacan solas: todo lo que se aleja del color del papel se puede pisar, y lo azul rebota.

## Controles

Pantalla limpia: no hay nada dibujado hasta que apoyás un dedo.

- **Izquierda:** apoyá y arrastrá para caminar. Poco arrastre camina, a fondo corre. Aparece un círculo de tinta donde tocás y se va al soltar.
- **Izquierda, tirando para abajo:** sobre una plataforma fina, Capo se baja atravesándola (en teclado: flecha abajo).
- **Izquierda, dedo quieto medio segundo:** Capo baila (el círculo se pone magenta).
- **Derecha:** tocá en cualquier lado para saltar; mantener salta más alto. Queda una mancha de tinta.

Las UIs anteriores siguen para comparar: `?ui=zonas` y `?ui=botones`.

## Vigilia

Primer nivel armado por piezas en vez de una foto. Mide 120 × 20 celdas de 36 px.

- **Fondo:** `lejano.jpg` (parallax 0,12) y `medio.png`, los tallos con ojos dormidos (parallax 0,4, al 70%).
- **Plataformas:** piezas pintadas (tapas, tres centros, isla, rampas y pilar) recortadas de la hoja con `tools/prep_plataformas.py`. La línea blanca pisable la dibuja el juego encima. Frágil y rebote siguen dibujadas en código. El recorrido de los 5 tramos está en `src/vigilia.js`.
- **Ojos láser:** dormido, despierto, carga con línea negra de aviso, disparo y descanso. Tipos: fijo, rastreador y barredor. El haz corta en lo sólido, así que los pilares cubren. Si toca a Capo, vuelve al último punto de control.
- **Probarlo:** `index.html?nivel=vigilia`, o elegir Vigilia en la mesa y pushear.

Para cambiar las plataformas: `python3 tools/prep_plataformas.py hoja.png pilar.png assets/vigilia`.

Para cambiar una capa: `python3 tools/prep_capa.py lejano foto.png assets/vigilia/lejano.jpg 720` (o `medio … 560`).

## Elementos

Los colores dicen qué hace cada cosa: magenta se pisa, azul rebota, rojo mata, ocre se junta.

- **Gotas ocre:** se juntan tocándolas. El contador aparece arriba a la izquierda un momento.
- **Estacas:** puntos de control. Se ponen blancas cuando Capo pasa y ahí vuelve si muere.
- **Puerta de luz:** fin del nivel. Capo baila, aparece el cartel con las gotas y pasa al siguiente.
- **Plataforma fina** (cresta de 2 de alto o menos): se atraviesa desde abajo y se baja tirando el stick.
- **Móvil:** isla que va y vuelve entre dos puntos (`to`, `period`), con una pausa en cada punta. Lleva a Capo encima.
- **Párpado:** isla con un ojo cerrado pintado. Tiembla, se cierra y deja una línea punteada donde va a volver (`on`, `off`, `offset`).
- **Espinas:** rojas, sobre una cresta. Tocarlas es volver al punto de control.
- **Frágil, rebote y ojos láser:** como en Vigilia.

## Párpado

Segundo nivel, 150 × 24 celdas. Mismo fondo que Vigilia teñido de noche. Cinco tramos, cada uno enseña algo:

1. El viaje: primera isla móvil y un puente fino con dos gotas abajo (se baja atravesándolo).
2. Párpados: dos filas que se abren en ola de izquierda a derecha, con un descanso bajo un ojo que dispara para abajo.
3. El ascensor: sube a una cornisa con un ojo barredor; el pilar cubre. Abajo, espinas.
4. Espinas y rebote: el pad azul tira por encima (más alto si mantenés el salto) y una isla móvil cruza al final.
5. Final: dos pilares para cubrirse de un rastreador que cuelga, y la puerta.

Probarlo directo: `index.html?nivel=parpado`. Desde la consola: `capo.setLevel('parpado')`.

## Poses de Capo

Cada pose tiene un nombre por fila y posición en la hoja (A arriba, D abajo). En `config.json` se elige qué pose va a cada acción: quieto, carrera, despegue, subida, giro, caída, aterrizaje, yoga y baile.

- `scale`: las poses de la fila D están dibujadas más grandes; se achican para que la cabeza mida igual que en las demás.
- `anchor`: punto de apoyo horizontal de cada pose (0 a 1). En la carrera va bajo la cabeza para que Capo no salte de lugar entre cuadros.
- `walkFps`: cuadros por segundo de la carrera a toda velocidad. Caminando lento baja hasta la mitad.

Encima de las poses el juego suma movimiento: rebote leve en cada paso, inclinación hacia adelante al correr y hacia atrás al frenar en seco, un instante agachado después de una caída fuerte y respiración cuando está quieto.

Si cambia el mapa de poses, subir `version` en `config.json`: lo pusheado desde la mesa con otra versión deja de pisar las poses.

## Probar en local

Hace falta un servidor (el navegador no carga las imágenes abriendo el archivo directo):

```
python3 -m http.server 8000
```

y abrir `http://localhost:8000`.

## Antes de pushear

```
python3 tools/bump.py
```

Le pone una versión nueva a los CSS y JS en `index.html` y `mesa.html`. Sin esto, Safari puede mezclar el HTML nuevo con archivos viejos guardados y la pantalla se rompe hasta que vence el caché.
