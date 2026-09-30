# Manual de usuario

## Empezar

Abre la aplicación en el navegador. Añádela a la pantalla de inicio desde el menú del navegador si quieres usarla como aplicación. Una vez cargada, la PWA conserva los datos en ese navegador y puede abrirse sin conexión.

## Tutorial de uso

La primera vez que abras la aplicación aparecerá una guía rápida de cuatro pasos sobre cómo preparar el grupo, generar jornadas, registrar resultados y gestionar cambios de disponibilidad. Usa **Anterior** y **Siguiente** para recorrerla, o **Omitir tutorial** para cerrarla. La guía no vuelve a aparecer automáticamente en ese dispositivo después de cerrarla; puedes abrirla de nuevo en cualquier momento con el botón `?` de la barra superior.

### Instalar y usar en teléfono o tablet

- **iPhone/iPad:** abre la aplicación en Safari, pulsa **Compartir** y elige **Añadir a pantalla de inicio**. Ábrela desde el nuevo icono para usarla en modo aplicación.
- **Android:** abre la aplicación en Chrome y usa **Instalar aplicación** o **Añadir a pantalla de inicio** desde el menú del navegador.
- Puedes usarla en vertical u horizontal. En teléfonos las vistas se apilan y la clasificación usa tarjetas; en tablets se aprovecha el ancho con columnas. El selector de jornadas puede desplazarse lateralmente.
- Si aparece el teclado virtual en una hoja de lesión/alta, desplaza el contenido del diálogo para ver sus botones; el diálogo tiene su propio scroll.

## 1. Configurar el grupo

1. En **El grupo**, escribe el nombre de cada persona y pulsa `+` o Enter.
2. Pulsa **Marcar jugador líder** junto a todas las personas que necesites; no hay límite. Cuando juegue un líder, también habrá uno en el equipo contrario.
3. Selecciona **Dobles (2 × 2)** o **Individual (1 × 1)**.
4. En **Regla de jugadores líderes**, elige **Permitir partidos sin líderes** o **Líderes en todos los partidos**. La primera opción admite partidos sin líderes, pero si juega un líder, el otro equipo también tendrá uno. La segunda exige un líder en cada equipo; si no hay dos líderes disponibles para la misma jornada, no se podrá generar ese partido.
5. Ajusta el número de jornadas y pistas con los botones `−` / `+` o editando el número.
6. Pulsa **Generar jornadas**.

La regla de jugadores líderes se guarda en el dispositivo y queda fijada al crear las jornadas. Para cambiarla después, reinicia las jornadas del torneo desde `↻`.

El reparto prioriza llenar todas las pistas que admitan partidos compatibles y rota los descansos para evitar que una persona juegue dos jornadas seguidas si puede mantener la misma cantidad de partidos. Los jugadores líderes pueden participar con más frecuencia si hace falta para equilibrar los equipos. Cada persona juega como máximo una vez por jornada.

En dobles, el reparto busca parejas de compañeros nuevas y cruces con personas que aún no se han enfrentado. Solo repite compañeros cuando ya no encuentra ningún partido compatible con parejas inéditas; entonces usa la combinación con menos repeticiones. En individual, ningún duelo se repite. Si la disponibilidad, la regla elegida para los jugadores líderes o los cruces posibles no permiten ocupar una pista, queda libre.

Los nombres de jugadores líderes se resaltan con color y el distintivo `✳` en las tarjetas de las jornadas.

La versión de la aplicación aparece en la barra superior.

## 2. Registrar los resultados

Abre **Las jornadas** y elige una jornada. Cada tarjeta muestra la pista y los dos equipos. Pulsa **Marcar en juego** cuando empiece el partido. Al terminar, marca **Gana A**, **Empate** o **Gana B**. Puedes seleccionar otro resultado si necesitas corregirlo. Un resultado ya anotado no se elimina al volver a pulsar el mismo botón.

Si un partido quedó cerrado por error o fue posible reanudar uno interrumpido, pulsa **Reabrir partido** o **Reintentar partido** en su tarjeta. Confirma la acción: el partido vuelve a pendiente, mantiene los equipos y la pista, y pierde el resultado/puntos anteriores. Después puedes iniciarlo otra vez, registrar el resultado correcto o marcarlo interrumpido de nuevo.

La aplicación suma automáticamente los puntos de todos los integrantes de cada equipo: **3** por ganar, **2** por empatar y **1** por perder. Los resultados y la jornada seleccionada se conservan al cerrar la aplicación.

## 3. Consultar y compartir la clasificación

Abre **Clasificación** para ver partidos jugados, victorias, empates, derrotas y puntos. **Descargar imagen PNG** crea una imagen de la tabla en el dispositivo, lista para compartir.

## Cambiar el grupo o empezar otra vez

- Para volver a repartir, abre **El grupo** y pulsa **Recalcular pendientes**. Revisa la vista previa y confirma; los partidos terminados no se sustituyen.
- Para borrar las jornadas y los resultados manteniendo el grupo, pulsa `↻` en la parte superior y confirma. También se reinicia el historial de disponibilidad para iniciar un torneo nuevo.
- Antes de generar el torneo, `×` retira a una persona del grupo.
- Durante el torneo, el formato y los jugadores líderes quedan fijados. Usa **Lesión / baja** o **Reincorporar** en la fila de cada persona para cambiar su disponibilidad sin borrar el historial.

## Gestionar altas, lesiones y recálculo

Las bajas y las altas recalculan los partidos pendientes desde la jornada elegida. La vista previa enseña cuántos partidos se conservan, se vuelven a repartir y se generan, además de la carga proyectada por participante. Cancelar deja intactos el calendario y el grupo.

### Dar de baja por lesión

1. En el grupo, pulsa **Lesión / baja** junto a la persona y selecciona la jornada efectiva.
2. Si participa en un partido en juego dentro del tramo a recalcular, vuelve a **Las jornadas** y registra su resultado o márcalo como interrumpido. La aplicación no permitirá confirmar el recálculo mientras quede un partido en juego.
3. Revisa la vista previa: los partidos completados y sus resultados se conservan; se muestran los partidos pendientes que cambiarán y las pistas que podrían quedar libres.
4. Confirma el recálculo. La persona conserva sus puntos e historial, pero deja de aparecer en partidos desde la jornada elegida.

### Incorporar a una persona

1. Escribe el nombre de la persona en el campo de jugadores, selecciona **Disponible desde** y pulsa `+`.
2. Revisa y confirma la vista previa del nuevo calendario pendiente.
3. La persona nueva comienza con cero partidos y puntos; las jornadas ya jugadas y sus resultados no se modifican.

### Reincorporar a alguien y criterio de reparto

Para reincorporar a alguien, pulsa **Reincorporar**, selecciona la jornada de vuelta y confirma el recálculo. El nuevo reparto intenta equilibrar los partidos completados y previstos de las personas disponibles. Puede asignar a alguien jornadas consecutivas o sin descanso; cada participante sigue teniendo como máximo un partido por jornada. Los partidos completados no se vuelven a sortear.

Si un partido se interrumpe por lesión, márcalo como **Interrumpido** desde la tarjeta del partido en juego. Se conserva en el historial, no concede puntos y sus participantes no vuelven a jugar esa jornada.

## Privacidad y almacenamiento

Los nombres, jornadas y resultados se guardan únicamente en el almacenamiento local del navegador. No se necesita crear una cuenta. Si borras los datos del navegador o cambias de dispositivo, la información guardada no se traslada automáticamente.
