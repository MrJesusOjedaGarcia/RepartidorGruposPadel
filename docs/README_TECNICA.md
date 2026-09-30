# Documentación técnica — Repartidor

## Descripción

PWA de una sola página para organizar partidos de pádel, generar jornadas, registrar resultados y consultar/exportar una clasificación. La interfaz está escrita en Vue 3 con TypeScript y se sirve con Vite. No requiere una API: la información permanece en el navegador.

## Tecnologías y estructura

- **Vue 3 + Composition API:** estado y vistas reactivas en `src/App.vue`.
- **TypeScript:** tipos de jugadores, partidos, jornadas y formato en `src/domain/scheduler.ts`.
- **Vite:** servidor de desarrollo y compilación estática.
- **vite-plugin-pwa / Workbox:** manifiesto y service worker para instalación y acceso sin conexión después de la primera carga.
- **Responsive móvil/tablet:** CSS por anchos/orientación, `viewport-fit=cover`, insets `safe-area-inset-*` y soporte de altura dinámica para Safari iOS/Chrome Android.
- **Web Storage:** persistencia automática en `localStorage`, esquema `repartidor-padel-v2`, con migración desde `v1`.
- **Canvas 2D:** creación de la imagen PNG de clasificación en el propio dispositivo.

```text
src/
├── App.vue                 # Vistas, estado, incidencias, puntuación y persistencia
├── main.ts                 # Punto de entrada Vue
├── style.css               # Sistema visual base
├── responsive.css          # Variantes móvil/tablet, safe areas y teclado
└── domain/
    ├── scheduler.ts        # Tipos, disponibilidad y algoritmos de reparto/recalculo
    ├── standings.ts        # Cálculo de puntos y clasificación
    └── scheduler.test.ts   # Pruebas de planificación, estados y puntuación
public/
├── padel.svg               # Marca e icono del sitio
├── pwa-192.svg             # Icono instalable
└── pwa-512.svg             # Icono instalable de alta resolución
diseno/wireframes/          # Wireframes de todas las vistas y flujo de incidencias
```

## Reglas del generador

1. En dobles se necesitan 4 jugadores disponibles por partido; en individual, 2. En cada jornada nadie juega dos veces.
2. El modo dobles divide a los cuatro jugadores en dos equipos. No hay límite global de cabezas de pista; para cada cuarteto, se aceptan únicamente divisiones con como máximo una cabeza por equipo. Si un cuarteto contiene tres o cuatro cabezas, no existe una división válida y se busca otro cruce.
3. En dobles se buscan primero partidos en los que ambos equipos tengan una pareja inédita. Si no queda ningún cruce compatible con parejas nuevas, se permite repetir el mínimo de parejas posible para mantener la pista ocupada. En cada fase se priorizan además participantes que aún no se han cruzado; el equilibrio de apariciones desempata después. En individual, el mismo duelo nunca se repite.
4. Se favorece a los jugadores con menos apariciones proyectadas (partidos completados y pendientes que se mantienen), reduciendo la diferencia de carga y permitiendo jornadas consecutivas sin descanso mínimo.
5. Las pistas libres se mantienen visibles cuando no hay suficientes jugadores, disponibilidad o cruces compatibles.
6. En un recálculo se conservan los partidos completados e interrumpidos, y los partidos pendientes anteriores a la jornada efectiva. Los participantes de partidos ya jugados/interrumpidos quedan bloqueados en esa jornada.
7. Si queda un partido en juego dentro del tramo a recalcular, el recálculo se bloquea hasta registrar el resultado o marcarlo como interrumpido.

El reparto crea varios calendarios candidatos para los grupos pequeños y conserva el de mayor cobertura de parejas nuevas, después el de más partidos y menor repetición. En cada pista realiza primero una búsqueda estricta de parejas nuevas y solo pasa a una búsqueda que permite repeticiones mínimas si no encuentra un cruce inédito compatible. La comprobación de que existe una pareja inédita viable recorre todas las aristas disponibles; esto evita activar la repetición por un límite de búsqueda. Dentro de cada cruce se favorecen primero las personas que aún no se han enfrentado y luego se equilibra la carga. Se prueban 16 calendarios con hasta 8 participantes, 6 hasta 14, 2 hasta 18 y uno en grupos mayores. Para grupos de hasta 18 jugadores se puntúan todas las combinaciones válidas de equipos; para grupos mayores se puntúan hasta 18.000 por pista, además de conservar una opción inédita viable. Es una heurística acotada, no un solucionador matemático que garantice un calendario global óptimo.

## Versionado y publicaciones

`package.json` es la fuente de la versión SemVer, que la interfaz muestra en la barra superior; `package-lock.json` mantiene el mismo número. Cada publicación se documenta en `CHANGELOG.md` y se marca en Git con una etiqueta `v<versión>` (por ejemplo, `v1.1.0`). Para el siguiente cambio de versión, actualizar el paquete con `npm version patch`, `npm version minor` o `npm version major`, completar el changelog y publicar tanto el commit como la etiqueta.

## Puntuación y persistencia

- Victoria: cada integrante del equipo ganador suma 3 puntos y cada integrante del otro equipo suma 1.
- Empate: cada participante suma 2 puntos.
- La clasificación se ordena por puntos, después por victorias y finalmente por nombre.
- Los cambios de jugadores, disponibilidad, ajustes, jornadas, estados y resultados se guardan automáticamente en el almacenamiento local del navegador. No se envían a un servidor.

## Desarrollo y publicación

Requisitos: Node.js 20 o posterior y npm.

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

El contenido de `dist/` es estático y se puede publicar en cualquier hosting HTTPS. El service worker solo se genera en la compilación de producción. En despliegues bajo una subruta, configurar el `base` de Vite y las rutas del manifiesto de acuerdo con dicha subruta.

## Decisiones y límites

- Cada dispositivo/navegador tiene su propia copia del torneo; no hay sincronización entre participantes.
- La exportación incluye la tabla y el resumen de jornadas completadas. El PNG se genera localmente y se descarga como `clasificacion-padel.png`.
- El catálogo de nombres es personalizable y cada torneo comienza al pulsar «Generar jornadas».
- Tipografías de Google Fonts mejoran la presentación cuando hay conexión; la aplicación y las funciones principales no dependen de ellas.

## Adaptación a móvil y tablet

- `src/responsive.css` se carga después de los estilos de escritorio y define las variantes móvil/tablet sin alterar las reglas de negocio.
- El layout admite anchos de 320 CSS px en adelante. Por debajo de 680 px la configuración se apila; desde 720 px los partidos vuelven a una cuadrícula de dos columnas. Los cortes exactos se mantienen en CSS y se validan con la matriz `docs/RESPONSIVE_CHECKLIST.md`.
- En móvil, la clasificación usa tarjetas etiquetadas (PJ/G/E/P/PTS); los selectores de jornadas conservan scroll táctil local. Los campos tienen tamaño de texto adecuado para que Safari iOS no aplique zoom automático.
- Las hojas de disponibilidad/recálculo se ajustan a `100dvh` y respetan insets seguros en retrato, paisaje y cuando aparece el teclado virtual.
- `index.html` declara `viewport-fit=cover` y los metadatos de instalación iOS; el manifiesto PWA sigue compartido entre iOS y Android.
- Los wireframes responsive y los sketches de las cuatro tareas están en `diseno/wireframes/05-responsive-movil.svg`, `06-responsive-tablet.svg` y `diseno/sketches/responsive.md`.

El checklist es una guía de verificación manual en Safari iOS y Chrome Android: revisar retrato/paisaje a 320, 360, 390, 768, 1024 y 1280 CSS px, teclado/scroll de diálogos, tamaños táctiles, ausencia de desbordamiento horizontal y visualización de la tabla.

## Disponibilidad y recálculo durante el torneo

### Modelo de participación

Cada `Player` puede incluir `availabilityChanges: [{ fromRound, available, reason }]`. Este historial permite altas, bajas por lesión y reincorporaciones con fecha efectiva, sin borrar el historial del participante. Las jornadas anteriores al cambio conservan sus participantes, partidos y resultados.

Cada `Match` distingue `scheduled`, `inProgress`, `completed` e `interrupted`. Solo los partidos `completed` con resultado computan para puntos y clasificación. Un partido interrumpido permanece visible como incidencia, no puntúa y bloquea a sus participantes para el resto de esa jornada. La persona lesionada deja de ser elegible para los partidos pendientes desde la jornada efectiva.

### Ámbito y proceso del recálculo

1. Si la jornada actual está abierta, recalcular sus partidos `scheduled` (no iniciados) y los de las jornadas futuras. Si ya está cerrada, empezar por la siguiente jornada abierta.
2. Mantener sin cambios los partidos `completed`, sus alineaciones, resultados y puntos. Mantener también los `interrupted` y bloquear sus jugadores durante esa jornada. Antes de solicitar el recálculo, terminar un partido `inProgress` o registrarlo como `interrupted`.
3. Excluir de cada jornada a las personas no disponibles en esa fecha e incluir a las nuevas desde su fecha de alta. Nadie que haya jugado o tenga un partido en curso/interrumpido podrá recibir otra asignación en la misma jornada.
4. Presentar una vista previa con los partidos completos que se conservan y los partidos pendientes que cambian. Aplicar la nueva planificación solo tras confirmación; cancelar no modifica el calendario vigente.

### Criterio de equilibrio

El reparto debe contar los partidos completados y los previstos de cada participante que esté disponible en el periodo recalculado, incluyendo el historial completado anterior a un alta. En cada elección se favorece a quien tenga menos partidos proyectados; el objetivo es reducir al mínimo la diferencia entre la mayor y la menor carga proyectada, respetando pistas, formato, cabezas de pista y disponibilidad. Entre repartos con una carga semejante, se favorece ocupar los partidos posibles y variar las parejas.

No se impone un descanso mínimo entre jornadas: jugar jornadas consecutivas o todas las jornadas disponibles es válido y puede ser necesario para igualar el número de partidos. Se mantiene la restricción de un partido por persona y jornada para evitar asignaciones simultáneas o duplicadas. Las bajas no se incluyen en el conjunto usado para equilibrar partidos futuros, pero siguen figurando en la clasificación con su historial.

### Persistencia y verificación

- Los datos nuevos se guardan en `repartidor-padel-v2`. Al iniciar, los torneos de `v1` se migran: los participantes existentes están disponibles en todas las jornadas y el estado se infiere (`resultado` → `completed`; sin resultado → `scheduled`). Se conservan nombres, jornadas, resultados y puntos.
- Se guarda el motivo y la jornada efectiva del cambio de disponibilidad. Los datos siguen locales; no se requiere sincronización con un servidor.
- Las pruebas de `src/domain/scheduler.test.ts` cubren disponibilidad efectiva, altas, bajas, equilibrio, resultados preservados, interrupciones, cabezas de pista, unicidad de asignaciones y puntuación. Las vistas muestran una previsualización antes de confirmar; cancelar no aplica el recálculo ni la modificación de participantes.
- Si la disponibilidad no permite completar todas las pistas, dejar las pistas necesarias libres y explicar el motivo en la vista previa y en la jornada.
