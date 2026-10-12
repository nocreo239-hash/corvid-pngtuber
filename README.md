# Corvid PNGtuber

App de escritorio para ser PNGtuber en Twitch: tu personaje abre la boca cuando hablas, parpadea solo, rebota, tiembla cuando gritas y cambia de expresión con atajos de teclado. Incluye un cuervo chibi de ejemplo con 4 expresiones.

## Instalar y abrir

1. Instala **Node.js LTS** desde https://nodejs.org (una sola vez).
2. Descomprime esta carpeta donde quieras.
3. Abre una terminal dentro de la carpeta (en el Explorador: clic derecho → *Abrir en Terminal*) y ejecuta:

   ```
   npm install
   npm start
   ```

   `npm install` descarga Electron (unos 100 MB), solo la primera vez. Después basta con `npm start`.

### Crear un .exe

```
npm run dist
```

Aparece `Corvid PNGtuber 1.0.0.exe` en la carpeta `dist`. Es portable: lo copias donde quieras y lo abres con doble clic, sin instalar nada. Windows SmartScreen puede avisar porque no está firmado: *Más información → Ejecutar de todas formas*.

## Conectarlo a OBS

**Opción recomendada: fuente de navegador** (fondo transparente real)

1. En la pestaña **OBS** de la app, pulsa **Copiar** junto a la URL (`http://127.0.0.1:47474/obs`).
   Si ese puerto está ocupado, la app usa el siguiente libre (47475…) y la pestaña OBS muestra la URL correcta.
2. En OBS: **+** → **Navegador** → pega la URL, ancho **600** y alto **600**.
3. Deja la app abierta (puede estar minimizada). Arriba verás *OBS conectado*.

**Alternativa: modo captura.** Pulsa **Modo captura**, añade en OBS una *Captura de ventana* de Corvid y aplícale un filtro *Clave cromática*. Sales con `Esc`.

## Usar tus propias imágenes

En la pestaña **Expresiones**, cada expresión tiene 5 casillas. Arrastra un PNG a cada una o haz clic para elegirlo:

| Casilla            | Cuándo se ve                        | Si está vacía              |
|--------------------|-------------------------------------|----------------------------|
| Quieto             | Callado                             | —                          |
| Hablando           | Cuando el micrófono pasa el umbral  | usa *Quieto*               |
| Parpadeo           | Un instante cada pocos segundos     | no parpadea                |
| Parpadeo hablando  | Parpadeo mientras hablas            | no parpadea al hablar      |
| Grito              | Cuando hablas muy fuerte            | usa *Hablando*             |

Consejos: usa PNG con fondo transparente, todas las imágenes del **mismo tamaño** y con el personaje en la **misma posición** (si no, salta al cambiar). Los GIF animados también funcionan. No hay límite de expresiones.

### Gestos al hablar (alas, brazos…)

Cada expresión tiene además **hasta 3 gestos** (desplegable *Gestos al hablar* de su tarjeta), cada uno con sus
mismas 5 casillas pero con el personaje en otra postura: un ala levantada, los brazos abiertos… Al empezar a hablar
se elige uno y se mantiene unos segundos (la boca sigue abriéndose y cerrándose con tu voz); luego cambia a otro, y
cuando te callas un rato vuelve a la postura de arriba. Se ajusta en **Animación → Gestos al hablar**.
La cabeza debe estar en el mismo sitio en todos los gestos para que la cara no salte.

### Importar una carpeta

**Importar carpeta** carga muchas expresiones de una vez. Elige una carpeta con una subcarpeta por expresión:

```
mi_personaje/
  normal/   quieto.png  hablando.png  parpadeo.png  parpadeo_hablando.png  grito.png
  feliz/    quieto.png  hablando.png  grito.png
    gesto1/ quieto.png  hablando.png  parpadeo.png  …   (gestos al hablar: gesto1, gesto2, gesto3)
```

El nombre de la subcarpeta es el de la expresión. Si ya existe una con ese nombre, se actualizan sus imágenes. También valen los nombres en inglés (`idle`, `talk`, `blink`, `talk_blink`, `shout`).
Una subcarpeta llamada `accesorios/` se importa como accesorios (un PNG por accesorio; el nombre del archivo es el del accesorio).

### Exportar el avatar (copia de seguridad o para otro PC)

**Exportar avatar** guarda en la carpeta que elijas una subcarpeta `Corvid avatar <fecha>` con todas las expresiones,
los accesorios y un `avatar.json` con los nombres, teclas, ajustes de cada accesorio y los de la app.
Para recuperarlo, **Importar carpeta** y elige esa carpeta: restaura todo y pregunta si aplicar también los ajustes
(micrófono, animación, tamaño…). Las teclas solo se ponen si no las usa ya otra cosa. El micrófono elegido no se
exporta porque depende de cada PC.

## Accesorios

Pestaña **Accesorios**: sombreros, gafas, alas… que se ponen **encima** (o **detrás**) del personaje en todas las
expresiones y se mueven con él (rebote, respiración, temblor). La imagen debe ser un PNG transparente **del mismo tamaño**
que las del personaje, con el accesorio ya colocado en su sitio.

Se ponen y quitan con su tecla, con su botón en la barra de expresiones o desde Streamer.bot
(`/api/accesorio/Sombrero_vaquero/alternar`, `/poner` o `/quitar`).

Cada accesorio tiene además:
- **Se ve**: siempre, solo al hablar, solo al gritar o solo callado (gotas de sudor al gritar, "Zzz" en silencio…).
- **Inercia**: cuánto se retrasa y rebota respecto al personaje al saltar o balancearse (0 = pegado).
  Gira desde su base, así que un sombrero se ladea al aterrizar y vuelve a su sitio.
- **Solo en estas expresiones**: si marcas alguna, el accesorio solo aparece con esas (por ejemplo, el sombrero
  solo con "Presumido"). Sin ninguna marcada sale en todas. Necesita estar *Puesto*.
- **Ajustar posición y tamaño**: mientras está activo, arrastra el accesorio en la vista previa para moverlo,
  usa la rueda del ratón para el tamaño y Shift + rueda para girarlo. Los deslizadores (horizontal, vertical,
  tamaño, giro), **Espejo** y **Restablecer** sirven para afinar. `Esc` o **Listo** terminan. El ajuste se guarda
  y se ve igual en OBS.

Para crear uno con IA sobre tu personaje: `python tools/cuervo_ia.py accesorio <nombre> "<descripción>" 3`.

### Cuervo gótico (avatar con gestos de alas)

`tools/cuervo_gotico.py` genera, a partir de una base aprobada, 3 posturas de alas, 6 expresiones y accesorios, y
`componer` deja la carpeta lista para **Importar carpeta** en `ia/cuervo_gotico/png/`. Puede generar con Cloudflare
o en tu propio PC con ComfyUI y el mismo modelo (FLUX.2 klein 4B), sin cuota: abre ComfyUI y usa `CORVID_MOTOR=local`.

## Atajos (funcionan aunque estés en el juego)

| Atajo por defecto  | Acción                         |
|--------------------|--------------------------------|
| `Ctrl+Shift+1…9`   | Las 9 primeras expresiones     |
| `Ctrl+Shift+M`     | Silenciar / activar micrófono  |
| `Ctrl+Shift+H`     | Entrar / salir del modo captura |

Todas se pueden cambiar: haz clic en la tecla de una expresión (pestaña **Expresiones**) o en las de
silenciar y modo captura (pestaña **OBS**) y pulsa la combinación nueva. `Esc` cancela y `Supr` la quita.
Una tecla solo hace una cosa: si ya la usaba otra expresión, se le quita.

Mientras la app está abierta, Windows le entrega esas teclas solo a ella (el juego no las recibe).
Por eso conviene usar combinaciones con Ctrl/Alt/Shift, el teclado numérico o F13–F24 (ideal para Stream Deck).

## Streamer.bot (y cualquier programa que abra direcciones web)

En la pestaña **OBS → Streamer.bot**, elige qué quieres hacer y pulsa **Copiar**. En Streamer.bot:
crea una **Acción**, ponle un disparador (recompensa de puntos de canal, comando del chat, botón del Stream Deck…)
y añade la subacción **Core → Network → Fetch URL** con la dirección copiada.

| Dirección (añade `?clave=TU_CLAVE`)     | Qué hace                                  |
|-----------------------------------------|-------------------------------------------|
| `/api/expresion/Feliz`                  | Cambia a esa expresión (nombre o número)  |
| `/api/siguiente` · `/api/anterior`      | Recorre las expresiones                   |
| `/api/microfono/alternar`               | Silencia o activa el micro                |
| `/api/microfono/silenciar` · `activar`  | Fija el estado del micro                  |
| `/api/accesorio/Sombrero_vaquero/alternar` | Pone o quita un accesorio (`/poner`, `/quitar`) |
| `/api/expresiones`                      | Lista las expresiones y accesorios        |

En el nombre, los espacios se escriben con `_` (`/api/expresion/llorando_risa`); da igual mayúsculas o tildes.
Si cambias el nombre de una expresión, actualiza su dirección en Streamer.bot.

La clave se crea sola la primera vez (`api-key.txt` en la carpeta de datos). Sin ella el servidor no obedece,
así que ninguna web puede cambiar tu personaje. No la enseñes en directo; si se filtra, borra `api-key.txt`
y se creará otra al abrir la app.

## Movimiento

En **Animación**:
- **Rebote al hablar**: salta con gravedad real (altura y duración) y se **aplasta al caer**.
- **Balanceo en reposo**: un vaivén lateral suave con algo de giro, para que nunca esté del todo quieto.
- **Respiración** y **temblar al gritar**, como antes.

## Tamaño y posición

En **Animación → Tamaño y posición** puedes agrandar, mover o poner en espejo al personaje. Se aplica a la
vista de la app y a OBS a la vez.

## Ajustar el micrófono

- Usa **Calibrar** (pestaña Micrófono) y quédate en silencio 3 segundos: ajusta el umbral solo.
- En la barra de nivel, la línea morada es *hablar* y la rosa es *gritar*.
- Si la boca se queda abierta con el ruido del teclado, deja activado *Filtro de voz* (solo escucha la banda de la voz),
  sube el umbral o activa *Reducción de ruido*.
- *Mantener el grito* evita que la imagen de grito parpadee cuando gritas a trompicones.
- Si parpadea demasiado al hablar entrecortado, sube *Mantener la boca abierta*.

## Dónde se guarda todo

Tu configuración y las imágenes que subes van a `%APPDATA%\Corvid PNGtuber` (botón *Abrir carpeta de imágenes* en la pestaña OBS). Borrar esa carpeta deja la app como recién instalada.

La app guarda una copia de cada imagen que subes. Al abrirse, borra las copias que ya no usa ninguna expresión
(si llevan más de un día sin usarse); tus archivos originales no se tocan.

## Archivos del proyecto

```
main.js            Ventana, atajos globales, guardado y exportar
server.js          Servidor local: fuente de navegador de OBS y API para Streamer.bot
preload.js         Puente seguro entre la ventana y el sistema
avatar-export.js   Escribe la carpeta de "Exportar avatar"
renderer/
  index.html, styles.css
  avatar.js        Vista del avatar (app y OBS): fotogramas, accesorios y física
  obs.html, obs.js Página de la fuente de navegador
  core.js          Base: ajustes por defecto, estado, guardar, utilidades      ┐
  keys.js          Teclas y atajos globales                                    │ scripts que comparten
  audio.js         Micrófono y calibración                                     │ variables globales;
  loop.js          Bucle: qué fotograma y qué accesorios se ven               │ se cargan en este
  controls.js      Paneles de Micrófono y Animación                            │ orden desde index.html
  expressions.js   Expresiones                                                 │
  accessories.js   Accesorios y su editor                                      │
  import.js        Importar carpeta                                            │
  app.js           Barra rápida, OBS/Streamer.bot e inicio (va el último)      ┘
assets/raven/      El cuervo de ejemplo (SVG)
tools/             generar_cuervo.py, cuervo_ia.py (cuervo con IA) y las pruebas
ia/png/            El avatar final del cuervo generado con IA (listo para "Importar carpeta")
```

Para modificar el cuervo de ejemplo, edita colores o formas en `tools/generar_cuervo.py` y ejecuta `python tools/generar_cuervo.py`.

## Pruebas

```
npm test
```

Ejecuta tres grupos: el servidor (páginas, seguridad, API), "Exportar avatar", y la ventana de la app
(se abre oculta con un puente de pruebas: teclas, fotogramas, accesorios, importar, física, migración…).
Sale con error si algo falla. Conviene pasarlas antes de cada `npm run dist`.
