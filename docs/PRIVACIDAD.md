# Privacidad

La productividad personal incluye información sensible (diario, ánimo, sueño, objetivos). Por eso Ember se diseña con privacidad por defecto.

## Cómo se tratan tus datos

- **Local primero.** En el Mac todo vive en `~/Library/Application Support/app.ember.personalos/ember.db` (SQLite), protegido por tu cuenta de macOS y por FileVault si lo tienes activado. En la versión web (y la instalada en el móvil), en el almacenamiento del navegador de ese dispositivo.
- **Sin analíticas.** Ember no envía datos de uso, telemetría ni informes de errores.
- **Sin cuentas.** Ni para usar Ember ni para sincronizar.
- **Orbit es local.** El asistente funciona en tu dispositivo, sin conexión y sin modelos en la nube: tus peticiones no salen de él. Solo propone; nada cambia hasta que lo aplicas.
- **Sin venta de datos ni entrenamiento de IA.** Si algún día hay un modelo en la nube, será opcional, a través de un servidor propio y sin usar tus datos para entrenar.
- **Permisos solo cuando hacen falta:**
  - **Notificaciones:** se piden al activarlas, en el onboarding o en Ajustes.
  - **Archivos:** solo los que eliges en los diálogos de exportar e importar.
  - **Atajo global:** se registra solo para la captura rápida.
- **Enlaces externos:** se abren en tu navegador, nunca dentro de la app.
- **Contenido importado:** el Markdown de las notas se muestra con el HTML escapado y solo admite enlaces `http(s)` y `mailto`. Así se evita que contenido importado ejecute código.

## Sincronización (opcional, cifrada de extremo a extremo)

Desactivada por defecto. Si la activas:

- Todo se **cifra en tu dispositivo** (AES-GCM 256) antes de salir, con claves que se derivan de tu **código de sincronización**. El código no viaja nunca; al servidor solo llega un token derivado, del que guarda únicamente su SHA-256.
- El servidor **no puede leer** títulos, notas, diario, horas, nombres de proyectos ni qué tipo de cosa es cada registro.
- Sí ve **metadatos**: un identificador opaco del espacio, cuántos registros hay, su tamaño cifrado, cuándo cambian (marca HLC) y la dirección IP desde la que conectas.
- Quien tenga tu código puede leer lo que sincronizas: guárdalo en tu gestor de contraseñas y enseña el QR solo a tus dispositivos. Si abres un enlace para unirte, la app te avisa y nunca se une sola.
- Puedes usar **tu propio servidor** (`server/`, un archivo sin dependencias). Fuera de `localhost` la app exige HTTPS.
- **Borrar todos los datos** en un dispositivo no borra los de los demás: ese dispositivo deja de sincronizar.
- Si pierdes el código, nadie puede recuperarlo. Tus datos siguen en tus dispositivos: crea un espacio nuevo desde uno y une los demás.

## Pendiente (lo indicamos claramente en la app)

- Cifrado adicional de la base de datos local (previsto con SQLCipher).

## Control

En **Ajustes → Datos** puedes exportarlo todo, importar y **borrar todos los datos**. El borrado pide escribir "BORRAR" para confirmar. En **Ajustes → Sincronización** puedes desconectar un dispositivo en cualquier momento (sus datos se quedan).
