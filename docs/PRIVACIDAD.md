# Privacidad

La productividad personal incluye información sensible (diario, ánimo, sueño, objetivos). Por eso Ember se diseña con privacidad por defecto.

## Cómo se tratan tus datos

- **Local primero.** Todo vive en `~/Library/Application Support/app.ember.personalos/ember.db` (SQLite), protegido por tu cuenta de macOS y por FileVault si lo tienes activado.
- **Sin analíticas.** Ember no envía datos de uso, telemetría ni informes de errores.
- **Sin cuentas obligatorias.** Puedes usar Ember sin registrarte.
- **Sin venta de datos ni entrenamiento de IA.** Cuando exista el asistente, tus datos no se usarán para entrenar modelos sin tu consentimiento explícito.
- **Permisos solo cuando hacen falta:**
  - **Notificaciones:** se piden al activarlas, en el onboarding o en Ajustes.
  - **Archivos:** solo los que eliges en los diálogos de exportar e importar.
  - **Atajo global:** se registra solo para la captura rápida.
- **Enlaces externos:** se abren en tu navegador, nunca dentro de la app.
- **Contenido importado:** el Markdown de las notas se muestra con el HTML escapado y solo admite enlaces `http(s)` y `mailto`. Así se evita que contenido importado ejecute código.

## Pendiente (lo indicamos claramente en la app)

- Cifrado adicional de la base de datos (previsto con SQLCipher) y cifrado de extremo a extremo opcional para el diario y las notas al sincronizar.
- Panel de "exportar y borrar mi cuenta" cuando existan cuentas.

## Control

En **Ajustes → Datos** puedes exportarlo todo, importar y **borrar todos los datos**. El borrado pide escribir "BORRAR" para confirmar.
