# QA · resultados

Fecha: 6 de octubre de 2026 · macOS 27 (Apple Silicon) · Node 24.21 · Rust 1.99 · Tauri 2.12

## Tests automáticos

`npm test` ejecuta **90 tests** en **4 zonas horarias**: Europe/Madrid, America/New_York, Australia/Lord_Howe (cambio de hora de 30 minutos) y Asia/Kolkata (sin cambio de hora). **Resultado: 90/90 en cada zona.**

| Suite | Cubre |
|---|---|
| `dates.test.ts` | Suma de días cruzando cambios de hora, fin de mes, años bisiestos, semanas ISO, días de 23/24/25 h, zonas IANA |
| `recurrence.test.ts` | Diaria/semanal/mensual/anual, intervalos, 31 → último día del mes, 29 de febrero, fecha final, eventos recurrentes a las 08:00 de Madrid antes y después del cambio de hora, exclusiones |
| `habits.test.ts` | Rachas, días de gracia, saltar a propósito, vacaciones, progreso parcial, días programados, hábitos flexibles por semanas, tasas, cadenas |
| `nlp.test.ts` | 18 frases en español e inglés: fechas, horas, rangos, duraciones, fechas límite, repeticiones, prioridades, #proyectos/#etiquetas |
| `scheduler.test.ts` | Huecos con margen, "ahora" redondeado, sugerencias antes de la fecha límite con preferencia por la mañana, división en bloques, planificar el día |
| `focus.test.ts` | Pausas exactas, transiciones con la app suspendida, descanso largo, trabajo profundo, interrupción sin perder tiempo, saltar fase |
| `tasks.test.ts` | Atrasadas visibles, vistas inteligentes, Eisenhower respetando la elección del usuario, recurrencia sin fechas pasadas, salud de proyecto, progreso de objetivo, búsqueda difusa, aprendizaje de estimaciones |
| `sync/engine.test.ts` | Convergencia entre dispositivos sin conexión, conflicto conservado, reloj desajustado, lápidas, ids deterministas sin duplicados |
| `io/io.test.ts` | CSV ida y vuelta (comas, comillas, saltos de línea, `;`, cabeceras en inglés), ICS ida y vuelta, TZID, día completo, líneas plegadas, fusión de copias sin borrar, errores claros |
| `data/actions.test.ts` | QA de producto integrado (lista de abajo) |

## QA de producto

✅ = verificado con test de integración y/o manualmente en la app.

| Flujo | Estado | Cómo |
|---|---|---|
| Crear tarea | ✅ | Test + captura N / ⌘K / fila "Añadir" |
| Completar tarea (animación, aviso, deshacer) | ✅ | Test + manual |
| Reprogramar tarea | ✅ | Test + menú contextual / atrasadas → Hoy / Mañana |
| Tarea recurrente → siguiente instancia | ✅ | Test |
| Crear hábito (captura natural y editor) | ✅ | Test + manual ("Gimnasio L, X, V 18:00") |
| Completar hábito (celda de color + racha) | ✅ | Test + manual |
| Crear proyecto / objetivo | ✅ | Test + editores |
| Iniciar / pausar / terminar Focus | ✅ | Test + manual (modo inmersivo, Espacio, detener con nota) |
| Crear evento / mover evento | ✅ | Test + arrastrar en la rejilla semanal |
| Buscar (⌘K) | ✅ | Test + manual (resultados al instante, sin tildes, difusa) |
| Filtrar (prioridad, proyecto, área, etiqueta) | ✅ | Test + manual |
| Sin conexión | ✅ | Sin dependencias de red; SQLite en el Mac; fuentes y sonidos locales |
| Reconectar | ⏳ | El motor de sync está probado con un servidor simulado; falta el backend real |
| Exportar | ✅ | Test (JSON) + diálogos nativos (JSON/CSV/ICS/Markdown) |
| Importar | ✅ | Test (fusión sin borrar, CSV, ICS) |

## Revisión visual (navegador a 1440×900 y 375×812)

| Pantalla | Resultado |
|---|---|
| Onboarding | ✅ |
| Hoy | ✅ |
| Hábitos (Hoy, Mes con la rejilla del Reel) | ✅ |
| Calendario semana | ✅ |
| Objetivos | ✅ |
| Proyectos | ✅ |
| Notas | ✅ |
| Estadísticas | ✅ |
| Focus (preparación, inmersivo, final) | ✅ |
| Paleta ⌘K | ✅ |
| Captura | ✅ |
| Ajustes → Datos | ✅ |
| Móvil: barra inferior + botón flotante | ✅ |

Defectos encontrados y corregidos durante la revisión:

- **Doble inicialización** del almacenamiento por el modo estricto de React → la inicialización ahora es idempotente.
- **Rejilla del modo inmersivo de Focus**: reservaba la columna de la barra lateral → corregido.
- **Autoguardado al abrir** una nota o tarea sin cambios, que generaba cambios de sync falsos → ahora solo guarda si el contenido difiere.
- **"Sesión completada"** al cortar a los pocos segundos → "Sesión terminada" o "no se ha guardado" (menos de 30 s).
- **Datos de ejemplo** con registros en días no programados, que daban una racha irreal de 61 días → corregido.
- **Regla "En riesgo"** demasiado estricta (2 tareas en 26 días) → ahora se basa en el ritmo necesario, el plazo y la inactividad; test añadido.
- **Decimales** con punto en español → `formatNumber`.
- **Plurales** ("1 tareas") → claves `_one` / `_other`.
- **Texto en español escrito en el código** → movido al diccionario.
- **"Por detrás del calendario"** en color de alerta → estilo neutro, sin ansiedad.

## App nativa (macOS)

- `npm run app:build` genera `Ember.app` de **6,3 MB**.
- La app se abre, crea `~/Library/Application Support/app.ember.personalos/ember.db` (SQLite, WAL) y guarda las preferencias.
- **Sin verificar:** la apariencia de la ventana nativa no se pudo capturar automáticamente, porque macOS no da permiso de grabación de pantalla a este proceso. Usa la misma UI ya revisada en el navegador.
- **Comprobar a mano tras instalar:**
  - menú de la barra superior con las tareas de hoy;
  - ⌃⇧Espacio desde otra app;
  - notificación de prueba en Ajustes;
  - cuenta atrás de Focus en la barra de menús.

## QA de plataforma (conceptual)

| Plataforma | Estado |
|---|---|
| macOS | Probado (build y arranque). WKWebView. Bandeja con icono plantilla. Atajo global sin permisos de accesibilidad. |
| Windows | El mismo código. WebView2. La bandeja usa el menú en lugar del título junto al icono (`set_tray_title` es solo de macOS). Revisar DnD con `dragDropEnabled: false` (ya configurado). |
| iOS / iPadOS | Pendiente. En móvil no hay atajo global ni bandeja; notificaciones programadas con permiso; vibración háptica en completar, hábito y temporizador. |
| Android | Pendiente. El mismo diseño móvil (barra inferior y botón flotante) ya existe en la UI. |
