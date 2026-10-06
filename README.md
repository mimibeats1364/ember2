# Ember · Tu sistema operativo personal

Ember reúne en un solo lugar **tareas, calendario, hábitos, objetivos, focus, seguimiento del tiempo, notas, estadísticas y reflexión**. Sigue el ciclo **Capturar → Planificar → Concentrarse → Ejecutar → Reflexionar**, para que abras una sola app por la mañana y organices el día en menos de un minuto.

- App nativa para **macOS** (Tauri 2), con una base preparada para Windows, iOS, iPadOS y Android.
- **Local-first**: funciona sin conexión; los datos viven en SQLite en tu Mac.
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
| Notificaciones nativas (categorías, horas de silencio, sin avisos repetidos) | ✅ |
| Barra de menús de macOS con tareas de hoy y cuenta atrás de Focus | ✅ |
| Exportar/importar JSON, CSV, ICS y Markdown | ✅ |
| 8 temas, movimiento y transparencia reducidos, tamaño de texto, atajos configurables, deshacer ⌘Z | ✅ |
| XP, niveles y logros (opcional, desactivado por defecto) | ✅ |
| Sincronización en la nube, cuentas, asistente IA Orbit, integraciones de calendario, widgets, apps móviles | ⏳ Pendiente (ver [hoja de ruta](docs/HOJA_DE_RUTA.md)) |

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
npm test             # tests del núcleo en 4 zonas horarias (incluido DST)
npm run typecheck    # comprobación de tipos
```

## Atajos

| Atajo | Acción |
|---|---|
| ⌘K | Paleta de comandos y búsqueda global |
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
                 focus, analítica, sync, import/export, búsqueda, IA (interfaz). Con tests.
src/data/        Store local-first, adaptadores (SQLite / IndexedDB / memoria), acciones, seed.
src/platform/    Puente nativo (notificaciones, barra de menús, atajo global, archivos, sonido).
src/ui/          Sistema de diseño: tokens, temas, componentes, gráficos, markdown seguro.
src/app/         Shell, navegación, paleta, captura, motores de fondo.
src/features/    Pantallas: today, tasks, calendar, habits, focus, goals, projects, notes,
                 inbox, insights, review, settings, onboarding, editors.
src-tauri/       Capa nativa (Rust): bandeja/menú, captura global, ventanas, plugins.
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
