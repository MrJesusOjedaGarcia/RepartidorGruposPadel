# Bocetos y wireframes

Estos esquemas de baja fidelidad documentan las vistas principales y los flujos de la PWA. `01-configuracion.svg`, `02-jornadas.svg` y `03-clasificacion.svg` corresponden a las vistas principales. `04-incidencias-y-recalculo.svg` representa la gestión de altas, lesiones, interrupciones y recálculo. `05-responsive-movil.svg` y `06-responsive-tablet.svg` muestran la adaptación de todas las vistas en pantallas móviles y tablets.

## Bocetos rápidos

```text
CONFIGURACIÓN             JORNADAS                     CLASIFICACIÓN
┌ marca ───────────┐      ┌ marca ───────────┐         ┌ marca ───────────┐
│ presentación     │      │ progreso/resultado│         │ título + exportar│
├ grupo ─┬ ajustes ┤      ├ selector jornadas│         ├ resumen          │
│ nombres│ formato  │      ├ pistas / equipos │         ├ tabla ordenada   │
│ cabezas│ pistas   │      │ botones resultado│         │ leyenda de puntos│
└────────┴ repartir ┘      └──────────────────┘         └──────────────────┘
                 ↘ GESTIÓN DE DISPONIBILIDAD ↙
        lesión / alta → vista previa → recalcular pendientes
```

## Criterios responsive

- En escritorio, configuración en dos columnas y tarjetas de partidos en una cuadrícula de dos columnas.
- En móvil, configuración y partidos pasan a una columna; la barra de navegación y el selector de jornadas mantienen desplazamiento horizontal cuando hace falta.
- En móvil la clasificación se transforma en tarjetas etiquetadas y no necesita scroll horizontal; en tablet y escritorio conserva la tabla.
- El flujo de incidencias se inicia desde el grupo o una jornada abierta. La vista previa destaca los resultados que se conservan, las asignaciones que cambian y el total de partidos proyectados por participante.
- La fecha efectiva de alta/baja se selecciona por jornada; las personas pueden jugar en jornadas consecutivas, pero nunca en dos partidos de una misma jornada.
- Sketch general multiplataforma: `../sketches/responsive.md`.
- La vista de móvil se diseña para anchos desde 320 px; la clasificación se presenta como tarjetas para evitar scroll horizontal y el diálogo de incidencias pasa a hoja inferior.
- Tablet mantiene dos columnas en los anchos legibles y reorganiza en retrato las vistas estrechas; los diálogos se centran y limitan su altura al viewport dinámico.
- En Android e iOS se respetan los insets del sistema y se evitan controles que dependan de hover; paisaje y retrato comparten el mismo flujo.
