# Servidor de sincronización de Ember

Un único archivo (`sync-server.mjs`), sin dependencias, para sincronizar Ember entre tus
dispositivos. **No puede leer tus datos**: cada registro llega cifrado (AES-GCM 256) con claves
que se derivan de tu código de sincronización en tus dispositivos y nunca salen de ellos.

## Qué ve el servidor

| Ve | No ve |
|---|---|
| Un identificador opaco del espacio (derivado del código) | Tu código ni tus claves |
| El SHA-256 del token de acceso | Títulos, notas, fechas, horas, nombres de proyectos… |
| Cuántos registros hay y su tamaño cifrado | Qué tipo de cosa es cada registro (tarea, hábito…) |
| La marca de tiempo lógica (HLC) de cada versión | Qué ha cambiado dentro de un registro |

## Arrancar en local

```bash
node server/sync-server.mjs
# [ember-sync] escuchando en http://0.0.0.0:8787 · datos en ./ember-sync-data
```

En Ember: **Ajustes → Sincronización → Nuevo espacio**, servidor `localhost:8787`.
Guarda el código que aparece y, en tu otro dispositivo, **Tengo un código**.

## Todo en uno: la app web + la sincronización

Si además le das la app compilada, el mismo servidor la sirve. Con un solo despliegue tienes la
versión instalable para el móvil (PWA) y la sincronización, y desde el Mac puedes pulsar
**Unir otro dispositivo** para enseñar un **QR**: el móvil lo escanea, abre Ember en tu servidor
con el formulario relleno y solo tienes que pulsar **Unirme**.

```bash
npm run build
STATIC_DIR=dist node server/sync-server.mjs
```

> Fuera de `localhost` la app exige **HTTPS**.

## Variables

| Variable | Por defecto | |
|---|---|---|
| `PORT` | `8787` | Puerto |
| `HOST` | `0.0.0.0` | Interfaz |
| `DATA_DIR` | `./ember-sync-data` | Carpeta de datos (un `.jsonl` y un `.auth` por espacio) |
| `MAX_SPACE_MB` | `200` | Tamaño máximo cifrado por espacio |
| `STATIC_DIR` | — | Carpeta de la app compilada (`dist/`) para servirla también |

## Desplegar con HTTPS

Cualquier sitio que ejecute Node 18+ o Docker sirve. Lo importante es tener HTTPS delante y un
volumen persistente para `DATA_DIR`.

**Docker** (app + sincronización en un contenedor; desde la raíz del proyecto):

```bash
docker build -f server/Dockerfile -t ember .
docker run -d --name ember -p 8787:8787 -v ember-data:/data ember
```

**Detrás de Caddy** (certificado automático):

```
sync.tu-dominio.com {
  reverse_proxy localhost:8787
}
```

**Sin dominio**: con [Tailscale](https://tailscale.com) puedes usar `tailscale serve` para tener
`https://tu-equipo.tu-red.ts.net` solo dentro de tu red privada.

## API

| Método | Ruta | |
|---|---|---|
| `GET` | `/v1/health` | `{ ok, service: "ember-sync", version, app }` (`app`: si sirve la app web) |
| `GET` | `/v1/spaces/:space/pull?cursor=N&limit=500` | `{ records: [{ k, v, d }], cursor, more }` · 404 `no_space` si no existe |
| `POST` | `/v1/spaces/:space/push` | Cuerpo `{ records: [{ k, v, d }] }` → `{ accepted, cursor }` |

Siempre con `Authorization: Bearer <token>`. La primera subida a un espacio lo reclama para ese
token; a partir de ahí, otro token recibe 401. Para cada clave `k` se guarda la versión con la
marca `v` mayor (gana la más reciente), igual que el motor de sincronización de la app.

## Copias de seguridad

Basta con copiar `DATA_DIR`. Está cifrado: la copia es tan privada como el servidor. Para
restaurar un dispositivo, únelo de nuevo con tu código.

## Si pierdes el código

No hay forma de recuperarlo (ni nosotros ni el servidor lo conocen). Tus datos siguen en tus
dispositivos: crea un espacio nuevo desde uno de ellos y une los demás.
