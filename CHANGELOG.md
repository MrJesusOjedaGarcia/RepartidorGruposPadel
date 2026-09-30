# Registro de cambios

## [1.3.5] - 2026-09-30

### Cambiado

- El planificador equilibra la media de partidos entre jugadores líderes y el resto, además de procurar que cada participante tenga un total similar.
- Se permite jugar jornadas consecutivas cuando eso evita que alguien quede por debajo en número de partidos.

## [1.3.4] - 2026-09-30

### Cambiado

- El equilibrio del total de partidos tiene prioridad sobre los descansos y la alternancia de partidos con/sin líderes.
- Los líderes ya no quedan sistemáticamente en menos partidos; las jornadas consecutivas se permiten cuando ayudan a igualar las apariciones.

## [1.3.3] - 2026-09-30

### Cambiado

- La opción flexible se describe como «Permitir jornadas sin líderes» y distribuye los partidos con líderes y sin ellos de forma intercalada cuando es posible.
- Se rota la participación de los jugadores líderes para evitar concentrar sus partidos al principio del calendario.

## [1.3.2] - 2026-09-30

### Añadido

- Acción para eliminar todos los jugadores de una vez, con confirmación; si existe un torneo, borra también sus jornadas y resultados.

## [1.3.1] - 2026-09-30

### Cambiado

- La interfaz y el manual usan «jugador líder» en lugar de «cabeza».

### Añadido

- Los nombres de los jugadores líderes se resaltan en las tarjetas de partidos con color y distintivo.

## [1.3.0] - 2026-09-30

### Añadido

- Selector para permitir partidos sin jugadores líderes o exigir un líder en ambos equipos de cada partido.
- Generación que prioriza llenar las pistas compatibles, empareja a los líderes de forma simétrica y rota los descansos para evitar jornadas consecutivas cuando sea posible.
- Mayor prioridad de juego para los jugadores líderes cuando la composición del grupo lo requiere.

## [1.2.1] - 2026-09-30

### Añadido

- Acción para reabrir partidos completados o interrumpidos, volverlos a pendiente y corregir su resultado o reanudarlos.
- Confirmación al reabrir un partido para advertir que su resultado y puntos se borrarán.

## [1.2.0] - 2026-09-30

### Añadido

- Tutorial guiado de cuatro pasos que aparece la primera vez y puede volver a abrirse desde el botón de ayuda.
- Navegación por teclado, progreso accesible, cierre con Escape y preferencia de tutorial completado guardada localmente.

## [1.1.0] - 2026-09-30

### Cambiado

- El reparto prioriza que cada equipo tenga una pareja de compañeros inédita y evita cruces entre personas que ya se han enfrentado cuando puede.
- Si no queda un partido compatible con parejas nuevas, permite la repetición mínima para no dejar una pista vacía sin necesidad.
- Se comparan varios calendarios candidatos en grupos pequeños para evitar que una elección voraz deje sin uso una jornada que aún podía tener partido.
- La versión de la aplicación se muestra en la barra superior y sigue la versión SemVer del paquete.
