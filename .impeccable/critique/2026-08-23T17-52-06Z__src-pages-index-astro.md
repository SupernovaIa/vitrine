---
target: portada y fichas de vitrine
total_score: 15
max_score: 36
na_heuristics: 10
p0_count: 3
p1_count: 2
timestamp: 2026-08-23T17-52-06Z
slug: src-pages-index-astro
---
Method: dual-agent (A: design review · B: detector + browser evidence), run isolated and in parallel.

## Design Health Score

| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 2/4 | El contador pasa de 73 a 17 sin `aria-live` ni transición; la fila Tier S ignora el filtro, así que puede leerse "0 de 73" con diez tarjetas S encima. |
| 2 | Correspondencia con el mundo real | 2/4 | `EN FÍSICO: Sí` es el dato más prominente en un libro tier S: lenguaje de inventario, no de recomendación. `PELÍCULAS 25 de 26` no dice que 25 signifique *terminadas*, y `JUEGOS 8` pierde el "de N", rompiendo la forma de las tres celdas anteriores. |
| 3 | Control y libertad | 1/4 | El filtro no vive en la URL: no se puede compartir una vista filtrada y volver atrás desde una ficha resetea las 73. El estado vacío no ofrece "quitar filtros". |
| 4 | Consistencia y estándares | 2/4 | Colisión de paletas medio/tier (§ Especificidad). Solo 1 de 73 tarjetas tiene pie, así que la única con portada real es la que desencaja. Pendiente se atenúa en la estantería pero no en su propia ficha. Falta el gemelo `:focus-visible` de la regla `:hover` de tarjetas pendientes. |
| 5 | Prevención de errores | 1/4 | 7 de 25 combinaciones de filtro devuelven cero, y 6 más devuelven 1–2. Los chips nunca se desactivan ni muestran recuento, y los de estado se construyen desde disponibilidad *global*, así que anuncian combinaciones imposibles. |
| 6 | Reconocer antes que recordar | 1/4 | La letra del tier nunca se descodifica en la estantería: el significado vive en un `title`. Cuatro glifos abstractos cargan la identidad de medio sin leyenda fuera de la fila de filtros. |
| 7 | Flexibilidad y eficiencia | 1/4 | Sin buscador sobre 73 entradas, sin orden configurable, **sin filtro por tier**, sin skip link. 22 tabulaciones hasta la primera tarjeta. |
| 8 | Diseño estético y minimalista | 2/4 | La contención del cromo es real, pero la portada duplica sus diez tarjetas más importantes, y el estado pendiente se señala tres veces por tarjeta. |
| 9 | Recuperación de errores | 1/4 | "Nada con esos filtros." en serif sutil, sin acción, sin indicar qué chip lo causó, sin anuncio a tecnología asistiva. |
| 10 | Ayuda y documentación | n/a | Superficie Experience sin tareas que fallar; la carencia de leyenda ya se cuenta en la 6. |
| **Total** | | **15/36** | **Necesita trabajo estructural** |

Ajusté una nota de A: subí "Consistencia" de 1 a 2, porque B demostró que el manejo de foco está genuinamente bien construido (indicadores reales, contraste no textual aprobando entre 4.16:1 y 8.10:1, bloque `prefers-reduced-motion` presente) y la geometría de la rejilla es impecable. La colisión de paletas la mantiene lejos de un 3.

## Veredicto de especificidad

**Medio autorado. La tarjeta es específica; la página es genérica.**

Hay autoría real e intransferible en exactamente un sitio: la portada tipográfica de reserva. Anclar el bloque inferior en absoluto para que un autor ausente no desplace el título, `container-type: inline-size` para que el tipo escale al tile, cinco líneas de recorte porque "Cómo hacer amigos e influir en las personas" tiene que caber — eso es alguien que mirό *estos* datos y resolvió *este* problema.

Lo que la rodea es una rejilla de medios genérica. Quita los cuatro glifos y el texto en español y esto es un clon de Letterboxd, un listado de e-commerce, una fila de Netflix.

Lo más grave: **el mecanismo del producto no tiene diseño.** PRODUCT.md dice "el veredicto es el contenido". En pantalla el tier es una letra de 20px en una esquina y una clave de ordenación. No se puede filtrar por tier. No se ve dónde acaba S y empieza A: la estantería es un muro indiferenciado de 73 donde la insignia cambia de S a A a mitad de fila. Las dos facetas que sí existen (medio y estado) son las dos que trae cualquier catálogo. **El único eje que nadie más tiene es el único sin control.**

Y la paleta se contradice, verificado byte a byte en `theme.css`: `--medium-films` ≡ `--tier-a` ≡ `#5b8ef0`, `--medium-series` ≡ `--tier-s` ≡ `#b57bff`, `--medium-books` ≡ `--tier-c` ≡ `#e0964e`, `--medium-games` ≡ `--tier-b` ≡ `#3fb3a0`. Dos dimensiones ortogonales comparten paleta en la misma tarjeta al mismo tiempo.

### Escaneo determinista: el detector estaba ciego

El detector devolvió `[]` con código de salida 0, y **eso no es un aprobado**. Los cuatro módulos del parser (`htmlparser2`, `css-select`, `css-tree`, `domutils`) están ausentes, así que cayó a coincidencia por expresiones regulares, donde *las custom properties no se evalúan*. El sistema de color de este proyecto es enteramente custom properties: las reglas de contraste y paleta no tenían nada que mirar. Peor: con ficheros `.astro` no imprime el aviso de degradación, así que undercuenta en silencio.

El overlay en navegador encontró **229 hallazgos** en las mismas 4 páginas que el escaneo estático llamó limpias.

### Overlays visibles

La inyección funcionó (mutación verificada, no solo evaluación de lectura) y el overlay se renderizó sobre la página real en las cuatro rutas. El servidor local se paró al terminar y la pestaña se cerró.

Del recuento de 203 en la portada, la mayor parte es inflación: `undersized-ui-text` dispara 165 veces pero son **3 causas distintas**, no 165 problemas. Y 30 hallazgos de `ai-color-palette` son falsos positivos: acusan de "texto neón" a los glifos decorativos con `aria-hidden="true"` — precisamente la regla que `theme.css` ya codifica ("son marcas, no colores de tipografía").

## Impresión general

La artesanía está concentrada en el sitio equivocado. Hay ingeniería de diseño de primer nivel en cómo se comporta una tarjeta —física de layout resuelta, ratio inviolable, 0 títulos cortados en 73— y prácticamente ninguna en qué *dice* la página. El resultado es un archivo que se ve ordenado y no consigue transmitir una sola opinión.

La mayor oportunidad no es arreglar defectos: es que **la lista de tiers deje de ser una fila y se convierta en la página**. Es lo único que se puede construir bien con cero reseñas y una portada.

## Lo que funciona

**1. La portada tipográfica de reserva es un logro de diseño real.** Funciona porque resuelve la física del layout en vez de taparla: los hijos posicionados en absoluto no aportan altura intrínseca, así que `aspect-ratio` siempre gana y un título de cuatro líneas no puede estirar un tile; `container-type` escala el tipo al tile; el bloque inferior anclado abajo hace que un `by` o un `year` ausentes no muevan el título. Verificado: **0 títulos cortados** en las 73. Y Newsreader hace que una portada ausente se lea como *portadilla*, no como hueco.

**2. Normalización de ratio entre cuatro medios incompatibles.** Medido: la foto de Hollow Knight y sus 72 vecinas tipográficas ocupan cajas idénticas. Aceptar un recorte del 10% en arte de videojuego para comprar una rejilla que cuadra es el intercambio correcto, y es la razón de que el estado mixto se lea como *deliberado* y no como *inacabado*.

**3. El manejo de foco, que B verificó a fondo.** Anillo del color del propio ítem, `outline` reubicado en el póster interior en vez de suprimido, contraste no textual aprobando en los cinco acentos, y un bloque `prefers-reduced-motion`. Esto suele estar roto y aquí no lo está.

## Problemas prioritarios

### P0 — La píldora `PENDIENTE` tapa el texto de 17 de 73 tarjetas (23% de la estantería)

**Qué.** La píldora está posicionada en absoluto sobre el póster con fondo opaco, y el bloque de texto de la portada también. Solapamiento medido en cada tarjeta pendiente: **86 × 16px**. El año queda **100% oculto en 10 tarjetas**, y en 7 la píldora cubre 16 de los 20px de la línea de título: `1984`, `Tus zonas erróneas`, `Agujeros negros y tiempo curvo`, `Mujeres de ciencia`, `17 ecuaciones que cambiaron el mundo`, `Por qué los girasoles se marchitan`, `7 hábitos de la gente altamente efectiva`.

**Por qué importa.** El título es el único contenido de 72 de 73 tarjetas. Esto destruye la identidad del ítem en casi un cuarto de la estantería y hace que la rejilla entera parezca rota — fatal para el principio 3 de PRODUCT.md ("toda superficie debe leerse como terminada mientras los datos están parciales"). Además cae sobre el bloque contiguo más grande de la página.

**Arreglo.** Borrar la píldora. Pendiente ya está codificado dos veces (opacidad 0.52 + insignia de tier ausente); la píldora solo añade colisión. Si el estado tiene que nombrarse en el tile, meterlo *dentro* del bloque inferior como una cuarta fila, para que participe del mismo apilado anclado.

**Comando:** `$impeccable polish`

### P0 — El texto de la estantería se renderiza a 8,5px en 136 elementos

**Qué.** `font-size: clamp(8.5px, 5.5cqw, var(--text-mono-xs))` con `container-type: inline-size`. En la estantería la columna mide 150px, y 5,5cqw de 150px = **8,25px**, por debajo del suelo, así que 136 elementos renderizan al mínimo duro de **8,5px**: autor y año de todas las tarjetas.

**Por qué importa.** No es un fallo de contraste, es un suelo de legibilidad por debajo de cualquier mínimo corriente, y está *escrito a mano*, no emergido por accidente. Y afecta al único contenido que llevan 72 de 73 tarjetas. Lo escribí yo para que los títulos largos cupieran; funcionó para el título y arrastró consigo el autor y el año.

**Arreglo.** Desacoplar los dos: el título puede seguir escalando con el contenedor, pero autor y año deben tener un mínimo absoluto de 11px y perder el `cqw`. Si a 11px no caben, la columna es demasiado estrecha y el mínimo de la rejilla debe subir.

**Comando:** `$impeccable typeset`

### P0 — La fila Tier S es un duplicado exacto de las 10 primeras de la estantería

**Qué.** Verificado por mí, no solo por los agentes: los 10 `href` de la fila son los mismos 10, **en el mismo orden**, que los de la estantería (`/games/silksong/`, `/films/oppenheimer/`, `/series/gambito-de-dama/`…). Es consecuencia de que `canon()` filtre `tier === "S"` mientras `shelfOrder` ordena por estado y luego por tier, lo que pone esos mismos diez primeros. Los dos bloques están a ~700px.

**Por qué importa.** Quema los primeros 1546px de scroll en contenido que se va a repetir, hace que un archivo de 73 parezca de 63, y desperdicia el activo más fuerte del producto. "Las diez cosas que marcaron a esta persona" es la afirmación de posicionamiento; presentarla como anticipo de una lista que luego se repite reduce un canon a un carrusel.

**Arreglo.** Excluir los tier S de la estantería, y convertir la fila en un *destino*: los tiles más grandes de la página, numerados del 1 al 10.

**Comando:** `$impeccable layout`

### P1 — La paleta de medios y la de tiers son los mismos cuatro colores

**Qué.** Cuatro de cuatro acentos de medio son byte a byte idénticos a cuatro de los cinco colores de tier.

**Por qué importa.** Los dos códigos aparecen en el mismo tile de 154px a la vez: tinte y glifo para el medio, insignia para el tier. Una serie en S es monocroma morada y se lee como un sistema coherente; una serie en A es un tile morado con insignia azul y se lee como ruido. Ninguno de los dos códigos llega a aprenderse. Y bloquea el arreglo de la planitud de la estantería: no puedes reforzar la expresión del tier mientras sus tonos significan "medio" en otro sitio.

**Arreglo.** Separar las dimensiones por **canal**, no por tono. Los cuatro acentos de medio se quedan con el color (ya cargan el tinte, el glifo, los chips, el glow y el baño). El tier se re-expresa sin tono: una sola rampa, de S a pleno contraste bajando por peso y opacidad hasta un contorno de un pelo en D. La escala es ordinal, y una escala ordinal quiere una rampa; cinco tonos sin relación nunca comunicaron rango.

**Comando:** `$impeccable colorize`

### P1 — Las fichas son callejones sin salida

**Qué.** Medido en `/series/better-call-saul/`: 18 palabras de contenido, columna de 892px, y `main` contiene exactamente **un** enlace, `/`. La misma forma en las 73. En las 72 con portada de reserva, el título, el autor y el año se imprimen **dos veces**, en dos tipografías, a 200px de distancia.

**Por qué importa.** El éxito está definido como "salir con algo que quieras consumir", y la ficha es donde se toma esa decisión. Ahora ofrece cero caminos: ni "siguiente en Tier S", ni "otros juegos", ni "más de Team Cherry". Te devuelve al inicio de un muro de 73 con los filtros reseteados en silencio.

**Arreglo.** Dos cambios, ambos inmunes al estado sin datos. (a) En las fichas de reserva, suprimir el bloque de título/autor/año de la portada cuando esos valores ya están en la cabecera: el panel tintado y el glifo bastan. (b) Una tira de 4–6 tarjetas hermanas al pie, poblada **por regla**: otros del mismo tier, luego otros del mismo medio. Reutiliza `ItemCard`, sin componente nuevo y sin coste por entrada — que es el principio 6.

**Comando:** `$impeccable layout`

### Siguientes en la lista (P2)

- **Los filtros son un generador de callejones sin salida.** 7 de 25 combinaciones devuelven cero; los chips no llevan recuento ni se desactivan, y los de estado se construyen desde disponibilidad global, así que ofrecen `Juegos + Pendiente`, que no existe. Falta `aria-live` en el contador y estado en la URL. → `$impeccable harden`
- **Los 10 chips miden 34px y 29,5px de alto**, y no crecen en móvil, que es donde importa. Todos por debajo de 44×44. → `$impeccable adapt`
- **Regresión de contraste que yo introduje.** `--fg-subtle: #767d8d` mide **4,46:1** sobre `--surface`, fallando en 5 etiquetas de la franja de estadísticas. Y es trazable: copié el contrato de tokens de `cheatsheets`, donde ese mismo token vale `#868c9c` con el comentario *"Lifted to 4.6:1 on the surface, where it was 3.6:1"*. Copié el sistema y **reintroduje exactamente el bug que ese sistema ya había arreglado**. → `$impeccable audit`

## Banderas rojas por persona

**El desconocido curioso** (llega de un enlace, da 30 segundos, no sabe quién eres). No ve contenido en el primer viewport: la primera tarjeta está a y=1546 en una página de 5,8 pantallas. No puede leer las estadísticas: `PELÍCULAS 25 de 26` — ¿25 de qué? Se encuentra un muro de rectángulos oscuros donde el tinte que separa cine de libros es invisible a distancia de escaneo. Y el único clic motivado lo traiciona: Tier S → Better Call Saul → 18 palabras. **Se va sin nada**, porque no hay una sola frase de opinión en todo el sitio y el diseño no tiene hueco que sobreviva al estado sin reseñas.

**El cazador de recomendaciones** (quiere una cosa para esta noche). No puede filtrar por lo único que le importa: el tier no tiene control. Choca rápido con "Nada con esos filtros" sin que ningún recuento le avisara. Pelea con el orden, que prioriza *si tú lo terminaste*. Pierde el sitio en cada clic porque no hay estado en la URL. Y no puede comparar candidatos: tiene que decidir a partir de una letra.

**El visitante de teclado y lector de pantalla.** 22 tabulaciones hasta la estantería, 95 para salir, sin skip link. El filtrado es **silencioso**: `aria-pressed` cambia pero el contador no tiene `aria-live`, así que 73 ítems desaparecen sin una palabra. El tier se anuncia como letra desnuda: el nombre accesible de una tarjeta es "TEAM CHERRY Silksong 2025 S" — el sistema entero de veredictos llega como un carácter sin explicar. Y la única tarjeta con arte real es la peor nombrada: dice "Hollow Knight" dos veces dentro de un enlace.

## Observaciones menores

- **Tres funciones de la tarjeta son código muerto con los datos reales:** barras de progreso renderizadas = 0, insignias de "por decidir" = 0, pies = 1. La tarjeta se diseñó para un estado de datos que no existe.
- **El pie único es un defecto, no una función.** Solo Hollow Knight lo tiene, así que su tarjeta es ~44px más alta y abre un hueco visible en la primera fila. La tarjeta con arte real —la aspiración— es la que se ve mal.
- **La portada de Hollow Knight se sirve a 0,57× de la resolución que ya tiene en disco.** El fichero es 600×900, se decodifica a 340×510 y se pinta a 300×450: en pantalla de densidad 2 hace falta 600×900. Es configuración de `widths`/`sizes`, no falta de material.
- **`.card__sep` y `.card__dim` usan `--border-strong`**, que mide **1,57:1**. Hoy es inalcanzable, pero enviará texto invisible en cuanto exista un ítem en curso con progreso.
- **`--tracking-kicker: 0.22em` sobre 10,5px** está pasado del suelo de legibilidad, y se usa en casi toda la tipografía pequeña de la interfaz.
- **`.wash` es prácticamente invisible**: el comentario del código la llama "la razón entera de que `accent` esté en el esquema", y el render no lo cumple.
- **`color-scheme: dark` sin tema claro**, en un proyecto cuyo compromiso de marca es un contrato de tokens *tematizable*. La capa semántica existe; solo se escribió un tema.
- **Seis literales de color fuera de `theme.css`**, que el propio contrato declara bug. (A contó siete; el séptimo es un `#000` en una `mask-image`, que no es color de interfaz y no cuenta.)
- **"73 de 73"** en la cabecera de la estantería es una tautología hasta que filtras.
- Sin skip link en ninguna página. Consola limpia: 0 errores y 0 avisos en las cuatro rutas.

## Preguntas para pensar

1. **¿Y si la ficha es la unidad equivocada y la lista de tiers es el artefacto?** Lo único que se puede construir bien con cero reseñas y una portada es la clasificación misma. ¿Y si `/` *fuera* la lista de tiers —S a D en bandas tituladas— y la estantería fuese la vista secundaria de "todo lo demás"?
2. **Tienes 73 veredictos y 0 reseñas. ¿Y si el veredicto pudiera ser el texto?** Una frase de 15 palabras por entrada es barata (principio 6) y atacaría a la vez la planitud del muro y el vacío de la ficha. ¿Haría más eso que las reseñas que aún no existen?
3. **¿La portada ausente es un problema o es la identidad?** El tile de reserva es lo mejor construido del repo; la única foto real es la tarjeta que rompe la rejilla, necesita un pie que nadie más tiene y tartamudea contra su propio H1. ¿Y si vitrine se comprometiera a ser una estantería *tipográfica* y se borrara el pipeline de portadas? Convertiría tu tarea manual más lenta en una posición de diseño.
4. **¿Para qué te libera no tener fechas?** Todo tracker del mundo es una línea temporal. Un canon no es cronológico, es comparativo. Si nada puede ordenarse por cuándo, ¿no es más fácil construir la vista que Letterboxd no puede: cuatro medios adyacentes, clasificados unos contra otros?
