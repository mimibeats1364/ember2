# Ember · Tu sistema operativo personal

Ember reúne en un solo lugar **tareas, calendario, hábitos, objetivos, focus, seguimiento del tiempo, notas, estadísticas y reflexión**. Sigue el ciclo **Capturar → Planificar → Concentrarse → Ejecutar → Reflexionar**, para que abras una sola app por la mañana y organices el día en menos de un minuto.

- App nativa para **macOS** (Tauri 2) y **versión web instalable** (PWA) para iPhone, iPad, Android y cualquier ordenador.
- **Local-first**: funciona sin conexión; los datos viven en tu dispositivo (SQLite en el Mac).
- **Orbit**, un asistente que entiende lo que le pides con tus palabras y funciona **sin conexión**.
- **Sincronización cifrada de extremo a extremo**, sin cuentas, con tu propio servidor.
- Interfaz en **español** (inglés incluido) e inspirada en el lenguaje visual del Reel de referencia: negro profundo, rojo brasa con brillo y la rejilla multicolor de hábitos.

## Qué funciona hoy

| Área | Estado |
|---|---|
| Hoy (AHORA / SIGUIENTE, agenda, progreso, hábitos, objetivo principal, mañana/noche) | ✅ |
| Tareas (vistas inteligentes, filtros, Eisenhower con arrastre, subtareas, checklist, dependencias, recurrencia, recordatorios, enlaces) | ✅ |
| Entrada inteligente en español e inglés ("Estudiar derecho mañana 90 min p1") | ✅ |
| Bandeja de entrada y captura rápida (N, ⌘K, ⌃⇧Espacio global, botón flotante) | ✅ |
| Calendario mes/semana/día/agenda, arrastrar, redimensionar, crear arrastrando, tareas sin programar | ✅ |
| Time blocking, buscar hueco, planificar mi día (local, determinista, explicable) | ✅ |
| Hábitos: rachas sin castigo (días de gracia, saltar, vacaciones), rejilla mensual, estadísticas, mapa de calor, cadenas | ✅ |
| Focus: Pomodoro 25/5·50/10·90/20, trabajo profundo, sonidos generados, modo inmersivo, interrupciones sin penalizar | ✅ |
| Seguimiento de tiempo (temporizador, manual, focus) y planificado vs. real | ✅ |
| Objetivos (año/trimestre/mes/semana), hitos, ritmo, línea de tiempo y "La línea de tu vida" | ✅ |
| Proyectos y áreas: salud explicada, lista/tablero/cronograma/calendario, fases sugeridas, panel "Vida" | ✅ |
| Notas Markdown, checklists interactivas, [[enlaces]], menciones inversas, checklist → tareas | ✅ |
| Estadísticas descriptivas, patrones con muestra mínima, "Mi año" | ✅ |
| Reflexión diaria, revisión semanal con resumen de datos, Reset semanal, diario | ✅ |
| **Orbit**: planificar con condiciones ("nada después de las 20, prioriza marketing"), aligerar un día imposible, desglosar proyectos, notas → tareas, vaciar la cabeza, "¿qué hago ahora?", "¿cómo voy con…?", resumen semanal | ✅ |
| Rutinas guiadas (mañana, trabajo, estudio, noche) con hábitos vinculados | ✅ |
| Aviso de día imposible y cierre del día sin culpa (pasar lo pendiente a mañana) | ✅ |
| Notificaciones nativas (categorías, horas de silencio, sin avisos repetidos) | ✅ |
| Barra de menús de macOS con tareas de hoy y cuenta atrás de Focus | ✅ |
| Exportar/importar JSON, CSV, ICS y Markdown | ✅ |
| 8 temas, movimiento y transparencia reducidos, tamaño de texto, atajos configurables, deshacer ⌘Z | ✅ |
| XP, niveles y logros (opcional, desactivado por defecto) | ✅ |
| Sincronización cifrada de extremo a extremo, sin cuentas, servidor autoalojable, conflictos recuperables, unir el móvil con un QR | ✅ |
| Versión web instalable (PWA) que funciona sin conexión | ✅ |
| Tutorial interactivo "Aprende" (26 lecciones), recorrido guiado y chuleta de atajos | ✅ |
| Enlaces `ember://` para Atajos de Apple, Raycast y Alfred, e isla flotante de Focus | ✅ |
| Integraciones de calendario, widgets, apps móviles nativas, modelo de lenguaje opcional para Orbit | ⏳ Pendiente (ver [hoja de ruta](docs/HOJA_DE_RUTA.md)) |

Lo pendiente **no se muestra como si funcionara**: aparece marcado como "Pendiente" o no aparece.

## Requisitos

- macOS 11+ (Apple Silicon o Intel)
- Node.js 24 LTS (instalado en `~/.local/node`; añade `~/.local/node/bin` a tu `PATH`)
- Rust estable (`~/.cargo/bin`) y Xcode Command Line Tools

```bash
export PATH="$HOME/.local/node/bin:$HOME/.cargo/bin:$PATH"
```

## Comandos

```bash
npm install          # dependencias
npm run dev          # versión web en http://localhost:1420 (usa IndexedDB)
npm run app:dev      # app nativa en modo desarrollo (recarga en caliente)
npm run app:build    # genera src-tauri/target/release/bundle/macos/Ember.app
npm test             # 153 tests en 4 zonas horarias (incluido DST)
npm run typecheck    # comprobación de tipos
npm run sync-server  # servidor de sincronización en http://localhost:8787 (ver server/README.md)
```

### Sincronizar y usar Ember en el móvil

1. Despliega el servidor con HTTPS. Lo más cómodo es el contenedor "todo en uno", que sirve la
   app web y la sincronización: `docker build -f server/Dockerfile -t ember .` (guía completa en
   [server/README.md](server/README.md)).
2. En el Mac: **Ajustes → Sincronización → Nuevo espacio**, escribe la dirección y guarda el código.
3. Pulsa **Unir otro dispositivo** y escanea el QR con el móvil: abre Ember, pulsa **Unirme** y
   añádela a la pantalla de inicio. Listo: los mismos datos, cifrados, en los dos.

## Atajos

| Atajo | Acción |
|---|---|
| ⌘K | Paleta de comandos y búsqueda global |
| ⌘J | Hablar con Orbit |
| ⌃⇧Espacio | Captura rápida desde cualquier app (global) |
| N | Nueva tarea · F Focus · H Hábitos · C Calendario · G Objetivos · P Proyectos · T Hoy · L Tareas · / Buscar |
| Espacio | Pausar/reanudar Focus |
| ⌘Z | Deshacer |
| ⌘1…⌘5 | Hoy, Tareas, Calendario, Hábitos, Focus |
| ⌘, | Ajustes |

Los atajos de una tecla se pueden cambiar en Ajustes → Atajos.

## Estructura

```
src/core/        Dominio puro (sin UI): fechas, recurrencia, hábitos, NLP, planificador,
                 focus, analítica, sync cifrada, import/export, búsqueda, Orbit. Con tests.
src/data/        Store local-first, adaptadores (SQLite / IndexedDB / memoria), acciones, seed,
                 puentes de Orbit y de la sincronización.
src/platform/    Puente nativo (notificaciones, barra de menús, atajo global, archivos, sonido) y PWA.
src/ui/          Sistema de diseño: tokens, temas, componentes, gráficos, markdown seguro.
src/app/         Shell, navegación, paleta, captura, motores de fondo.
src/features/    Pantallas: today, tasks, calendar, habits, routines, focus, goals, projects,
                 notes, inbox, insights, review, learn, orbit, settings, onboarding, editors.
src-tauri/       Capa nativa (Rust): bandeja/menú, captura global, ventanas, isla, plugins.
server/          Servidor de sincronización (un archivo, sin dependencias) + Dockerfile.
public/          Manifiesto, iconos y service worker de la versión web instalable.
docs/            Arquitectura, diseño, formatos, privacidad, publicación, QA, hoja de ruta.
```

## Documentación

- [Arquitectura y decisión de stack](docs/ARQUITECTURA.md)
- [Diseño: análisis del Reel y sistema de diseño](docs/DISENO.md)
- [Formatos de datos (JSON, CSV, ICS, Markdown)](docs/FORMATOS.md)
- [Privacidad](docs/PRIVACIDAD.md)
- [Publicación en tiendas](docs/PUBLICACION.md)
- [QA: pruebas y resultados](docs/QA.md)
- [Hoja de ruta](docs/HOJA_DE_RUTA.md)
- [Tutorial completo](docs/TUTORIAL.md)
- [Servidor de sincronización](server/README.md)
