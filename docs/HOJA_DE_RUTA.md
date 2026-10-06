# Hoja de ruta

Todo lo de esta lista está **pendiente**. La app lo indica como tal o no lo muestra; no hay botones falsos.

## Próximo

1. **Backend de sincronización.** El motor y su protocolo ya están probados; falta el servidor (HTTP push/pull), las cuentas (email, Apple, Google) y la pantalla de conflictos con "conservar esta versión".
2. **Orbit (IA).** Implementar `AIService` contra un proxy propio: planificar con lenguaje libre, desglosar proyectos, convertir notas en tareas y resumir semanas. Siempre como propuestas que hay que confirmar.
3. **Widgets** para Mac, iPhone y iPad (WidgetKit): Hoy, Hábitos, Focus y Objetivos, leyendo una instantánea JSON en un App Group.
4. **Apps móviles** (iOS, iPadOS, Android) con Tauri mobile o Expo, más vibración háptica y notificaciones programadas.
5. **Rutinas** (mañana, trabajo, estudio, noche) en modo checklist. El modelo de datos `Routine`/`RoutineRun` ya existe; falta la pantalla.

## Después

- Integraciones de calendario (Google, Apple vía EventKit, Outlook) como módulos con permiso explícito.
- Spotify y Apple Music en Focus, como complemento opcional. Focus nunca dependerá de ellos.
- Correo → tarea con OAuth y permiso explícito.
- Adjuntar archivos a tareas y notas, copiándolos a la carpeta de la app.
- Cifrado de la base de datos (SQLCipher) y cifrado de extremo a extremo opcional.
- Auto-actualizaciones firmadas.
- Recordatorios por ubicación, atajos NFC, automatizaciones, API pública, Zapier/Make, Apple Watch / Wear OS, extensión de navegador, colaboración y proyectos compartidos.

## Mejoras conocidas

- Las notificaciones de escritorio se programan mientras Ember está abierto. Cerrar la ventana no lo impide, porque la app sigue en la barra de menús; salir con ⌘Q sí.
- El planificador propone; mover automáticamente cosas importantes requerirá siempre confirmación.
- Patrones y correlaciones exigen una muestra mínima y se expresan como "Tus datos sugieren…".
