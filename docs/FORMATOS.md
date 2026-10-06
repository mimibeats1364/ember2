# Formatos de datos

Tus datos son tuyos: todo se puede exportar e importar desde **Ajustes → Datos**.

## Copia completa (JSON)

```json
{
  "format": "ember-backup",
  "version": 1,
  "exportedAt": "2026-10-06T21:00:00.000Z",
  "app": "Ember 0.1.0",
  "data": {
    "tasks": [ { "id": "…", "title": "…", "updatedAt": "<HLC>", "deletedAt": null, … } ],
    "events": [ … ], "projects": [ … ], "areas": [ … ], "goals": [ … ], "milestones": [ … ],
    "habits": [ … ], "habitLogs": [ … ], "routines": [ … ], "routineRuns": [ … ], "notes": [ … ],
    "tags": [ … ], "focusSessions": [ … ], "timeEntries": [ … ], "dayLogs": [ … ], "checkins": [ … ],
    "reviews": [ … ], "prefs": [ … ]
  }
}
```

- Cada entidad sigue los tipos de `src/core/types.ts`. Incluye las lápidas (`deletedAt`) para no "resucitar" lo borrado.
- **Importar fusiona** con la regla "gana el más reciente" (HLC `updatedAt`). Añade lo nuevo, actualiza lo más reciente y **nunca borra** lo que ya tienes.
- Se rechazan con un mensaje claro: archivos que no son JSON, que no son copias de Ember, de versiones más nuevas o dañados.

## Tareas (CSV)

Codificación UTF-8 con BOM y separador `,`. Al importar también se acepta `;`, que es el que usa Excel en español.

| Columna | Ejemplo | Notas |
|---|---|---|
| `id` | 01a1… | Se ignora al importar |
| `titulo` | Estudiar marketing | **Obligatoria** (también vale `title`, `tarea`, `task`, `name`) |
| `estado` | todo | backlog · todo · in_progress · done · dropped |
| `prioridad` | P1 | P1–P4 o 1–4 |
| `fecha` | 2026-10-07 | Día planificado (AAAA-MM-DD) |
| `hora` | 09:30 | HH:mm |
| `duracion_min` | 90 | Minutos |
| `fecha_limite` | 2026-10-09 | |
| `proyecto` | Marketing | Si no existe, se crea |
| `area` | Universidad | Si no existe, se crea |
| `etiquetas` | examen; urgente | Separadas por `;` o `,` |
| `notas` | Texto libre | Admite saltos de línea entre comillas |
| `completada` | 2026-10-05T18:00:00Z | Instante de finalización |

Las cabeceras en inglés (`title`, `status`, `priority`, `date`, `time`, `duration`, `deadline`/`due`, `project`, `area`, `tags`, `notes`, `completed`) también se reconocen.

## Calendario (ICS, RFC 5545)

- **Exporta** eventos como `VEVENT` (con `RRULE` FREQ/INTERVAL/BYDAY/BYMONTHDAY/UNTIL y `EXDATE`) y las tareas con fecha como `VTODO` (`DTSTART`, `DUE`, `PRIORITY`, `STATUS`). Las líneas se pliegan a 75 octetos.
- **Importa** `VEVENT` con `DTSTART`/`DTEND`:
  - en UTC (`Z`), con `TZID` o de día completo (`VALUE=DATE`);
  - con `RRULE` básicas y `EXDATE`.
- Si vuelves a importar el mismo archivo, se actualizan los eventos con el mismo `UID` en lugar de duplicarse.

## Notas y diario (Markdown)

Un solo archivo `.md` con tres secciones:

- **Notas:** título, tipo, fecha, etiquetas y cuerpo.
- **Diario:** valoraciones ★, intención, logro, mejora y texto libre.
- **Proyectos:** checklist de tareas con su estado.
