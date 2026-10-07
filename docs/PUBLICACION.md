# Publicación (preparación; nada se publica sin tu autorización)

## Identidad

- **Nombre:** Ember (nombre de trabajo; se cambia en `src-tauri/tauri.conf.json` → `productName`).
- **Identificador:** `app.ember.personalos`. Cámbialo por un dominio tuyo antes de publicar, por ejemplo `com.tudominio.ember`.
- **Iconos:**
  - origen en `assets/brand/icon.svg`;
  - se generan con `node scripts/render-icons.mjs && npx tauri icon assets/brand/icon-1024.png`;
  - incluyen `.icns`, `.ico`, PNG, Android e iOS;
  - el icono de la barra de menús es una plantilla monocroma.
- **Splash:** orbe mínimo en `index.html` que desaparece al cargar, sin animaciones largas.

## macOS (distribución directa / notarizada)

1. Cuenta de Apple Developer y certificado "Developer ID Application".
2. Variables de entorno para la firma: `APPLE_SIGNING_IDENTITY`, y para la notarización `APPLE_ID`, `APPLE_PASSWORD` (contraseña de app) y `APPLE_TEAM_ID`.
3. `npx tauri build --bundles app,dmg`. Tauri firma y notariza si esas variables están definidas.
4. **Auto-actualizaciones:** añadir `tauri-plugin-updater`, generar claves con `npx tauri signer generate` y publicar `latest.json`. Pendiente; requiere un servidor.

## Mac App Store

- Requiere el sandbox de App Sandbox. Entitlements necesarios:
  - `com.apple.security.app-sandbox`;
  - `com.apple.security.files.user-selected.read-write` (exportar e importar);
  - `com.apple.security.network.client` (para la sincronización, que es opcional).
- El atajo global ⌃⇧Espacio está permitido (usa `RegisterEventHotKey`, sin accesibilidad).
- No se usa `macOSPrivateApi`, así que la app es compatible con la App Store.
- **Privacidad (App Store Connect):** "Datos no recopilados". La sincronización va cifrada de extremo a extremo a un servidor que elige el usuario (por defecto ninguno), así que el desarrollador no recopila datos.

## Microsoft Store / Windows

- El mismo código. `npx tauri build` genera MSI o NSIS. Para la Store, empaquetar como MSIX y firmar.
- Bandeja del sistema, atajo global y notificaciones funcionan con los mismos plugins. Hay que probar en Windows 10 y 11, porque WebView2 se comporta distinto que WebKit.

## Versión web instalable (PWA): ya disponible

- `npm run build` genera `dist/` con el manifiesto, los iconos y el service worker.
- Se puede publicar en cualquier hosting estático con HTTPS, o con el propio servidor de
  sincronización (`STATIC_DIR=dist` o el `server/Dockerfile`, que hace las dos cosas).
- En iPhone/iPad se instala desde Safari (Compartir → Añadir a pantalla de inicio); en Android y
  escritorio, con "Instalar app" de Chrome/Edge.
- Si cambias de dominio, cada dispositivo vuelve a empezar con sus datos en blanco (el almacenamiento
  es por dominio): únelo de nuevo con el código de sincronización.

## iOS / iPadOS / Android nativas (plan)

- **Opción A:** Tauri 2 mobile (`npx tauri ios init` / `android init`). Reutiliza la UI, la barra inferior y el botón flotante, que ya están diseñados.
- **Opción B:** Expo con la UI nativa reutilizando `src/core`.
- **Permisos e `Info.plist`:**
  - `NSUserNotificationsUsageDescription` (en iOS se pide con `UNUserNotificationCenter`);
  - no hace falta cámara, ubicación ni micrófono.
  - Texto sugerido: "Ember te avisa de lo que tú planificas: bloques, hábitos y fechas límite."
- **Widgets:** WidgetKit (Swift) y Glance (Kotlin) leyendo una instantánea JSON en un App Group. Requiere Xcode completo.
