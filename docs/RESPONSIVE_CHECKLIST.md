# Checklist de verificación responsive

## Matriz de viewports

| Ancho CSS | Dispositivo de referencia | Orientaciones | Revisar |
| ---: | --- | --- | --- |
| 320 px | móvil compacto | retrato / paisaje | contenido sin recorte; lista y resultados envueltos |
| 360 px | Android compacto | retrato / paisaje | navegación desplazable; botones de puntuación |
| 390 px | iPhone actual | retrato / paisaje | safe areas, Dynamic Island y hojas inferiores |
| 768 px | tablet retrato | retrato / paisaje | configuración y partidos en columnas legibles |
| 1024 px | tablet paisaje | retrato / paisaje | tabla completa y diálogo centrado |
| 1280 px | escritorio | paisaje | layout de escritorio sin cambios |

## Recorrido por cada tamaño

- [ ] **Grupo:** añadir un jugador, marcar jugador líder antes del torneo, revisar el selector «Disponible desde», desplegar la política de jugadores líderes y probar «Eliminar todos» en móvil/tablet.
- [ ] **Jornadas:** desplazar el selector; leer nombres largos; pulsar «Marcar en juego», marcar resultado, interrumpir y reabrir un partido.
- [ ] **Clasificación:** verificar posición, nombre, PJ, G, E, P y PTS. En teléfono debe leerse como tarjetas, no depender de scroll horizontal.
- [ ] **Lesión/alta:** abrir selector de fecha y estado; abrir teclado; desplazar el diálogo y alcanzar cancelar/preparar.
- [ ] **Vista previa:** revisar cargas y botones con el teclado cerrado/abierto, rotar el dispositivo y cancelar/confirmar.
- [ ] **Tutorial:** probar la primera visita y su reapertura desde `?`; recorrer pasos, omitir/cerrar y comprobar que los controles siguen visibles con scroll en móvil.
- [ ] **Táctil:** controles principales de al menos 44 × 44 CSS px, foco visible y operación sin hover.
- [ ] **Overflow:** no hay scroll horizontal del documento; se permite solo dentro del selector de jornadas y las regiones que lo indiquen.
- [ ] **PWA instalada:** comprobar insets superior/inferior en Safari iOS y Chrome Android, y que el contenido no quede debajo de barras del sistema.
