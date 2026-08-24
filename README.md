# vitrine

**https://vitrine-supernovaias-projects.vercel.app**

Registro personal de películas, series, libros y videojuegos. Web pública de
lectura, escritura solo desde el repo: no hay backend, ni base de datos, ni login.

Cada entrada es un fichero Markdown. `git` es el almacenamiento, el historial y
la copia de seguridad.

Las 73 entradas iniciales vienen de las cuatro bases de datos de Notion
(`scripts/notion-export.json` + `scripts/import-notion.mjs`). **Ese import se
hizo una vez y no se repite.** El export guarda los títulos tal como estaban en
Notion, dos de ellos mal (*Tregua*, *The Cult of the Lamb*), así que reejecutarlo
pisaría las correcciones. Se conserva como registro de lo que había, no como algo
que se vuelva a correr.

## Arrancar

```sh
pnpm install
pnpm dev      # http://localhost:4321
pnpm check    # tipos + validación del esquema
pnpm build
```

## Añadir algo

Crea un `.md` en la colección que toque (`films`, `series`, `books`, `games`).
El nombre del fichero es la URL.

```md
---
title: "Hollow Knight"
year: 2017                    # opcional
by: "Team Cherry"             # dirección / autoría / estudio — opcional
status: done                  # pending | active | done | dropped
tier: S                       # S | A | B | C | D — omítelo si no lo has decidido
platforms: ["PC", "Switch"]   # juegos: varias a la vez
hours: 41
completion: "story+extras"    # story | story+extras | full
genre: "Metroidvania"         # la clasificación principal, una sola
tags: ["indie"]               # las demás, tantas como quieras
finished: 2024-11-04
revisits: 1                   # 0 = una sola vez
accent: "#4a6f9c"             # color dominante de la portada
hook: "Una línea sin spoilers."
cover: ./hollow-knight.jpg    # opcional, junto al .md
quotes:
  - "Una cita que merezca guardarse."
---

La reseña, en Markdown. Tan larga o tan corta como quieras.
```

Campos por medio, además del tronco común: `runtime` (películas);
`seasons`, `episodes`, `at: [temporada, episodio]`, `episodesSeen` (series);
`pages`, `pagesRead`, `physical` (libros); `platforms`, `hours`, `completion`
(juegos).

### Cuatro decisiones de modelado

Vienen del esquema de Notion, y cada una se separa de él a propósito:

1. **Cuatro estados, no seis.** `Pendiente` y `Sin empezar` eran lo mismo,
   separados solo porque las cuatro bases se crearon aparte. `De nuevo` mezclaba
   un estado con una cuenta: ahora es `revisits`.
2. **`tier` sin "Por decidir".** No es un valor de la escala, es su ausencia. Una
   entrada terminada sin `tier` se muestra como "por decidir", derivado en vez de
   guardado, así que los dos no pueden desincronizarse.
3. **No hay `canon`.** Tier S ya significa "imprescindible", y dos campos para
   una idea acaban discrepando.
4. **`platforms` es una lista.** Hollow Knight está en PC *y* en Switch.

El esquema completo, con el porqué de cada decisión, está en
`src/content.config.ts`. Si un campo falta o tiene el tipo mal, **el build
falla** — la validación ocurre antes de desplegar, no después.

## Portadas

Una por entrada, con el script:

```sh
node scripts/add-cover.mjs games hollow-knight ~/Downloads/hk.png
```

Hace tres cosas: normaliza la imagen (máximo 900px de ancho, JPEG de calidad 88 —
800 KB de PNG salen a ~93 KB sin pérdida visible), le saca el color de acento, y
escribe `cover:` y `accent:` en el frontmatter. No hace falta tocar el `.md` a
mano; de hecho no añadas `cover:` antes de que exista la imagen, porque el
esquema la valida en build y el build fallará.

Cine y series van en bloque, sin clave de ninguna API:

```sh
node scripts/fetch-tmdb-covers.mjs            # dice qué obra empareja con cada entrada
node scripts/fetch-tmdb-covers.mjs --apply    # y entonces las coloca
```

Wikidata guarda el propio id de TMDB (`P4947` cine, `P4983` series) y
`image.tmdb.org` sirve las imágenes sin autenticación: lo que pide clave es la
*API*, no la CDN. Así que la identidad sale de Wikidata —consultable, y con
fecha de publicación para desempatar los cuatro *Titanic*— y del HTML de la
ficha pública sale solo la ruta del póster. El reparto es deliberado: la mitad
frágil (raspar marcado) no decide nada, solo acarrea un nombre de fichero.

Cuando la etiqueta exacta no casa —Notion escribió los títulos en minúscula de
frase, y `rdfs:label` distingue mayúsculas; y *El indomable Will Hunting* es un
alias, no una etiqueta— hay una segunda pasada por `wbsearchentities`, que ignora
las mayúsculas y lee alias. Sus resultados vuelven a pasar por el mismo SPARQL
que exige id de TMDB y fecha, porque también devuelve libros y canciones con esas
palabras.

**Repasa siempre la salida en seco antes de `--apply`.** El año de la entrada
descarta al candidato que no cuadra, y ahí se ve: `super-mario-bros` emparejaba
con la de imagen real de 1993 teniendo `year: 2023`. Cuando ningún título
desempata, `title-overrides.json` acepta un Q-número que pina el ítem.

Los juegos, igual, pero necesitan dos tiendas porque ninguna cubre la
estantería sola:

```sh
node scripts/fetch-game-covers.mjs --apply
```

**Steam** para lo que tenga AppID (`P1733` en Wikidata): `library_600x900_2x.jpg`
mide exactamente 600×900, que es el 2:3 al que recorta la rejilla. **El eShop
europeo** para el resto, que son exclusivos de Switch sin AppID que buscar; su
búsqueda es abierta, responde en español, y de las tres imágenes que trae cada
ficha hay que quedarse con `image_url` **solo si es el packshot** —la caja
física, 500×809—: Nintendo lo está retirando en las fichas digitales y ahí sirve
el cuadrado en su lugar, que recortado a 2:3 destroza el arte.

`Leyendas Pokémon: Arceus` es justo ese caso, en los cinco idiomas del eShop, y
su caja está puesta a mano con `add-cover.mjs`.

Si el color que saca no es el que domina la portada, `--accent "#5ab5c1"` lo
fija a mano. Pasa cuando el campo es oscuro y lo vivo es minoritario: *El
universo elegante* es negro con una nebulosa teal y naranja, y el script
respondió con un marrón, porque los filamentos naranjas son más numerosos pero
están a luminosidad 0.26 frente al 0.53 del núcleo teal.

**Qué imagen buscar:** desde 600×900 va sobrado (el mayor tamaño en que se
muestra es 300px en la ficha, y eso cubre pantallas 3x). El ratio da igual: se
recorta a 2:3, que es lo que mantiene la rejilla uniforme.

Astro las convierte a AVIF/WebP con `width`/`height` en el HTML, así que no hay
saltos de layout. Todas se normalizan a 2:3.

Sin portada no se rompe nada: se dibuja una tarjeta tipográfica con el título, la
autoría y el año, y ocupa exactamente el mismo hueco que una portada real.

**Sobre una portada el pie es solo el año.** No rotula el título ni la autoría,
porque la portada ya los lleva impresos: un póster de cine los pone en una franja
fina abajo y una superposición los libra, pero una sobrecubierta los pone en el
centro, y *Pensar rápido, pensar despacio* imprimía DANIEL KAHNEMAN debajo de
nuestro propio DANIEL KAHNEMAN, solapados.

### Cómo se elige el `accent`

No es el color dominante de la imagen. En un póster el color más frecuente es el
negro del fondo (`#080808` en Hollow Knight), y saturar un gris **se inventa un
tono** — con eso, una portada azul salía roja.

Lo que hace el script es muestrear la imagen pequeña, descartar los píxeles
demasiado oscuros, claros o grises para tener tono fiable, y quedarse con el
grupo de tono que más peso cromático acumula. En Hollow Knight da `#1d78b9`, que
es el cian que cualquiera nombraría al mirar la portada. Si la imagen es
monocroma de verdad, no escribe `accent` y la entrada usa el color de su medio.

## Privacidad

**Este repositorio es público, así que aquí no va nada que no pueda leer
cualquiera.** Incluido el historial de git: borrar algo después no lo borra de
los commits anteriores.

`visibility: private` sigue haciendo lo que dice, pero conviene entender qué es
exactamente: saca la entrada del sitio **en tiempo de build**, así que no está en
el HTML desplegado ni oculta con CSS. Lo que *no* hace, con el repo público, es
esconder el `.md` — ese se lee entrando al repo. Significa "no en la web", no "no
público".

El filtro vive en `allItems()` (`src/lib/media.ts`), que es la única puerta al
contenido, para que una página nueva no pueda colar una entrada marcada como
privada por olvidarse de comprobarlo.

Si alguna vez quieres una entrada de verdad privada, no puede vivir en este
repositorio.

## Estructura

```
src/
  content.config.ts     esquema Zod: tronco común + campos por medio
  content/{films,series,books,games}/*.md
  lib/media.ts          vocabulario de cada medio, progreso, estadísticas
  components/           Cover, ItemCard, Filters, StatStrip
  pages/
    index.astro         estantería + "ahora mismo" + filtros
    [medium]/[slug].astro
  styles/               base.css (escala) + theme.css (color y tipografía)
scripts/
  add-cover.mjs         coloca una portada y le extrae el color de acento
  fetch-book-covers.mjs  sobrecubiertas desde Open Library (solo libros)
  fetch-tmdb-covers.mjs  pósters de cine y series, vía Wikidata + TMDB, sin clave
  fetch-game-covers.mjs  cajas de juegos, vía Steam y el eShop europeo, sin clave
  cover-overrides.json   portadas elegidas a mano, cuando el escaneo no vale
  lookup-metadata.mjs    datos de la obra desde Wikidata; no escribe nada
  lookup-books.mjs       lo mismo desde Open Library
  apply-metadata.mjs     aplica un resultado ya revisado, sin sobreescribir
  title-overrides.json   el identificador cuando el título no basta (o un QID)
  import-notion.mjs      el import inicial, hecho una vez — no reejecutar
  shot.mjs               capturas a un viewport real, sobre CDP
```

Los tokens siguen el mismo contrato semántico que `cheatsheets`: un hex fuera de
`theme.css` es un bug.

## Pendiente

- **Portadas.** 70 de 73. Cine, series y juegos están al 100%. Quedan **3
  libros** cuyo mejor escaneo en Open Library no llega al mínimo: *La tregua*
  (246×404), *Tus zonas erróneas* (128×196) y *Cómo hacer amigos e influir en
  las personas*, ya descartado a mano en `cover-overrides.json`. Los tres se
  cierran con `add-cover.mjs` en cuanto aparezca una imagen; no queda nada
  automático por intentar.

  Lo que **no** funciona, comprobado y no supuesto: iTunes Search responde
  `resultCount: 0` a `media=movie` y `media=tvShow`; la cuota anónima de Google
  Books está agotada; y los pósters *non-free* de Wikipedia sí se listan con
  `prop=images` —era solo `pageimages` quien los saltaba— pero el uso legítimo
  los limita a unos 275×362, por debajo del suelo utilizable.
- **Fechas.** Notion no guardaba ninguna, así que la estantería se ordena por
  estado y tier. Con `finished` relleno se puede ordenar cronológicamente y sacar
  estadísticas por año (`shelfOrder` en `src/lib/media.ts`).
- **Reseñas.** El cuerpo de las 73 entradas está vacío.
- **`episodes` no se pinta en ningún sitio.** Están rellenos 14 de 15, y ni
  `metaLine` ni la tabla de datos los muestran: la ficha de una serie enseña
  temporadas y se queda ahí. O se pinta el campo, o ese relleno no sirve.
- Ingesta desde APIs (TMDB / IGDB) si meter las cosas a mano cansa.
