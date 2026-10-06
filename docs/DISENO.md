# Diseño

## 1. Análisis del Reel de referencia

**Fuente:** Instagram, @starklab.ia ("Laboratorio Stark"), vídeo de 19 s publicado el 4 de septiembre de 2026. Lo analicé fotograma a fotograma desde el vídeo público del post, sin descargarlo, y medí los colores píxel a píxel.

| Tiempo | Contenido |
|---|---|
| 0–4 s | Gancho: una persona se sienta al escritorio con un portátil. Rótulo blanco con una palabra en rojo ("IMPOSIBLE"). |
| 4,5–7,5 s | "Tareas Diarias": gráfico de área con línea roja y degradado. Debajo, "Registro de hábitos": filas de hábitos con icono y columnas de días. Al marcar, cada celda se rellena de color con un ✓ y el porcentaje sube en directo (2 % → 26 %). |
| 8–9 s | Variante negra: barra lateral (Panel, Tareas, Hábitos, Metas, Finanzas, Foco, Conquistas, Notas…), curva roja neón con brillo y burbujas rojas brillantes con ✓. |
| 10 s | "Metas": chips de filtro (activo en rojo relleno) y tarjetas con foto de portada, etiqueta de categoría, barra de progreso verde y botón "Actualizar progreso". |
| 11–12 s | "Logros": XP, niveles y tarjetas de logro con barra de progreso. |
| 13–14 s | "Finanzas": cifras en monoespaciada y tarjetas con borde de color a la izquierda. |
| 15 s | Notificación en el iPhone ("Reunión programada…"). |
| 16–19 s | Rejilla de hábitos multicolor con brillo y "57 % Progreso Marzo" grande arriba a la derecha. |

**Paleta medida:**

- Fondo: #000 y #0A0A0A, con superficies grafito (~#141416).
- Acento: rojo brasa #F23D15 / #E7353E.
- Colores de hábito: coral #E55E70, magenta #EA4BB2, violeta #7F5AEF, cian #66DBE4, menta #6DE78C, verde #46DA68, ámbar #E6C030 y naranja #F28F19.

**Patrones de interacción:**

- Recompensa inmediata: celda → color → ✓ → el porcentaje y la curva se actualizan.
- Chips de filtro.
- Tarjetas con portada.
- Barra lateral con estado activo en rojo.

### Qué adoptamos y qué no

- **Adoptamos:**
  - el negro profundo, el rojo brasa con brillo y la curva con relleno degradado;
  - la rejilla de hábitos que se ilumina con el color de cada hábito;
  - el porcentaje grande;
  - los chips activos en rojo;
  - las tarjetas de objetivo con portada;
  - los números en monoespaciada;
  - la barra lateral con indicador luminoso.
- **No adoptamos** el enfoque de "volverte adicto" ni la gamificación invasiva. La gamificación es opcional y está desactivada por defecto, y no hay "puntuación de productividad". El tono de Ember es calmado, descriptivo y sin castigo.

## 2. Sistema de diseño

Todo sale de `src/ui/styles/tokens.css`: no hay colores ni medidas sueltas por pantalla.

- **Color:** `--bg`, `--bg-elev`, `--surface` (de 1 a 3), `--line`, `--text` (de 1 a 3), `--accent` / `--accent-2` / `--accent-rgb`, `--glow`, `--success`, `--warning` (ámbar suave para lo atrasado, nunca rojo agresivo), `--danger`. Paleta de hábitos y categorías en `src/ui/theme/palette.ts`.
- **Temas (8):**
  - **Ember** (principal, el del Reel);
  - Midnight, Cosmic, Forest, Ocean, Minimal, Claro y OLED negro.
- **Tipografía**, empaquetada y disponible sin conexión:
  - *Inter Tight* 800 para títulos (gruesa y compacta, como en el Reel);
  - *Inter* para el texto;
  - *JetBrains Mono* para cifras y temporizadores.
- **Escala:** 11 / 12 / 13 / 14,5 / 16 / 19 / 24 / 32 / 42 px. El texto escala con `--text-scale`.
- **Espaciado** en base 4. **Radios:** 6, 9, 12, 16, 20 y 26 px.
- **Profundidad:**
  - sombras suaves y un brillo de acento solo en los elementos clave (AHORA, botón principal, celdas hechas);
  - vidrio (`backdrop-filter`) en paleta, modales y avisos.
- **Movimiento:**
  - entre 120 y 340 ms, con easing `cubic-bezier(.2,.8,.2,1)` y resorte para el ✓;
  - aparición progresiva escalonada;
  - chispas breves al completar, sin confeti;
  - fondo de partículas muy sutil, a 30 fps y pausado si la ventana está oculta.
- **Componentes:** botones, tarjetas (normal, vidrio y brillo), chips, controles segmentados, campos, casilla de tarea por prioridad, celda de hábito (estados hecho, parcial, saltado, vacaciones, no toca y futuro), anillo, barra, gráficos SVG (área con brillo, barras, mapa de calor), modal accesible, popover/menú contextual, hoja móvil, avisos y estados vacíos útiles.

## 3. Disposición por tamaño

| Ancho | Navegación | Contenido |
|---|---|---|
| ≥ 1100 px (escritorio) | Barra lateral completa con proyectos | Contenido + panel contextual a la derecha (detalle de tarea) |
| 720–1100 px (tableta) | Barra lateral compacta, solo iconos | El panel se abre como cajón superpuesto |
| < 720 px (móvil) | Barra inferior (Hoy, Tareas, Calendario, Hábitos, Más) + botón flotante | Modales como hojas inferiores; calendario en vista Día |

## 4. Accesibilidad

- Navegación completa por teclado, foco visible y trampa de foco en los modales.
- Roles y `aria-*` en los controles personalizados: casillas, celdas, pestañas, interruptores y diálogos.
- Contraste comprobado en todos los temas. En los temas claros de acento (Forest, Ocean, Minimal) el texto sobre el acento es oscuro.
- **Movimiento reducido** (sistema o manual): sin partículas, sin bucles y transiciones de 1 ms.
- **Transparencia reducida:** las superficies de vidrio pasan a ser sólidas.
- Texto escalable del 90 % al 125 %.
- La vibración háptica queda prevista para móvil; en Mac no aplica.
