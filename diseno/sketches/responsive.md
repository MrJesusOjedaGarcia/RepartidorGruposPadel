# Sketch responsive — móvil y tablet

## Objetivo

Mantener las cuatro tareas completas —configurar el grupo, llevar las jornadas, consultar la clasificación y gestionar una incidencia— sin zoom ni desplazamiento horizontal de la página. El contenido se reorganiza con el ancho disponible; solo los selectores de jornadas pueden desplazarse horizontalmente.

## Sketch móvil · Android / iOS · retrato

```text
┌──── zona segura del sistema / notch ─────┐
│ marca                         guardado  ↻ │
├──────────────────────────────────────────┤
│ título breve / intro ilustración compacta│
├──── 01 grupo ─ 02 jornadas ─ 03 tabla ───┤  ← navegación táctil desplazable
│                                          │
│ CONFIGURACIÓN       JORNADAS             │
│ ┌ grupo ─────────┐  ┌ j01 j02 j03 → ───┐ │
│ │ nombre     [+] │  │ pista / equipos   │ │
│ │ alta desde     │  │ nombres envueltos │ │
│ │ jugador estado│  │ en juego / estado │ │
│ │ baja / cabeza  │  │ [A] [empate] [B]  │ │
│ └────────────────┘  └───────────────────┘ │
│ ┌ ajustes ───────┐                        │
│ │ dobles / sing. │  CLASIFICACIÓN         │
│ │ rondas / pistas│  ┌ posición · nombre ┐ │
│ └────────────────┘  │ PJ G E P PTS       │ │
│ [ generar / recalcular pendientes ]       │
│                                          │
│ INCIDENCIA: hoja inferior a pantalla     │
│ completa; campos apilados, botones a mano│
└──── margen seguro inferior / gesto ──────┘
```

- Objetivo de referencia: 320–430 CSS px de ancho; retrato y paisaje.
- En 320–560 px la configuración pasa a una columna y cada tarjeta de partido ocupa todo el ancho.
- La tabla se convierte en tarjetas con etiquetas `PJ`, `G`, `E`, `P` y `PTS`, sin necesitar scroll lateral.
- Los diálogos pasan a una hoja inferior desplazable; no quedan tapados por el teclado ni por las barras del navegador.
- Entradas con texto a 16 px o más para evitar el zoom automático de Safari en iOS.

## Sketch tablet · retrato y paisaje

```text
TABLET RETRATO (≈768 px)        TABLET PAISAJE (≈1024 px)
┌─────────────────────────┐     ┌────────────────────────────────────┐
│ barra + safe area       │     │ barra / marca / acciones           │
│ intro compacto          │     │ introducción en dos columnas       │
├─────────────────────────┤     ├────────────────────────────────────┤
│ pestañas completas      │     │ pestañas completas                  │
│ ┌ grupo ───┐ ┌ ajustes┐ │     │ ┌ tarjeta partido ┐ ┌ tarjeta ┐     │
│ │ lista    │ │ config │ │     │ │ equipos / boton │ │ equipos │     │
│ └──────────┘ └────────┘ │     │ └─────────────────┘ └─────────┘     │
│ botón ancho             │     │ tabla de clasificación a todo ancho │
│ tarjeta partido         │     │ incidencia en diálogo centrado      │
│ tabla adaptable         │     └────────────────────────────────────┘
└─────────────────────────┘
```

## Sketch de gestos y accesibilidad

- Mínimo recomendado de 44 × 44 CSS px en botones, navegación y acciones frecuentes.
- Scroll táctil nativo para jornadas; no depender de hover ni de ratón.
- Retrato/paisaje y zoom de texto del sistema no deben ocultar acciones.
- Los insets `safe-area-inset-*` protegen el notch, Dynamic Island, indicadores de inicio y bordes de tablet.
- El wireframe de alta/baja (`04-incidencias-y-recalculo.svg`) se adapta como diálogo centrado en tablet y hoja inferior en móvil.
