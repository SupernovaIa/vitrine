# vitrine

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

**Qué imagen buscar:** desde 600×900 va sobrado (el mayor tamaño en que se
muestra es 300px en la ficha, y eso cubre pantallas 3x). El ratio da igual: se
recorta a 2:3, que es lo que mantiene la rejilla uniforme.

Astro las convierte a AVIF/WebP con `width`/`height` en el HTML, así que no hay
saltos de layout. Todas se normalizan a 2:3.

Sin portada no se rompe nada: se dibuja una tarjeta tipográfica con el título, la
autoría y el año, y ocupa exactamente el mismo hueco que una portada real.

### Cómo se elige el `accent`

No es el color dominante de la imagen. En un póster el color más frecuente es el
negro del fondo (`#080808` en Hollow Knight), y saturar un gris **se inventa un
tono** — con eso, una portada azul salía roja.

Lo que hace el script es muestrear la imagen pequeña, descartar los píxeles
demasiado oscuros, claros o grises para tener tono fiable, y quedarse con el
grupo de tono que más peso cromático acumula. En Hollow Knight da `#1d78b9`, que
es el cian que cualquiera nombraría al mirar la portada. Si la imagen es
monocroma de verdad, no escribe `accent` y la entrada usa el color de su medio.

Sin portada no se rompe nada: se dibuja una tarjeta tipográfica con el título,
la autoría y el año. Es un estado previsto, no un error — con los libros va a
pasar a menudo.

## Privacidad

`visibility: private` saca la entrada del sitio **en tiempo de build**: no queda
oculta con CSS, no está en el HTML desplegado. El filtro vive en `allItems()`
(`src/lib/media.ts`), que es la única puerta al contenido, para que una página
nueva no pueda filtrar una entrada privada por olvidarse de comprobarlo.

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
scripts/add-cover.mjs   coloca una portada y le extrae el color de acento
scripts/import-notion.mjs  regenera las entradas desde el export de Notion
scripts/shot.mjs        capturas a un viewport real, sobre CDP
```

Los tokens siguen el mismo contrato semántico que `cheatsheets`: un hex fuera de
`theme.css` es un bug.

## Pendiente

- **Portadas.** 1 de 73 (Hollow Knight). El resto se dibuja como tarjeta
  tipográfica. Lo que más rinde es empezar por los 10 de Tier S, que salen
  grandes en la portada.
- **Fechas.** Notion no guardaba ninguna, así que la estantería se ordena por
  estado y tier. Con `finished` relleno se puede ordenar cronológicamente y sacar
  estadísticas por año (`shelfOrder` en `src/lib/media.ts`).
- **Reseñas.** El cuerpo de las 73 entradas está vacío.
- Ingesta desde APIs (TMDB / IGDB / Open Library) si meter las cosas a mano cansa.
- Extraer `accent` de la portada en el build en vez de a mano.
