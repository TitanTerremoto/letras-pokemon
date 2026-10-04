# Letras Pokémon

Juego para grabar/streamear entre dos personas, construido sobre la infraestructura visual de
**PokeDuelo** y **Buscaminas Pokémon** (mismas zonas de cámara, jugadores, tipografías, fondo,
cartas, panel de control y teclas).

En cada ronda sale una región o un tipo y un objetivo: el nombre **más corto** o el **más largo**.
Cada carta oculta es un Pokémon por descubrir. La Poké Ball muestra cuántas letras tiene y la
inicial va en dorado.

**Tablero compartido, como el Buscaminas en modo "un clic cada uno":** SKY y GUTI completan el
mismo tablero alternándose respuesta a respuesta.

- **Acierto:** la carta se da vuelta con el sprite, suma 1 a quien lo dijo y pasa el turno.
- **Error** (otro largo u otra región/tipo) = **¡BOMBA!**: termina la ronda. El cartel muestra quién
  lo dijo, qué dijo y por qué falló ("TIENE 7 LETRAS", "ES DE JOHTO", "ES VENENO"). Se revelan las
  cartas que faltaban.
- **Nombre inexistente o ya dicho:** no cuenta, sigue el mismo jugador.
- **Todas las cartas descubiertas:** ¡TABLERO LIMPIO!
- Quién abre la ronda se alterna ronda a ronda.

Ejemplo: *Kanto, más corto* → Mew y Muk (3 letras) y, como son pocas, la **escalera** suma las de
4 letras (Abra, Onix, Jynx, Seel). El primer escalón siempre es el extremo real de la categoría.

## Cómo se cuentan las letras

Se cuentan **letras y números del nombre en español** (los mismos nombres de PokeDuelo). Espacios,
guiones, puntos, apóstrofos, ♀/♂ y tildes no cuentan:
Mr. Mime = 6 · Ho-Oh = 4 · Porygon2 = 8 · Farfetch'd = 9 · Código Cero = 10.

Se aceptan respuestas en español o en inglés (Type: Null → Código Cero), sin tildes, y con un
error de tipeo (dos en nombres de 9 letras o más). Si dos Pokémon quedan igual de cerca, no se
adivina: hay que escribirlo bien.

## Abrir

**Jugar:** [vertical](https://titanterremoto.github.io/letras-pokemon/) ·
[horizontal](https://titanterremoto.github.io/letras-pokemon/horizontal.html) ·
[celular del jugador](https://titanterremoto.github.io/letras-pokemon/jugar.html)

| Versión | GitHub Pages | Local (`npm run serve`) | Doble clic |
|---|---|---|---|
| Vertical 1080×1982 | https://titanterremoto.github.io/letras-pokemon/ | http://localhost:8123/ | `index.html` |
| Horizontal 1920×1080 | https://titanterremoto.github.io/letras-pokemon/horizontal.html | http://localhost:8123/horizontal.html | `horizontal.html` |
| Celular del jugador | https://titanterremoto.github.io/letras-pokemon/jugar.html | http://localhost:8123/jugar.html | — |

Para jugar en una sola pantalla no hace falta servidor ni Internet: datos, sprites, fuentes y fondo
están en el proyecto. La sala en línea sí necesita Internet (ver abajo).

Parámetros de URL: `?seed=12345` partida reproducible · `?debug=1` panel de debug ·
`?nopanel=1` sin panel · `?clean=1` sin guías de zonas · `#panel` sólo el panel (para otra pestaña) ·
`?espectador=CÓDIGO` sólo mirar · `jugar.html?sala=CÓDIGO` celular del jugador.

## Sala en línea: celulares y espectadores

Mismo sistema que Carrera de Medallas: PeerJS (WebRTC). El servidor público de PeerJS sólo presenta
a los dispositivos; los mensajes viajan directo entre ellos. **La pantalla principal (la que se graba)
es la autoridad:** guarda la partida y decide si cada respuesta es correcta. Los demás sólo mandan
intenciones o miran.

1. En el panel de la pantalla principal: **🌐 Crear sala en línea**. Aparece un código de 5 letras.
2. **Jugadores:** cada uno abre el enlace de jugador (`jugar.html?sala=CÓDIGO`) en su celular y elige
   su lado (SKY o GUTI). Responde sólo en su turno, y mientras escribe, **lo que escribe se ve en la
   pantalla principal y en los espectadores**. Si recarga o se corta, recupera su lado solo. Los
   lados sin celular se siguen jugando desde la pantalla principal.
3. **Espectadores** (otro stream, OBS): enlace vertical (`index.html?espectador=CÓDIGO`) u horizontal
   (`horizontal.html?espectador=CÓDIGO`), sin depender de la orientación de la pantalla principal.
   Ven la misma partida con sus animaciones, carteles y sonidos, sin panel ni botones. Si entran
   tarde, se ponen al día. Hasta 12 a la vez; el panel muestra cuántos hay.

Seguridad: la pantalla rechaza respuestas fuera de turno o de un lado que no es del dispositivo; todo
lo que llega por la red se valida (`LetrasGame.isValidState`, `LetrasNet.isMessage`) y los nombres se
dibujan siempre como texto. Latido cada 2 s: si un lado no oye al otro en 8 s, libera el lado y el
dispositivo se reconecta solo.

Los enlaces de la sala sirven para otros equipos sólo si la pantalla principal está abierta desde una
dirección pública (GitHub Pages). Abierta como archivo o `localhost`, el panel lo avisa.

## Escalado del tablero

Los tableros tienen entre 3 y 12 cartas. `js/layout.js` prueba todas las columnas posibles y elige
la que deja el contenido más grande sin deformarlo (`k` sobre la carta base de la grilla 4×3, tope
×1,8). Cada carta llena su celda y la última fila queda centrada:

| Cartas | Vertical | Horizontal |
|---|---|---|
| 3–4 | 2×2, ×1,54 | 2×2, ×1,55 |
| 5–6 | 3×2, ×1,35 | 3×2, ×1,35 |
| 7–8 | 4×2 (celdas más altas) | 4×2 (celdas más altas) |
| 9 | 3×3 | 3×3 |
| 10–12 | 4×3, base | 4×3, base |

Los tests verifican que todos los tamaños del banco entren en la zona de juego de las dos orientaciones.

## Layouts

Copiados del Buscaminas: `css/vertical.css` y `css/horizontal.css` sólo cambian la disposición.

- **Vertical** (`index.html`): banner 1080×78 · **cámaras 1080×650** · juego 1080×984 · banner+logo 1080×270.
- **Horizontal** (`horizontal.html`): **cámaras 1920×482** · juego 1920×598.

La respuesta se escribe en la fila de turno (queda a la vista de cámara), en el panel o en el celular del jugador.

## Teclas (grabación)

Funcionan con la casilla de respuesta sin foco (`Esc` la suelta).

| Tecla | Acción |
|---|---|
| `Enter` / `Espacio` | Continuar (ronda terminada) · nueva partida al final · volver a la casilla |
| `T` | Reintentar ronda |
| `J` | Cambiar turno |
| `U` / `Retroceso` | Deshacer la última respuesta (devuelve punto y turno; reabre la ronda si fue bomba) |
| `←` / `→` | Ronda anterior / siguiente |
| `+` / `−` | Sumar / restar 1 punto al jugador activo |
| `M` · `D` · `R` · `G` · `P` | Mute · debug · grabación 1:1 · guías · panel |

El panel tiene además la lista de lo dicho en la ronda y la **solución** (oculta hasta que la abrís).

## Configuración (`js/config.js`)

`players` (SKY, GUTI), `startingPlayer`, `totalRounds` (12; el banco tiene 48), `allowRetry`,
`perfectBonus`, `bombPenalty`, `keepPointsOnBomb`, `minCards`/`maxCards` (escalera de 6 a 12 cartas),
`minValid`, `fuzzy`, rutas de `audio` (mismos archivos opcionales que el Buscaminas).

## Datos

`scripts/build-data.mjs` genera `data/game-data.js` desde los CSV oficiales de PokéAPI
(1025 especies, nombre en español e inglés, generación y tipos de la forma por defecto) y baja a
`assets/sprites/` los sprites que falten (repo PokeAPI/sprites, los mismos de PokeDuelo y Buscaminas).

```bash
npm run build   # regenera data/game-data.js (usa .cache/; --refresh vuelve a descargar)
npm test        # reglas, validación de la sala y escalado del tablero (18 tests)
npm run serve   # http://localhost:8123/
```

## Estructura

```
index.html · horizontal.html · jugar.html (celular)
css/  common.css · vertical.css · horizontal.css · jugar.css   (base del Buscaminas + lo propio al final de common.css)
js/   config.js · letters.js (dominio) · layout.js (escalado) · game.js (partida + validación) · audio.js · app.js (DOM)
      net-protocol.js · net-host.js (sala) · net-client.js · net-spectator.js · jugar.js (celular)
data/ game-data.js
vendor/ peerjs.min.js (MIT, igual que Carrera de Medallas)
assets/ sprites/ · fonts/ (Bungee, Press Start 2P · OFL) · img/ (fondo de PokeDuelo) · audio/
scripts/ build-data · serve · run-tests
tests/ game.test.mjs · net-layout.test.mjs
```
