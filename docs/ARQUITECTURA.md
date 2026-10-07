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

Mientras tanto, la **versión web instalable (PWA)** ya cubre el móvil con la misma UI y la sincronización cifrada. La elección de una app nativa se decidirá con uso real; la arquitectura no impide ninguna de las dos.

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
│ planificador · focus · progreso · analítica · búsqueda · sync cifrada · IO · Orbit      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- **La UI nunca escribe entidades directamente.** Usa `src/data/actions.ts`, que concentra las reglas: recurrencia, bandeja, rachas, sesiones de focus…
- **El store mantiene todo en memoria**, de modo que leer es instantáneo. Escribe en disco en lotes, unos 180 ms después de cada cambio y al ocultar la ventana.
- **Ninguna capa depende del backend.** El motor de sync (`src/core/sync/engine.ts`) habla con un `Transport` intercambiable; sin sincronización configurada, Ember es 100 % local.

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

## Sincronización cifrada de extremo a extremo

Opcional y sin cuentas. Todo sale de un **código de sincronización** aleatorio de 20 caracteres
(~99 bits) que solo conocen tus dispositivos:

```
código ─PBKDF2(210k)─▶ clave maestra ─HKDF─┬─▶ espacio  (id público del buzón en el servidor)
                                            ├─▶ token    (autoriza leer/escribir ese buzón)
                                            ├─▶ AES-GCM 256 (contenido de cada registro)
                                            └─▶ HMAC     (oculta el tipo y el id de cada registro)
```

El servidor guarda registros `{ k, v, d }`: `k` = HMAC(tipo:id), `v` = marca HLC y `d` = contenido
cifrado (con `k` como dato asociado, así un registro no se puede mover a otra clave). No ve
títulos, notas, fechas ni de qué tipo es cada cosa.

| Pieza | Archivo |
|---|---|
| Motor (pull → conflictos → push → acuse) | `src/core/sync/engine.ts` |
| Cifrado y código | `src/core/sync/crypto.ts` |
| Transporte HTTP | `src/core/sync/http.ts` |
| Réplica sobre el store, motor automático, conflictos | `src/data/sync.ts` |
| Servidor (un archivo, sin dependencias) | `server/sync-server.mjs` |

`syncOnce(replica, transport)`:

1. **Pull** desde un cursor. Por cada entidad: si no existe en local, se aplica; si la remota es
   más reciente (HLC), se aplica; si cambió en ambos lados con contenido distinto, es un
   **conflicto**: se aplica la más reciente y la otra se guarda en `conflicts` (Ajustes →
   Sincronización → **Conservar la descartada**). Nunca se borra nada en silencio.
2. **Push** de la cola local (`outbox`). Al conectar un dispositivo se sube todo (fusión).
3. **Acuse**: solo se retiran de la cola los cambios no modificados después de subirlos.

Detalles de la app:

- Lo remoto se aplica sin volver a la cola ni al historial de ⌘Z; si hay un cambio local aún sin
  guardar más reciente, gana el local.
- **Al unirse** a un espacio existente, el dispositivo adopta sus ajustes (nombre, tema…).
- Los conflictos son de cada dispositivo: no viajan.
- Sincroniza al abrir, cada 90 s con la ventana visible, al volver a la ventana, al reconectar y
  unos segundos después de cada cambio.
- Unirse con un código que no existe da `no_space`: no se crea un espacio vacío por error.

El **servidor** se queda, por clave, con la versión de `v` mayor (la misma regla que el motor),
guarda un log append-only con compactación, deja que el primer token reclame el espacio y, con
`STATIC_DIR`, sirve también la app web (un solo despliegue para PWA + sync). Ver
[server/README.md](../server/README.md).

## Orbit: el asistente local

Orbit funciona **en el dispositivo, sin red ni modelos en la nube**. Entiende peticiones en
español e inglés y devuelve **propuestas** (`ProposedChange[]`) que la app enseña con casillas y
aplica en una sola transacción deshacible.

| Pieza | Archivo |
|---|---|
| Intérprete (frase → intención + restricciones) | `src/core/orbit/intent.ts` |
| Notas y listas → tareas (corta por acciones, no por comas) | `src/core/orbit/extract.ts` |
| Habilidades: planificar con condiciones, aligerar, desglosar, qué hago ahora, resumen semanal | `src/core/orbit/skills.ts` |
| Puente con los datos y aplicar | `src/data/orbit.ts` |
| Conversación | `src/features/orbit/` |

Se apoya en piezas que ya existían: el planificador (`src/core/scheduler.ts`, ahora con tope de
minutos), el NLP (`src/core/nlp.ts`), las fases (`src/core/phases.ts`), el progreso y la
analítica. Lo que no es suyo (agenda, rachas, focus, navegación…) lo resuelve la paleta de
comandos (`src/core/commands.ts`).

`src/core/ai/service.ts` define `AIService`; `LocalOrbit` lo implementa. Un proveedor en la nube
sería otra implementación del mismo contrato: siempre a través de un servidor propio, con
permiso y sin claves en el cliente.

## Versión web instalable (PWA)

La misma app compilada (`npm run build`) es una PWA: manifiesto, iconos (incluido el "maskable"),
service worker (`public/sw.js`: la página se pide a la red y, sin conexión, se sirve la última
copia; los archivos con hash, de caché) y accesos directos (Nueva tarea, Focus, Orbit). Guarda en
IndexedDB. Con la sincronización, el móvil comparte datos con el Mac.

## Capa nativa (src-tauri)

- **Bandeja / barra de menús:** muestra las tareas de hoy (las actualiza la UI con `update_tray`), Focus y captura. Durante una sesión de Focus aparece la cuenta atrás junto al icono (`set_tray_title`).
- **Ventana de captura** (`capture`): sin bordes y siempre encima; se abre con ⌃⇧Espacio desde cualquier app. **No escribe en la base de datos**: envía un evento a la ventana principal, que es la única que escribe.
- **Cerrar la ventana principal la oculta**, y la app sigue en la barra de menús para avisos y Focus. Se sale con ⌘Q o desde el menú.
- **Menú de aplicación en español.** Tiene instancia única, recuerda tamaño y posición de la ventana y abre los enlaces en el navegador del sistema.
- **Permisos mínimos** por capability (`src-tauri/capabilities`).

## Extensibilidad prevista

- **Widgets** (WidgetKit en Mac/iPhone, Glance en Android): la app escribirá un JSON de "instantánea de hoy" en un App Group y el widget lo leerá, sin compartir la base de datos. Requiere Xcode completo y una extensión nativa.
- **Apple Watch / Wear OS, extensión de navegador:** se conectarán al servidor de sync como un cliente más del mismo protocolo (con el código, que es lo que da acceso).
- **Calendarios externos (Google, Apple, Outlook) y correo → tarea:** serán módulos `Integration` que produzcan `CalendarEvent` con `source` y `externalId`, el mismo camino que ya usa la importación ICS. Siempre con permiso explícito.
- **Colaboración y proyectos compartidos:** el modelo por entidades con HLC admite añadir `ownerId` y `sharedWith` sin migraciones destructivas.
