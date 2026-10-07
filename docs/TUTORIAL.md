# Tutorial de Ember

> Este documento se genera con `npm run docs:tutorial` a partir de las lecciones de la pantalla **Aprende** de la app.
> Cada frase, comando, enlace y atajo que aparece aquí está comprobado por los tests automáticos (`src/features/learn/lessons.test.ts`).

Dentro de Ember tienes este mismo tutorial, interactivo, en **Aprende** (barra lateral). Además:

- <kbd>?</kbd> abre la chuleta de atajos en cualquier pantalla.
- En la paleta <kbd>⌘K</kbd>, escribe "recorrido guiado" para ver el recorrido de un minuto.

## Índice

- 🧭 **Primeros pasos**
  - [Cómo funciona Ember](#welcome)
  - [La paleta ⌘K](#palette)
- ⚡ **Capturar**
  - [Captura en lenguaje natural](#capture)
  - [La Bandeja](#inbox)
  - [Captura desde cualquier app](#globalCapture)
- 🗓️ **Planificar**
  - [Tareas a fondo](#tasks)
  - [Planifica tu día en 10 segundos](#planDay)
  - [Orbit, tu asistente](#orbit)
  - [Calendario y bloques de tiempo](#calendar)
- 🎯 **Enfocarte**
  - [Focus: pomodoro y trabajo profundo](#focus)
  - [Aparca las distracciones](#park)
  - [La isla de Focus](#island)
- 🔥 **Hábitos y rutinas**
  - [Hábitos sin culpa](#habits)
  - [Rutinas guiadas](#routines)
- 🗂️ **Organizar**
  - [Objetivos y proyectos](#goals)
  - [Notas y segundo cerebro](#notes)
- 🌙 **Reflexionar**
  - [Revisión diaria y semanal](#review)
  - [Estadísticas que explican](#insights)
- ⌨️ **Comandos y atajos**
  - [Habla con Ember](#commands)
  - [Atajos de teclado](#shortcuts)
- 📱 **Tus dispositivos**
  - [Sincroniza tus dispositivos](#sync)
  - [Ember en el móvil](#install)
- 💻 **Ember en tu Mac**
  - [Ember en tu Mac](#mac)
  - [Vidrio líquido y animaciones](#glass)
  - [Atajos de Apple, Siri y Raycast](#automation)
  - [Tus datos y tu privacidad](#data)

## 🧭 Primeros pasos

<a id="welcome"></a>

### 👋 Cómo funciona Ember

*Un ciclo sencillo: capturar, planificar, enfocarte, hacer y reflexionar.* · 2 min

1. **Captura sin pensar.** Todo lo que se te ocurra va a Ember en segundos: pulsa <kbd>N</kbd> o <kbd>⌘N</kbd>, escribe como hablas y pulsa <kbd>↵</kbd>. Si no tiene fecha, queda en la **Bandeja** para decidir después.
2. **Planifica el día.** En **Hoy** ves lo que toca: agenda, tareas, hábitos y tu objetivo principal. El botón **Planificar mi día** propone huecos para tus tareas; nada cambia hasta que aceptas.
3. **Enfócate.** Elige una tarea y empieza una sesión de **Focus** (pomodoro o trabajo profundo). El orbe de líquido se vacía como un reloj de arena y su anillo marca el progreso.
4. **Haz y marca.** Completa tareas con un clic en el círculo, registra hábitos tocando su celda y sigue tus **Rutinas** paso a paso.
5. **Reflexiona.** Por la noche, **Revisión** te ayuda a cerrar el día y, los domingos, a revisar la semana con tus propios datos. Sin puntuaciones ni culpa.

**Atajos:**

- <kbd>N</kbd> — Nueva tarea (configurable en Ajustes → Atajos)
- <kbd>⌘K</kbd> — Buscar o ejecutar cualquier cosa
- <kbd>?</kbd> — Ver todos los atajos

➜ En la app: **Ir a Hoy**.

<a id="palette"></a>

### 🔎 La paleta ⌘K

*Busca cualquier cosa, ejecuta acciones y habla con Ember desde un único sitio.* · 2 min

1. **Ábrela desde cualquier pantalla.** Pulsa <kbd>⌘K</kbd> (o <kbd>/</kbd>). Escribe y aparecen al instante tareas, notas, hábitos, proyectos, objetivos y eventos. No importan las tildes ni las erratas pequeñas.
2. **Muévete con el teclado.** Usa <kbd>↑</kbd> y <kbd>↓</kbd> para elegir, <kbd>↵</kbd> para abrir y <kbd>esc</kbd> para cerrar.
3. **Acciones rápidas.** Escribe "nueva rutina", "planificar mañana", "tema" o "exportar" y ejecuta la acción sin buscarla en los menús.
4. **Ember entiende frases.** Si escribes algo como "qué tengo mañana" o "mueve las atrasadas a mañana", aparece una tarjeta **Ember entiende** con la respuesta o con lo que va a hacer. Solo se ejecuta si pulsas <kbd>↵</kbd>, y se puede deshacer con <kbd>⌘Z</kbd>.
5. **Y si no existe, créalo.** Si no hay resultados, <kbd>↵</kbd> crea una tarea con ese texto, con fecha y hora si las escribiste.

**Comandos para la paleta (`⌘K`):**

| Escribe | Qué hace |
|---|---|
| `qué tengo mañana` | Tu agenda de mañana: eventos y tareas |
| `abre hábitos` | Te lleva a Hábitos |

**Atajos:**

- <kbd>⌘K</kbd> — Abrir o cerrar la paleta
- <kbd>/</kbd> — Abrir la paleta (configurable en Ajustes → Atajos)
- <kbd>↑</kbd> <kbd>↓</kbd> — Elegir resultado
- <kbd>↵</kbd> — Abrir o ejecutar

## ⚡ Capturar

<a id="capture"></a>

### ⚡ Captura en lenguaje natural

*Escribe como hablas: Ember detecta fechas, horas, duraciones, repeticiones y prioridades.* · 3 min

1. **Abre la captura.** Pulsa <kbd>N</kbd> (o <kbd>⌘N</kbd>). En el móvil, el botón **+** flotante.
2. **Escribe la frase completa.** Por ejemplo "Estudiar derecho mañana 90 minutos". Debajo verás lo que Ember ha entendido: fecha, hora, duración…
3. **Elige el tipo.** Ember sugiere si es tarea, nota, idea, hábito o evento. Pulsa <kbd>Tab</kbd> para cambiarlo (o <kbd>⇧Tab</kbd> para ir hacia atrás).
4. **Guarda.** Pulsa <kbd>↵</kbd>. Si no tiene fecha, va a la Bandeja. Un evento necesita hora; si falta, Ember te lo dice.
5. **Trucos.** **p1** a **p4** marcan la prioridad. **#nombre** asigna un proyecto si existe, o una etiqueta si no. Empieza con "idea:" o "nota:" para forzar el tipo.

**Prueba a escribir en la captura (`N`):**

| Escribe | Ember entiende |
|---|---|
| `Estudiar derecho mañana 90 minutos` | Tarea · mañana · 90 min |
| `Llamar al banco hoy a las 5 p1` | Tarea · hoy · 17:00 · prioridad 1 |
| `Estudiar marketing 2 horas antes del viernes` | Tarea · 2 h · fecha límite el viernes (Ember busca hueco) |
| `Gimnasio lunes, miércoles y viernes a las 18:00` | Hábito · L, X, V · 18:00 |
| `Leer 30 min todos los días` | Hábito diario · 30 min |
| `Entrenar 3 veces por semana` | Hábito flexible · 3 veces por semana |
| `Reunión con Ana mañana de 10 a 11:30` | Evento · mañana · 10:00–11:30 |
| `Idea para la canción` | Idea (se guarda como nota) |
| `Comprar zapatillas #compras` | Tarea sin fecha · etiqueta compras → Bandeja |

**Atajos:**

- <kbd>N</kbd> — Captura rápida (configurable en Ajustes → Atajos)
- <kbd>⌘N</kbd> — Captura rápida (también desde el menú Archivo)
- <kbd>Tab</kbd> — Cambiar el tipo
- <kbd>↵</kbd> — Guardar

➜ En la app: **Abrir la Bandeja**.

<a id="inbox"></a>

### 📥 La Bandeja

*El sitio donde aterriza lo capturado sin fecha, para decidir con calma qué es.* · 2 min

1. **Qué llega aquí.** Tareas sin fecha, notas e ideas recién capturadas, y lo que aparcas durante una sesión de Focus.
2. **Procesa cada elemento.** Con los botones de cada fila: **Hoy**, **Mañana**, programar, convertir en **nota**, en **hábito** o en **evento**. Las notas se pueden convertir en tarea.
3. **Sin presión.** La bandeja no caduca ni te riñe. Vacíala cuando tengas cinco minutos, por ejemplo durante la revisión semanal.

➜ En la app: **Abrir la Bandeja**.

<a id="globalCapture"></a>

### 🌐 Captura desde cualquier app

*Un atajo global abre una ventanita de vidrio sobre lo que estés haciendo.* · 1 min

1. **El atajo.** En el Mac, pulsa <kbd>⌃⇧Espacio</kbd> (Control + Mayúsculas + Espacio) desde cualquier app, aunque Ember esté en segundo plano.
2. **Escribe y vuelve a lo tuyo.** Funciona igual que la captura normal: lenguaje natural, <kbd>Tab</kbd> para el tipo y <kbd>↵</kbd> para guardar. La ventana se oculta sola.
3. **Cámbialo si choca con otro.** En **Ajustes → Atajos** puedes elegir otra combinación.

**Atajos:**

- <kbd>⌃⇧Espacio</kbd> — Captura global (app de Mac)

➜ En la app: **Ajustes → Atajos**.

## 🗓️ Planificar

<a id="tasks"></a>

### ✅ Tareas a fondo

*Prioridades, vistas inteligentes, matriz de Eisenhower, subtareas y repeticiones.* · 3 min

1. **Vistas inteligentes.** En **Tareas** elige entre Mi día, Bandeja, Próximos 7 días, Próximamente, Atrasadas, Algún día, Para focus, Completadas y Todas. Filtra por prioridad, proyecto, área o etiqueta.
2. **Abre el detalle.** Haz clic en una tarea para ver su panel: notas, checklist, subtareas, recordatorios, repetición, estimación de tiempo y bloqueos.
3. **Clic derecho.** Sobre cualquier tarea: moverla a hoy, a mañana o al lunes que viene, quitarle la fecha, cambiar su prioridad, empezar Focus en ella, devolverla a la Bandeja, descartarla o eliminarla (con deshacer).
4. **Matriz de Eisenhower.** Cambia de **Lista** a **Matriz** para ver urgente / importante. Ember la propone según prioridad y fechas, y respeta lo que tú elijas.
5. **Arrastra al calendario.** Arrastra una tarea desde Hoy o desde la lista "Sin programar" del calendario a una hora concreta para reservarle un bloque.

**Atajos:**

- <kbd>L</kbd> — Ir a Tareas (configurable en Ajustes → Atajos)
- <kbd>⌘Z</kbd> — Deshacer el último cambio

➜ En la app: **Abrir Tareas**.

<a id="planDay"></a>

### ✨ Planifica tu día en 10 segundos

*Ember encaja tus tareas en tus huecos libres. Tú decides si aceptas.* · 2 min

1. **Pulsa Planificar mi día.** Está en **Hoy** (y en la paleta: "planificar mañana"). Ember mira prioridades, fechas límite, duraciones, eventos, tu horario de sueño y el margen entre bloques.
2. **Elige estrategia.** **Equilibrada**, **primero trabajo profundo** o **primero victorias rápidas**. Puedes pedir otra propuesta.
3. **Acepta o descarta.** Al aceptar, las tareas reciben hora. Lo que no cabe se queda sin hora, con la opción de moverlo a mañana sin culpa.

**Comandos para la paleta (`⌘K`):**

| Escribe | Qué hace |
|---|---|
| `planifica mi día` | Abre la propuesta para hoy |
| `planifica mañana` | Abre la propuesta para mañana |
| `cuánto tiempo libre tengo hoy` | Tus huecos libres y cuánto suman |

➜ En la app: **Ir a Hoy**.

<a id="orbit"></a>

### 🪐 Orbit, tu asistente

*Pídele las cosas con tus palabras: planifica con condiciones, aligera el día, desglosa proyectos y más.* · 3 min

1. **Ábrelo.** Pulsa <kbd>⌘J</kbd>, el botón **Orbit** de la barra lateral o el aviso de **Hoy**. Funciona en tu dispositivo, sin conexión y sin modelos en la nube.
2. **Planifica con condiciones.** Escribe "planifica mi día, nada después de las 20 y prioriza marketing". Entiende **empieza a las…**, **hasta las…**, **solo tengo 3 horas**, **primero lo difícil**, **con descansos de 10 min** y **día tranquilo**.
3. **Aligera un día imposible.** Di "estoy saturado": compara tu carga con el tiempo libre real y propone mover lo menos urgente a días con hueco. Nunca toca lo prioritario ni lo que vence ese día.
4. **Vacía la cabeza.** Escribe varias cosas seguidas ("tengo que llamar al banco, comprar pan mañana y enviar el informe antes del viernes") o una lista con <kbd>⇧↵</kbd>: crea una tarea por cada una, con su fecha y duración.
5. **Tú decides.** Cada propuesta llega con casillas: quita lo que no quieras y pulsa **Aplicar**. Todo se aplica junto y <kbd>⌘Z</kbd> lo deshace entero.

**Pídeselo a Orbit (`⌘J`):**

| Escribe | Qué hace |
|---|---|
| `planifica mi día, nada después de las 20 y prioriza marketing` | Propone horas respetando tus condiciones |
| `organiza mañana empezando a las 9, solo tengo 3 horas` | Plan de mañana con tope de 3 h |
| `estoy saturado` | Mueve lo menos urgente a días con hueco |
| `desglosa la mudanza para el 30 de noviembre` | Proyecto con fases y fechas hasta el límite |
| `convierte la nota Reunión en tareas` | Saca las tareas de una nota |
| `tengo que llamar al banco, comprar pan mañana y enviar el informe antes del viernes` | Tres tareas, cada una con lo suyo |
| `¿qué hago ahora?` | Lo más urgente que cabe en tu hueco actual |
| `¿cómo voy con el EP?` | Progreso, ritmo y lo siguiente |
| `resume mi semana` | Resumen con datos y hasta tres ideas |

**Atajos:**

- <kbd>⌘J</kbd> — Abrir o cerrar Orbit

<a id="calendar"></a>

### 🗓️ Calendario y bloques de tiempo

*Mes, semana, día y agenda. Arrastra para crear, mover y redimensionar.* · 3 min

1. **Cambia de vista.** Arriba eliges **Mes**, **Semana**, **Día** o **Agenda**. Las flechas cambian de periodo y **Hoy** vuelve al presente.
2. **Crea arrastrando.** En la vista de semana o día, arrastra sobre una franja vacía: aparece un menú para crear una tarea, un evento o un bloque de Focus de esa duración.
3. **Mueve y estira.** Arrastra un bloque para moverlo (también a otro día) y tira de su borde inferior para cambiar su duración. Si el evento se repite, arrastrarlo cambia solo esa vez; para cambiar toda la serie, ábrelo y edítalo.
4. **Importa tu calendario.** En **Ajustes → Integraciones** importa un archivo **.ics** (Google, Apple, Outlook) sin dar acceso a tu cuenta.

**Atajos:**

- <kbd>C</kbd> — Ir al Calendario (configurable en Ajustes → Atajos)

➜ En la app: **Abrir el Calendario**.

## 🎯 Enfocarte

<a id="focus"></a>

### 🎯 Focus: pomodoro y trabajo profundo

*Sesiones con orbe líquido, sonidos ambientales y modo inmersivo.* · 3 min

1. **Prepara la sesión.** En **Focus** elige pomodoro (25/5, 50/10, 90/20 o personalizado) o trabajo profundo, la tarea y un sonido: lluvia, océano, bosque, café, ruido marrón o blanco, espacio o lo-fi. Todos se generan en tu Mac, sin internet.
2. **Empieza.** Pulsa **Empezar** o haz clic en el orbe. La pantalla pasa a modo inmersivo: el líquido baja como un reloj de arena y el anillo marca lo que llevas.
3. **Controla sin ratón.** <kbd>Espacio</kbd> pausa y reanuda. Clic en el orbe también. <kbd>esc</kbd> vuelve a Hoy sin detener la sesión.
4. **Descansos.** Al terminar cada bloque llega el descanso (el orbe se vuelve azul). Puedes saltarlo o, si desactivas "descansos automáticos", decidir cuándo empezar.
5. **Al terminar.** Ember guarda el tiempo real concentrado. Si cortas antes, te pregunta el motivo (opcional) para que tus estadísticas sean honestas.

**Comandos para la paleta (`⌘K`):**

| Escribe | Qué hace |
|---|---|
| `empieza focus 50 min en informe` | Pomodoro de 50 min vinculado a la tarea que más se parezca a "informe" |
| `trabajo profundo 90 minutos` | Bloque de 90 min sin descansos |
| `pausa el focus` | Pausa la sesión en curso |
| `cuánto he enfocado esta semana` | Total, sesiones y la más larga |

**Atajos:**

- <kbd>F</kbd> — Ir a Focus (configurable en Ajustes → Atajos)
- <kbd>Espacio</kbd> — Pausar o reanudar (configurable en Ajustes → Atajos)

➜ En la app: **Abrir Focus**.

<a id="park"></a>

### 🅿️ Aparca las distracciones

*Apunta lo que te viene a la cabeza sin salir de la sesión.* · 1 min

1. **Pulsa D.** Durante un bloque de Focus, pulsa <kbd>D</kbd> (o haz clic en la caja de debajo del orbe) y escribe lo que te distrae: "contestar a Marta", "mirar vuelos"…
2. **Intro y sigue.** Con <kbd>↵</kbd> se guarda en la **Bandeja** y vuelves a lo tuyo. El contador te dice cuántos llevas.
3. **Al final.** El resumen de la sesión te recuerda cuántos pensamientos aparcaste y te lleva a la Bandeja para decidir qué hacer con ellos.

**Atajos:**

- <kbd>D</kbd> — Aparcar una distracción (en Focus)

<a id="island"></a>

### 🏝️ La isla de Focus

*Tu temporizador siempre a la vista, en una píldora de vidrio que puedes arrastrar.* · 1 min

1. **Dentro de Ember.** Si sales de la pantalla de Focus con una sesión en marcha, aparece arriba una isla con el tiempo. Pasa el cursor para ver los botones: pausar, saltar y abrir.
2. **Arrástrala.** Llévala a donde quieras: se mueve con inercia y rebota en los bordes. Doble clic la devuelve a su sitio.
3. **Fuera de Ember (Mac).** Si cambias a otra app, la isla flota sobre todas las ventanas sin robarte el foco. En la barra de menús verás además la cuenta atrás. Puedes desactivarla en **Ajustes → Focus**.

➜ En la app: **Ajustes → Focus**.

## 🔥 Hábitos y rutinas

<a id="habits"></a>

### 🔥 Hábitos sin culpa

*Rachas que perdonan, días de gracia, vacaciones y la rejilla de colores del mes.* · 3 min

1. **Crea un hábito.** Con **Nuevo hábito** o con la captura: "Gimnasio lunes, miércoles y viernes a las 18:00" o "Leer 30 min todos los días". Elige icono, color, meta (por ejemplo, 8 vasos) y recordatorio.
2. **Regístralo.** Toca su celda para marcarlo hecho. Si tiene meta mayor que 1, cada toque suma uno. **Clic derecho** para saltar a propósito, registrar progreso parcial o borrar el registro.
3. **Rachas que no castigan.** Los **días de gracia** permiten fallar sin perder la racha, saltar a propósito no la rompe y el **modo vacaciones** la congela.
4. **Mira el mes.** La pestaña **Mes** muestra la rejilla de colores; **Estadísticas** y **Cadenas** enseñan constancia y hábitos que se encadenan.

**Prueba a escribir en la captura (`N`):**

| Escribe | Ember entiende |
|---|---|
| `Meditar 10 min todos los días a las 7:30` | Hábito diario · 07:30 · 10 min |

**Comandos para la paleta (`⌘K`):**

| Escribe | Qué hace |
|---|---|
| `marca meditar` | Registra "Meditar" como hecho hoy |
| `racha de leer` | Tu racha actual y la mejor |

**Atajos:**

- <kbd>H</kbd> — Ir a Hábitos (configurable en Ajustes → Atajos)

➜ En la app: **Abrir Hábitos**.

<a id="routines"></a>

### 📋 Rutinas guiadas

*Secuencias paso a paso con temporizador, gestos y hábitos vinculados.* · 3 min

1. **Empieza con una plantilla.** En **Rutinas** elige Mañana con calma, Arranque de trabajo, Cierre de la jornada, Noche para descansar o Sesión de estudio. Un clic la crea y luego la adaptas.
2. **Edítala.** Añade pasos escribiendo "Estirar 5 min" (los minutos le dan temporizador), **arrastra el asa** para reordenarlos y vincula un paso a un hábito para registrarlo a la vez.
3. **Síguela.** Pulsa **Empezar**: verás un paso cada vez. <kbd>↵</kbd> lo marca hecho, <kbd>→</kbd> lo salta, <kbd>←</kbd> vuelve atrás y <kbd>Espacio</kbd> pausa su temporizador.
4. **Con gestos.** Arrastra la tarjeta del paso hacia la **derecha** para completarlo o hacia la **izquierda** para saltarlo. También puedes tachar pasos directamente en la tarjeta de la rutina.
5. **Rutina para ahora.** Hoy te sugiere la rutina que encaja con la hora. Con la paleta: "empieza la rutina de mañana".

**Comandos para la paleta (`⌘K`):**

| Escribe | Qué hace |
|---|---|
| `empieza la rutina de mañana` | Abre tu rutina de mañana paso a paso |
| `rutina de noche` | Abre tu rutina de noche |

**Atajos:**

- <kbd>↵</kbd> — Paso hecho (en una rutina)
- <kbd>→</kbd> — Saltar paso
- <kbd>←</kbd> — Paso anterior

➜ En la app: **Abrir Rutinas**.

## 🗂️ Organizar

<a id="goals"></a>

### 🎯 Objetivos y proyectos

*Del "quiero" al "esta semana hago": horizonte, progreso y salud del proyecto.* · 3 min

1. **Objetivos con horizonte.** En **Objetivos** crea metas anuales, trimestrales, mensuales o semanales. El progreso puede salir de tareas, hitos, un número o tu propia valoración. La pestaña **La línea de tu vida** las ordena en el tiempo.
2. **Proyectos.** Un proyecto agrupa tareas con fecha límite. Ábrelo para verlo como **lista**, **tablero** (arrastra entre columnas), **línea de tiempo** o **calendario**.
3. **Salud honesta.** Ember marca un proyecto **en riesgo** solo si el ritmo, el plazo o la inactividad lo justifican, y te explica por qué.
4. **Vida.** En **Proyectos**, la pestaña **Vida** reparte tus proyectos por áreas (salud, trabajo, estudios…) para ver el equilibrio de un vistazo.

**Atajos:**

- <kbd>G</kbd> — Ir a Objetivos (configurable en Ajustes → Atajos)
- <kbd>P</kbd> — Ir a Proyectos (configurable en Ajustes → Atajos)

➜ En la app: **Abrir Proyectos**.

<a id="notes"></a>

### 📝 Notas y segundo cerebro

*Markdown, enlaces entre notas y casillas que se convierten en tareas.* · 2 min

1. **Escribe en Markdown.** Títulos con #, listas, **negritas** y casillas con "- [ ]". Marca las casillas directamente en la vista previa.
2. **Enlaza ideas.** Escribe [[Título de otra nota]] para enlazarla. En cada nota verás qué otras la mencionan (enlaces de vuelta).
3. **De la nota a la acción.** Las casillas pendientes de una nota se pueden convertir en tareas de un clic.

➜ En la app: **Abrir Notas**.

## 🌙 Reflexionar

<a id="review"></a>

### 🌙 Revisión diaria y semanal

*Cierra el día en dos minutos y revisa la semana con tus datos, sin juicio.* · 2 min

1. **Por la mañana.** En **Hoy** aparece un check-in: cómo dormiste, energía, foco, ánimo y tu intención del día.
2. **Por la noche.** La tarjeta **Día completado** resume lo hecho y te lleva a **Revisión → Diaria**: lo mejor del día, qué mejorar y un diario libre.
3. **Cada semana.** **Revisión → Semanal** te enseña tareas, hábitos y Focus de la semana, para elegir prioridades de la siguiente. **Reset** sirve para ordenar todo cuando te sientes desbordado.

➜ En la app: **Abrir Revisión**.

<a id="insights"></a>

### 📊 Estadísticas que explican

*Cuándo te concentras mejor, cómo van tus hábitos y tu año en un resumen.* · 2 min

1. **Patrones con muestra suficiente.** Ember solo sugiere patrones ("tus mejores horas de foco son…") cuando hay datos suficientes, y siempre como sugerencia.
2. **Mapa de calor y gráficos.** Foco por hora y por día, tareas completadas, constancia de hábitos y semanas destacadas.
3. **Tu año.** Abre la paleta y escribe "mi año": una historia visual de tu año con tus propios números.

**Comandos para la paleta (`⌘K`):**

| Escribe | Qué hace |
|---|---|
| `cuántos pomodoros llevo hoy` | Tus sesiones de hoy |

➜ En la app: **Abrir Estadísticas**.

## ⌨️ Comandos y atajos

<a id="commands"></a>

### 💬 Habla con Ember

*Frases que la paleta ⌘K entiende sin IA y sin conexión. Todas probadas.* · 4 min

1. **Dónde se escriben.** Abre la paleta con <kbd>⌘K</kbd> y escribe la frase. No hace falta ser exacto: "¿qué tengo mañana?", "que tengo manana" y "Oye Ember, qué tengo mañana" funcionan igual.
2. **Preguntas.** Agenda de un día o de la semana, lo atrasado, tus huecos libres, lo siguiente que toca, tus rachas y tu tiempo de Focus.
3. **Acciones.** Empezar, pausar o terminar Focus, abrir una rutina, mover lo atrasado, planificar un día, completar una tarea, registrar un hábito, cambiar el tema o ir a cualquier pantalla.
4. **Siempre con vista previa.** La tarjeta **Ember entiende** enseña qué va a pasar. Solo con <kbd>↵</kbd> se ejecuta, y los cambios se deshacen con <kbd>⌘Z</kbd>.

**Comandos para la paleta (`⌘K`):**

| Escribe | Qué hace |
|---|---|
| `qué tengo hoy` | Agenda de hoy con horas |
| `qué hay el viernes` | Agenda del próximo viernes |
| `qué tengo esta semana` | Resumen de los próximos 7 días |
| `qué viene ahora` | Lo que estás haciendo y lo siguiente |
| `qué tengo atrasado` | Tareas de días anteriores |
| `mueve las atrasadas a mañana` | Reprograma todas (se puede deshacer) |
| `huecos libres mañana` | Franjas libres y total |
| `planifica mañana` | Propuesta de plan para mañana |
| `empieza focus 25 min` | Pomodoro de 25 min |
| `detén el focus` | Termina y guarda la sesión |
| `cómo van mis rachas` | Rachas de todos tus hábitos |
| `completa comprar pan` | Completa la tarea que más se parezca |
| `hice ejercicio` | Registra el hábito que más se parezca |
| `empieza mi rutina` | La rutina que toca a esta hora |
| `tema océano` | Cambia el tema (también "modo claro") |
| `ve al calendario` | Navega a cualquier pantalla |
| `ayuda` | Ejemplos y acceso a este tutorial |

<a id="shortcuts"></a>

### ⌨️ Atajos de teclado

*Todo Ember sin tocar el ratón. Pulsa ? en cualquier momento para verlos.* · 2 min

1. **Teclas sueltas.** Fuera de los campos de texto: <kbd>T</kbd> Hoy, <kbd>L</kbd> Tareas, <kbd>C</kbd> Calendario, <kbd>H</kbd> Hábitos, <kbd>F</kbd> Focus, <kbd>G</kbd> Objetivos, <kbd>P</kbd> Proyectos, <kbd>N</kbd> captura y <kbd>/</kbd> paleta.
2. **Con ⌘.** <kbd>⌘K</kbd> paleta, <kbd>⌘N</kbd> nueva tarea, <kbd>⌘Z</kbd> deshacer, <kbd>⌘,</kbd> ajustes y, en la app de Mac, <kbd>⌘1</kbd> a <kbd>⌘5</kbd> para Hoy, Tareas, Calendario, Hábitos y Focus.
3. **Personalízalos.** En **Ajustes → Atajos** cambia cualquier tecla suelta y el atajo global de captura.

**Atajos:**

- <kbd>T</kbd> — Hoy (configurable en Ajustes → Atajos)
- <kbd>L</kbd> — Tareas (configurable en Ajustes → Atajos)
- <kbd>C</kbd> — Calendario (configurable en Ajustes → Atajos)
- <kbd>H</kbd> — Hábitos (configurable en Ajustes → Atajos)
- <kbd>F</kbd> — Focus (configurable en Ajustes → Atajos)
- <kbd>G</kbd> — Objetivos (configurable en Ajustes → Atajos)
- <kbd>P</kbd> — Proyectos (configurable en Ajustes → Atajos)
- <kbd>?</kbd> — Chuleta de atajos

➜ En la app: **Ajustes → Atajos**.

## 📱 Tus dispositivos

<a id="sync"></a>

### 🔐 Sincroniza tus dispositivos

*Mac, móvil y tablet con los mismos datos, cifrados de extremo a extremo y sin cuentas.* · 3 min

1. **Un código, no una cuenta.** En **Ajustes → Sincronización** elige **Empezar en este dispositivo**. Ember genera un código de 20 caracteres: es la única llave de tus datos. Guárdalo en tu gestor de contraseñas.
2. **Tu servidor.** Escribe la dirección de tu servidor de sincronización (la carpeta **server/** del proyecto tiene uno de un solo archivo y una guía para desplegarlo con HTTPS). El servidor **no puede leer nada**: solo guarda registros cifrados.
3. **Une los demás.** En el otro dispositivo elige **Unirme con un código**, escribe el mismo servidor y el código. Recibe todo y adopta tus ajustes (nombre, tema…).
4. **Se sincroniza solo.** Al abrir Ember, cada minuto y medio, al volver a la ventana y unos segundos después de cada cambio. Sin conexión sigues trabajando; se pone al día al reconectar.
5. **Si dos cambian lo mismo.** Gana el cambio más reciente y el otro queda en **Conflictos por revisar**, donde puedes recuperarlo con **Conservar la descartada**. Nunca se pierde nada en silencio.

➜ En la app: **Ajustes → Sincronización**.

<a id="install"></a>

### 📲 Ember en el móvil

*La versión web se instala como una app: icono propio, pantalla completa y sin conexión.* · 1 min

1. **iPhone y iPad.** Abre Ember en Safari, pulsa **Compartir** y luego **Añadir a pantalla de inicio**.
2. **Android y ordenador.** En Chrome o Edge aparece **Instalar app** en el menú (o en **Ajustes → Acerca de → Instalar**).
3. **Accesos rápidos.** Mantén pulsado el icono para **Nueva tarea**, **Empezar focus** o **Hablar con Orbit**.
4. **Junto con la sincronización.** Únelo con tu código y tendrás en el bolsillo lo mismo que en el Mac. Los datos viven en el dispositivo y funcionan sin conexión.

➜ En la app: **Ajustes → Acerca de**.

## 💻 Ember en tu Mac

<a id="mac"></a>

### 💻 Ember en tu Mac

*Barra de menús, Dock, notificaciones y por qué cerrar no es salir.* · 2 min

1. **Barra de menús.** El icono de Ember muestra tus tareas de hoy, la captura rápida e iniciar o pausar Focus. Durante una sesión verás la cuenta atrás junto al icono.
2. **Insignia del Dock.** El icono del Dock muestra cuántas tareas te quedan hoy (incluidas las atrasadas). Se desactiva en **Ajustes → Apariencia**.
3. **Cerrar no es salir.** Cerrar la ventana la oculta: Ember sigue en la barra de menús para avisarte y para la captura global. Para salir del todo, <kbd>⌘Q</kbd>.
4. **Notificaciones.** Ember pide permiso la primera vez que hace falta. Respeta tus horas de silencio y nunca te avisa de algo antiguo al abrir.

**Atajos:**

- <kbd>⌘Q</kbd> — Salir de Ember

<a id="glass"></a>

### 💧 Vidrio líquido y animaciones

*Materiales de vidrio, luz que sigue al cursor y movimiento con física real.* · 2 min

1. **Vidrio nativo.** En macOS 26 o posterior, la ventana usa el **Liquid Glass** del sistema: el escritorio se ve difuminado detrás. Actívalo o desactívalo en **Ajustes → Apariencia → Vidrio de macOS**.
2. **Intensidad.** Elige **Intenso**, **Sutil** o **Apagado**. Con Apagado las superficies son sólidas, lo más legible y lo que menos consume.
3. **Juega con la interfaz.** Pasa el cursor sobre las tarjetas para ver el borde de luz, **mantén pulsado y desliza** sobre los selectores segmentados, arrastra la isla de Focus o haz clic en el orbe líquido.
4. **Accesibilidad.** **Reducir movimiento** quita animaciones y **Reducir transparencia** vuelve todo sólido. Ember también respeta lo que tengas en los ajustes de accesibilidad de macOS.

➜ En la app: **Ajustes → Apariencia**.

<a id="automation"></a>

### 🪄 Atajos de Apple, Siri y Raycast

*Enlaces ember:// para capturar, preguntar o empezar Focus desde cualquier sitio.* · 3 min

1. **Qué son.** Ember entiende enlaces que empiezan por **ember://**. Cualquier app que abra enlaces (Atajos, Raycast, Alfred, un recordatorio…) puede usarlos para hablar con Ember.
2. **Captura con Siri.** En la app **Atajos** crea un atajo con tres acciones: **Solicitar entrada** (texto), **Codificar URL** y **Abrir URL** con <kbd>ember://capture?text=</kbd> seguido del texto codificado. Llámalo "Apunta en Ember" y di: "Oye Siri, apunta en Ember".
3. **Focus con un clic.** Un atajo o un comando de Raycast con <kbd>ember://focus?minutes=50&task=informe</kbd> empieza una sesión vinculada a esa tarea. Para pausar: <kbd>ember://focus?action=pause</kbd>.
4. **Preguntas que confirmas tú.** <kbd>ember://command?q=qué tengo mañana</kbd> abre la paleta con la frase escrita. Lo que cambie datos solo se ejecuta cuando pulsas <kbd>↵</kbd>.
5. **Seguro por diseño.** Los enlaces funcionan con **Ember.app** instalada en tu Mac. Ninguno borra datos, los textos se recortan y Ember te confirma cada captura con una notificación.

**Enlaces (Atajos de Apple, Raycast, Alfred):**

| Enlace | Qué hace |
|---|---|
| `ember://capture?text=Comprar pan mañana` | Crea la tarea "Comprar pan" para mañana |
| `ember://capture?text=Canción sobre el mar&kind=idea` | Guarda una idea |
| `ember://open/habitos` | Abre Hábitos |
| `ember://command?q=qué tengo mañana` | Abre ⌘K con la pregunta |
| `ember://focus?minutes=50&task=informe` | Empieza 50 min de Focus en "informe" |
| `ember://focus?minutes=90&mode=deep` | Trabajo profundo de 90 min |
| `ember://focus?action=pause` | Pausa la sesión en curso |

> En Atajos, codifica el texto con la acción **Codificar URL** antes de **Abrir URL** (los espacios y las tildes se escriben como `%20`, `%C3%B1`…).

<a id="data"></a>

### 🔒 Tus datos y tu privacidad

*Todo se guarda en tu Mac. Exporta, importa y deshaz cuando quieras.* · 2 min

1. **Local primero.** Ember guarda todo en una base de datos en tu Mac y funciona sin conexión. No hay cuentas, anuncios ni rastreo.
2. **Exporta e importa.** En **Ajustes → Datos**: copia completa en JSON, tareas en CSV, calendario en ICS y notas en Markdown. Importar fusiona sin borrar nada.
3. **Deshacer.** <kbd>⌘Z</kbd> deshace el último cambio (completar, mover, borrar…). Los avisos de "Deshacer" también aparecen tras acciones importantes.

**Atajos:**

- <kbd>⌘Z</kbd> — Deshacer

➜ En la app: **Ajustes → Datos**.
