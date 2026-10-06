# Arquitectura

## Decisión de stack

Objetivo: una app real e instalable en **macOS primero**, con base compartida para Windows, iOS, iPadOS y Android.

| Criterio | Tauri 2 + React/TS | Electron | React Native macOS/Windows |
|---|---|---|---|
| Tamaño del paquete | **~6,3 MB** (medido) | 150 MB+ | medio |
| Memoria | WebView del sistema | Chromium completo | nativo |
| Bandeja / barra de menús | plugin oficial | sí | módulo nativo aparte |
| Atajo global | plugin oficial | sí | módulo nativo aparte |
| Notificaciones | plugin oficial | sí | variable |
| Auto-actualización | plugin oficial | sí | manual |
| SQLite local | plugin oficial | módulos nativos | sí |
| iOS / Android | Tauri 2 mobile | no | sí |
| Mantenimiento | activo, estable (2.x) | activo | va por detrás de RN |

**Elegido: Tauri 2 + React 19 + TypeScript + Vite.** Es lo que mejor cubre las necesidades de escritorio (bandeja, atajo global, notificaciones, archivos) con el menor peso. Toda la lógica vive en `src/core`, en TypeScript puro sin dependencias de UI. Así se puede reutilizar tal cual:

- en **Tauri mobile**, que es el camino más rápido porque reutiliza la misma UI, o
- en una app **Expo/React Native**, con UI nativa, si los widgets y la sensación nativa en móvil lo justifican.

La elección móvil se decidirá cuando el escritorio esté validado. La arquitectura no impide ninguna de las dos.

## Capas

```
┌───────────────────────────── UI (src/features, src/ui, src/app) ───────────────────────────┐
│  Pantallas · sistema de diseño · paleta ⌘K · captura · motores (focus, avisos, bandeja)     │
└──────────────┬─────────────────────────────────────────────────────────────┬──────────────┘
               │ acciones de dominio (src/data/actions)                      │ src/platform
┌──────────────▼──────────────┐   ┌──────────────────────────┐   ┌──────────▼──────────────┐
│ Store local-first (memoria) │──▶│ Adaptador de almacenam.  │   │ Tauri: notificaciones,  │
│ HLC · deshacer · cola sync  │   │ SQLite | IndexedDB | mem │   │ bandeja, atajo global,  │
└──────────────┬──────────────┘   └──────────────────────────┘   │ diálogos, abrir enlaces │
               │                                                  └─────────────────────────┘
┌──────────────▼──────────────────────────────────────────────────────────────────────────┐
│ src/core (puro, testeado): fechas · recurrencia · hábitos · tareas · calendario · NLP ·    │
│ planificador · focus · progreso · analítica · búsqueda · estimaciones · sync · IO · IA*  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- **La UI nunca escribe entidades directamente.** Usa `src/data/actions.ts`, que concentra las reglas: recurrencia, bandeja, rachas, sesiones de focus…
- **El store mantiene todo en memoria**, de modo que leer es instantáneo. Escribe en disco en lotes, unos 180 ms después de cada cambio y al ocultar la ventana.
- **Ninguna capa depende del backend.** El motor de sync (`src/core/sync/engine.ts`) habla con un `Transport` intercambiable.

## Modelo de datos

Las entidades están en `src/core/types.ts`: `Task`, `CalendarEvent`, `Project`, `Area`, `Goal`, `Milestone`, `Habit`, `HabitLog`, `Routine`, `RoutineRun`, `Note`, `Tag`, `FocusSession`, `TimeEntry`, `DayLog` (sueño, energía, reflexión, diario), `Checkin`, `WeeklyReview`, `Conflict` y `Preferences`.

Reglas:

- **`LocalDate` flotante** para tareas y hábitos: "el martes" sigue siendo martes aunque viajes.
- **Instante + zona IANA** para eventos. Las repeticiones conservan la hora de pared en su zona aunque cambie el horario de verano.
- **Toda la aritmética de días** se hace sobre números de día UTC, nunca sumando 24 h. Hay tests en 4 zonas, incluida Lord Howe, cuyo cambio de hora es de 30 minutos.
- **`updatedAt` es un HLC** (reloj lógico híbrido), ordenable como texto.
- **Los borrados son lápidas** (`deletedAt`). Nada se borra físicamente, así que todo se puede sincronizar y deshacer.
- **Ids UUIDv7** o deterministas: un registro de hábito es `habitId_fecha`, lo que evita duplicados entre dispositivos.

SQLite usa tres tablas: `entities(type, id, data JSON, updated_at, deleted)`, `outbox(type, id, updated_at)` para la cola de sincronización y `meta(key, value)`.

## Sincronización (diseñada y probada; servidor pendiente)

`syncOnce(replica, transport)` funciona en tres pasos:

1. **Pull** de cambios remotos desde un cursor. Por cada entidad:
   - si no existe en local, se aplica;
   - si la remota es más reciente según el HLC, se aplica;
   - si cambió en ambos lados con contenido distinto, es un **conflicto**: se aplica la versión más reciente y la otra se guarda en `conflicts` para revisarla. **Nunca se borra nada en silencio.**
2. **Push** de la cola local.
3. **Acuse**: solo se retiran de la cola los cambios no modificados después de subirlos.

`MemorySyncServer` tiene la misma semántica que el backend real y se usa en los tests: convergencia, cambios sin conexión, relojes desajustados, lápidas y duplicados.

**Backend previsto:** API HTTP con dos endpoints (`POST /sync/push`, `GET /sync/pull?cursor=`), autenticación (email, Apple, Google) y almacenamiento por usuario. El cifrado de extremo a extremo es opcional para notas y diario.

## IA (Orbit): interfaz lista, sin conectar

`src/core/ai/service.ts` define `AIService`, independiente del proveedor. El cliente solo hablará con nuestro backend, nunca con el proveedor directamente ni con claves en el paquete. Toda propuesta llega como `ProposedChange[]` y **requiere confirmación**. Mientras tanto, estas funciones son **locales y deterministas**:

- `planDay` y `suggestSlots` en `src/core/scheduler.ts`;
- la entrada natural en `src/core/nlp.ts`;
- el resumen semanal, construido solo con datos registrados;
- las fases sugeridas, con plantillas locales.

## Capa nativa (src-tauri)

- **Bandeja / barra de menús:** muestra las tareas de hoy (las actualiza la UI con `update_tray`), Focus y captura. Durante una sesión de Focus aparece la cuenta atrás junto al icono (`set_tray_title`).
- **Ventana de captura** (`capture`): sin bordes y siempre encima; se abre con ⌃⇧Espacio desde cualquier app. **No escribe en la base de datos**: envía un evento a la ventana principal, que es la única que escribe.
- **Cerrar la ventana principal la oculta**, y la app sigue en la barra de menús para avisos y Focus. Se sale con ⌘Q o desde el menú.
- **Menú de aplicación en español.** Tiene instancia única, recuerda tamaño y posición de la ventana y abre los enlaces en el navegador del sistema.
- **Permisos mínimos** por capability (`src-tauri/capabilities`).

## Extensibilidad prevista

- **Widgets** (WidgetKit en Mac/iPhone, Glance en Android): la app escribirá un JSON de "instantánea de hoy" en un App Group y el widget lo leerá, sin compartir la base de datos. Requiere Xcode completo y una extensión nativa.
- **Apple Watch / Wear OS, extensión de navegador, API pública, Zapier/Make:** se conectarán al backend de sync como un cliente más del mismo protocolo.
- **Calendarios externos (Google, Apple, Outlook) y correo → tarea:** serán módulos `Integration` que produzcan `CalendarEvent` con `source` y `externalId`, el mismo camino que ya usa la importación ICS. Siempre con permiso explícito.
- **Colaboración y proyectos compartidos:** el modelo por entidades con HLC admite añadir `ownerId` y `sharedWith` sin migraciones destructivas.
