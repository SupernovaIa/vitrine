# vitrine

**https://vitrine-nine-self.vercel.app**

Registro personal de películas, series, libros y videojuegos. Web pública de
lectura, escritura solo desde el repo: no hay backend, ni base de datos, ni login.

Cada entrada es un fichero Markdown. `git` es el almacenamiento, el historial y
la copia de seguridad.

Las 73 entradas iniciales vienen de las cuatro bases de datos de Notion
(`scripts/notion-export.json` + `scripts/import-notion.mjs`).

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
  cover-overrides.json   portadas elegidas a mano, cuando el escaneo no vale
  lookup-metadata.mjs    datos de la obra desde Wikidata; no escribe nada
  lookup-books.mjs       lo mismo desde Open Library
  apply-metadata.mjs     aplica un resultado ya revisado, sin sobreescribir
  title-overrides.json   el identificador cuando el título no basta (o un QID)
  import-notion.mjs      regenera las entradas desde el export de Notion
  shot.mjs               capturas a un viewport real, sobre CDP
```

Los tokens siguen el mismo contrato semántico que `cheatsheets`: un hex fuera de
`theme.css` es un bug.

## Pendiente

- **Portadas.** 32 de 73: libros 21/24, series 5/15, películas 3/26, juegos 3/8.
  Los diez de Tier S ya están. Los libros los resuelve `fetch-book-covers.mjs`
  contra Open Library; para cine, series y juegos **no hay fuente sin clave**, y
  merece la pena saber por qué antes de volver a intentarlo: `pageimages` de
  Wikipedia se salta los ficheros *non-free* y todos los pósters lo son (pedir
  Interstellar o Titanic devuelve nada; Breaking Bad devuelve su logotipo
  apaisado), la cuota anónima de Google Books está agotada, e iTunes ya no
  responde a `media=movie`. Con una clave de TMDB se cerrarían las 38 de cine y
  series de una tirada.
- **Fechas.** Notion no guardaba ninguna, así que la estantería se ordena por
  estado y tier. Con `finished` relleno se puede ordenar cronológicamente y sacar
  estadísticas por año (`shelfOrder` en `src/lib/media.ts`).
- **Reseñas.** El cuerpo de las 73 entradas está vacío.
- **`episodes` no se pinta en ningún sitio.** Están rellenos 14 de 15, y ni
  `metaLine` ni la tabla de datos los muestran: la ficha de una serie enseña
  temporadas y se queda ahí. O se pinta el campo, o ese relleno no sirve.
- Ingesta desde APIs (TMDB / IGDB) si meter las cosas a mano cansa.
