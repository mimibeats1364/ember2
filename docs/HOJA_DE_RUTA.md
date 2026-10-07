# Hoja de ruta

Todo lo de esta lista está **pendiente**. La app lo indica como tal o no lo muestra; no hay botones falsos.

## Hecho en la 0.3.0

- ~~Backend de sincronización~~ → **sincronización cifrada de extremo a extremo** sin cuentas, servidor autoalojable de un archivo (que también sirve la app web) y pantalla de conflictos con "Conservar la descartada".
- ~~Orbit (IA)~~ → **Orbit local**: planificar con condiciones en lenguaje natural, aligerar un día imposible, desglosar proyectos, notas → tareas, vaciar la cabeza, "¿qué hago ahora?", "¿cómo voy con…?" y resumen semanal. Siempre como propuestas confirmables y deshacibles.
- ~~Apps móviles~~ (primer paso) → **versión web instalable (PWA)** que funciona sin conexión y se une al Mac con un QR.
- ~~Rutinas~~ → pantalla, modo guiado y rutinas en los datos de ejemplo.

## Próximo

1. **Widgets** para Mac, iPhone y iPad (WidgetKit): Hoy, Hábitos, Focus y Objetivos, leyendo una instantánea JSON en un App Group. Requiere Xcode y una extensión nativa.
2. **App nativa móvil** (Tauri mobile o Expo) cuando la PWA se quede corta: vibración háptica, notificaciones programadas con la app cerrada y widgets.
3. **Planificación semanal con Orbit**: repartir lo pendiente de la semana entre días, no solo un día.
4. **Notificaciones en la versión web** (con permiso) y avisos de "lo siguiente" en el móvil.
5. **Modelo de lenguaje opcional** para Orbit (mismo contrato `AIService`): siempre vía un servidor propio, con permiso y sin entrenar con tus datos.

## Después

- Integraciones de calendario (Google, Apple vía EventKit, Outlook) como módulos con permiso explícito.
- Spotify y Apple Music en Focus, como complemento opcional. Focus nunca dependerá de ellos.
- Correo → tarea con OAuth y permiso explícito.
- Adjuntar archivos a tareas y notas, copiándolos a la carpeta de la app (y cifrados al sincronizar).
- Cifrado de la base de datos local (SQLCipher).
- Auto-actualizaciones firmadas.
- Recordatorios por ubicación, atajos NFC, automatizaciones, Apple Watch / Wear OS, extensión de navegador, colaboración y proyectos compartidos.

## Mejoras conocidas

- Las notificaciones de escritorio se programan mientras Ember está abierto. Cerrar la ventana no lo impide, porque la app sigue en la barra de menús; salir con ⌘Q sí.
- El planificador y Orbit proponen; mover automáticamente cosas importantes requerirá siempre confirmación.
- Patrones y correlaciones exigen una muestra mínima y se expresan como "Tus datos sugieren…".
- La sincronización compara entidades completas (gana la versión más reciente de cada una): dos cambios en campos distintos de la misma tarea, hechos sin conexión en dos dispositivos, generan un conflicto en vez de fusionarse.
