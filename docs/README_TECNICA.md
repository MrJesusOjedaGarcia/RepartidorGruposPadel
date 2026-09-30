# Documentación técnica — Repartidor

## Descripción

PWA de una sola página para organizar partidos de pádel, generar jornadas, registrar resultados y consultar/exportar una clasificación. La interfaz está escrita en Vue 3 con TypeScript y se sirve con Vite. No requiere una API: la información permanece en el navegador.

## Tecnologías y estructura

- **Vue 3 + Composition API:** estado y vistas reactivas en `src/App.vue`.
- **Gestión del grupo:** la acción masiva borra la plantilla y, si hay jornadas, también el torneo completo tras confirmación.
- **TypeScript:** tipos de jugadores, partidos, jornadas, formato y política de jugadores líderes en `src/domain/scheduler.ts`.
- **Vite:** servidor de desarrollo y compilación estática.
- **vite-plugin-pwa / Workbox:** manifiesto y service worker para instalación y acceso sin conexión después de la primera carga.
- **Responsive móvil/tablet:** CSS por anchos/orientación, `viewport-fit=cover`, insets `safe-area-inset-*` y soporte de altura dinámica para Safari iOS/Chrome Android.
- **Tutorial guiado:** cuatro pasos accesibles en `src/App.vue`, mostrado en primera visita, navegable con teclado/tacto y reabrible desde la cabecera; la preferencia se recuerda con una clave independiente en `localStorage`.
- **Indicador de líder:** las tarjetas renderizan cada nombre por separado, resaltan a los jugadores líderes y añaden una etiqueta accesible para lectores de pantalla.
- **Web Storage:** persistencia automática en `localStorage`, esquema `repartidor-padel-v2`, con migración desde `v1`.
- **Canvas 2D:** creación de la imagen PNG de clasificación en el propio dispositivo.

```text
src/
├── App.vue                 # Vistas, tutorial, incidencias, puntuación y persistencia
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
2. `CaptainPolicy` permite `optional` (jornadas con partidos con y sin jugadores líderes) o `required` (un jugador líder por equipo en cada partido). En ambos modos se exige simetría: o ambos equipos tienen un líder o ninguno; un líder nunca se enfrenta a un equipo sin líderes. La regla se aplica en dobles e individual, se almacena con la configuración y queda fija durante el torneo.
3. En cada jornada se maximiza primero el número de partidos compatibles y se busca una asignación que permita usar las pistas restantes.
4. Después se minimiza la diferencia de apariciones entre todas las personas, incluyendo los líderes. Se pueden asignar jornadas consecutivas si así se evita dejar a alguien por detrás.
5. En modo `optional` se intercala el número de partidos con líderes y sin ellos dentro de cada jornada y a lo largo del calendario, siempre que no empeore el equilibrio de participaciones.
6. Para dobles, se buscan parejas nuevas y cruces no repetidos; las parejas solo se repiten si ninguna alternativa compatible queda, y se minimizan los partidos repetidos. En individual, el mismo duelo nunca se repite.
7. Si los recuentos quedan equilibrados, se intentan evitar las jornadas consecutivas y favorecer el descanso rotativo. Las pistas libres se mantienen visibles cuando el formato, los jugadores líderes o la disponibilidad no permiten llenarlas.
8. En un recálculo se conservan los partidos completados e interrumpidos, y los partidos pendientes anteriores a la jornada efectiva. Los participantes de partidos ya jugados/interrumpidos quedan bloqueados en esa jornada.
9. Si queda un partido en juego dentro del tramo a recalcular, el recálculo se bloquea hasta registrar el resultado o marcarlo como interrumpido.

El reparto compara calendarios por cantidad de partidos llenos y diferencia de apariciones primero; después intercalación de partidos con/sin líderes, descansos consecutivos evitables y novedad de compañeros/cruces. En modo `optional`, la búsqueda intercala partidos con líderes y sin ellos por jornada y en el calendario, salvo que otra distribución iguale mejor las apariciones. Al evaluar un partido, un jugador líder solo puede estar en un equipo con otro líder en el lado contrario. La selección comprueba que una asignación deje jugadores suficientes para las pistas restantes; la generación se optimiza con varios calendarios candidatos en grupos pequeños. La búsqueda de parejas y cruces es una heurística, no un solucionador matemático que garantice un calendario global óptimo.

## Versionado y publicaciones

`package.json` es la fuente de la versión SemVer, que la interfaz muestra en la barra superior; `package-lock.json` mantiene el mismo número. Cada publicación se documenta en `CHANGELOG.md` y se marca en Git con una etiqueta `v<versión>` (por ejemplo, `v1.3.5`). Para el siguiente cambio de versión, actualizar el paquete con `npm version patch`, `npm version minor` o `npm version major`, completar el changelog y publicar tanto el commit como la etiqueta.

## Puntuación y persistencia

- Victoria: cada integrante del equipo ganador suma 3 puntos y cada integrante del otro equipo suma 1.
- Empate: cada participante suma 2 puntos.
- La clasificación se ordena por puntos, después por victorias y finalmente por nombre.
- Los cambios de jugadores, disponibilidad, ajustes, jornadas, estados y resultados se guardan automáticamente en el almacenamiento local del navegador. No se envían a un servidor.
- El tutorial usa `repartidor-padel-tutorial-v1` para recordar que se cerró; esta preferencia es independiente del torneo.

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

Cada `Match` distingue `scheduled`, `inProgress`, `completed` e `interrupted`. Solo los partidos `completed` con resultado computan para puntos y clasificación. Un partido interrumpido permanece visible como incidencia, no puntúa y bloquea a sus participantes para el resto de esa jornada. La acción `reopenMatch` permite pasar `completed` o `interrupted` de nuevo a `scheduled`, borra el resultado y conserva los equipos/pista; así vuelven a participar de manera normal y pueden jugarse o corregirse. La persona lesionada deja de ser elegible para los partidos pendientes desde la jornada efectiva.

### Ámbito y proceso del recálculo

1. Si la jornada actual está abierta, recalcular sus partidos `scheduled` (no iniciados) y los de las jornadas futuras. Si ya está cerrada, empezar por la siguiente jornada abierta.
2. Mantener sin cambios los partidos `completed`, sus alineaciones, resultados y puntos durante el recálculo. Mantener también los `interrupted` y bloquear sus jugadores durante esa jornada. Si el usuario reabre expresamente uno, pasa a pendiente, deja de puntuar y puede redistribuirse en el siguiente recálculo. Antes de solicitar el recálculo, terminar un partido `inProgress` o registrarlo como `interrupted`.
3. Excluir de cada jornada a las personas no disponibles en esa fecha e incluir a las nuevas desde su fecha de alta. Nadie que haya jugado o tenga un partido en curso/interrumpido podrá recibir otra asignación en la misma jornada.
4. Presentar una vista previa con los partidos completos que se conservan y los partidos pendientes que cambian. Aplicar la nueva planificación solo tras confirmación; cancelar no modifica el calendario vigente.

### Criterio de equilibrio

El reparto debe contar los partidos completados y los previstos de cada participante que esté disponible en el periodo recalculado, incluyendo el historial completado anterior a un alta. En cada elección se favorece a quien tenga menos partidos proyectados; el objetivo es reducir al mínimo la diferencia entre la mayor y la menor carga proyectada, respetando pistas, formato, jugadores líderes y disponibilidad. Entre repartos con una carga semejante, se favorece ocupar los partidos posibles y variar las parejas.

No se impone un descanso mínimo entre jornadas: jugar jornadas consecutivas o todas las jornadas disponibles es válido y puede ser necesario para igualar el número de partidos. Se mantiene la restricción de un partido por persona y jornada para evitar asignaciones simultáneas o duplicadas. Las bajas no se incluyen en el conjunto usado para equilibrar partidos futuros, pero siguen figurando en la clasificación con su historial.

### Persistencia y verificación

- Los datos nuevos se guardan en `repartidor-padel-v2`. Al iniciar, los torneos de `v1` se migran: los participantes existentes están disponibles en todas las jornadas y el estado se infiere (`resultado` → `completed`; sin resultado → `scheduled`). Se conservan nombres, jornadas, resultados y puntos.
- La opción `captainPolicy` (`optional`/`required`) se conserva en la configuración local; las instalaciones anteriores que no la tengan usan `optional`.
- Se guarda el motivo y la jornada efectiva del cambio de disponibilidad. Los datos siguen locales; no se requiere sincronización con un servidor.
- Las pruebas de `src/domain/scheduler.test.ts` cubren disponibilidad efectiva, altas, bajas, equilibrio, ocupación de pistas, simetría y política de jugadores líderes, descansos, parejas inéditas, resultados preservados, reapertura de partidos, interrupciones, unicidad de asignaciones y puntuación. Las vistas muestran una previsualización antes de confirmar; cancelar no aplica el recálculo ni la modificación de participantes.
- Si la disponibilidad no permite completar todas las pistas, dejar las pistas necesarias libres y explicar el motivo en la vista previa y en la jornada.
