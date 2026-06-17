# Explicación detallada: `server.js` y `cliente.js`

Documento técnico de la aplicación de **comunicación bidireccional en tiempo real** (reloj + anuncios + chat) construida con **Node.js + Express + Socket.io** en el servidor y **RxJS** en el cliente.

La idea central: el **servidor empuja (push)** los cambios de estado al navegador y estos se reflejan automáticamente, **sin refrescar la página ni hacer *polling***.

```
CLIENTE  <-- conexión bidireccional (WebSocket) -->  SERVIDOR
```

---

## Índice

1. [Conceptos previos](#1-conceptos-previos)
2. [Cómo encajan las piezas](#2-cómo-encajan-las-piezas)
3. [`server.js` explicado](#3-serverjs-explicado)
4. [`cliente.js` explicado](#4-clientejs-explicado)
5. [Protocolo de eventos completo](#5-protocolo-de-eventos-completo)
6. [Recorrido de un mensaje (end-to-end)](#6-recorrido-de-un-mensaje-end-to-end)
7. [Glosario rápido](#7-glosario-rápido)

---

## 1. Conceptos previos

### 1.1 El problema: HTTP es petición–respuesta

En la web clásica el navegador **pide** y el servidor **responde**. Si el dato cambia después, el cliente no se entera hasta que vuelve a preguntar. Para "estar al día" hay dos caminos malos:

- **Polling**: preguntar cada X segundos "¿hay algo nuevo?". Casi siempre la respuesta es "no" → desperdicio.
- **Refrescar la página** a mano.

Ninguno es tiempo real. La solución es un **canal persistente y de doble vía**: **WebSocket**.

### 1.2 WebSocket

Protocolo (RFC 6455) que parte de una conexión HTTP y la "asciende" (*upgrade*) a un canal **TCP full-duplex** y persistente. Una vez abierto, **cliente y servidor pueden enviarse mensajes en cualquier momento**, sin reabrir la conexión.

### 1.3 Socket.io = WebSocket + comodidades

**Socket.io** es una librería (tiene una parte de **servidor** para Node y otra de **cliente** para el navegador) que usa WebSocket por debajo y agrega:

- **Reconexión automática** si se corta la red.
- ***Fallback***: si WebSocket no está disponible, usa otras técnicas.
- **Eventos con nombre**: en vez de mandar texto plano, emitís y escuchás *eventos* (`'mensaje'`, `'hora'`, etc.).
- ***Broadcast***: mandar un evento a **todos** los clientes de una sola vez.

> **Importante:** Socket.io NO es WebSocket "puro". Cliente y servidor deben usar **ambos Socket.io** (no podés conectar un WebSocket nativo a un servidor Socket.io sin más).

### 1.4 Programación reactiva y RxJS

**Programación reactiva** = tratar las cosas que pasan en el tiempo (clics, mensajes, ticks de reloj) como **flujos de datos** (*streams*) que se **transforman** con operadores.

**RxJS** es la librería de programación reactiva para JavaScript. Su pieza central es el **Observable**: una secuencia de valores que van llegando. El patrón siempre es:

```
FUENTE  →  .pipe( operador, operador, ... )  →  .subscribe( reacciono )
(Observable)     (transformaciones)              (efecto final)
```

---

## 2. Cómo encajan las piezas

```
┌─────────────────────────── NAVEGADOR (cliente) ───────────────────────────┐
│  index.html  →  carga 3 scripts:                                           │
│     1) rxjs.umd.min.js        (librería RxJS, global `rxjs`)               │
│     2) /socket.io/socket.io.js (cliente Socket.io, lo sirve el server)     │
│     3) cliente.js              (nuestra lógica reactiva)                    │
│                                                                            │
│  cliente.js:  const socket = io();   ← abre la conexión WebSocket          │
│               fromEvent(socket, 'evento')  ← eventos como Observables      │
└───────────────────────────────────┬────────────────────────────────────────┘
                                     │  WebSocket (bidireccional)
┌───────────────────────────────────┴────────────────────────────────────────┐
│  server.js (Node.js):                                                      │
│     express.static('public')  ← sirve index.html, cliente.js, css          │
│     new Server(http)          ← levanta Socket.io sobre el server HTTP      │
│     io.emit('evento', datos)  ← EMPUJA datos a todos los clientes           │
└────────────────────────────────────────────────────────────────────────────┘
```

Un detalle clave: el script `/socket.io/socket.io.js` **no es un archivo que escribimos**. Lo **inyecta automáticamente el servidor de Socket.io**. Por eso funciona aunque no exista en la carpeta `public`.

---

## 3. `server.js` explicado

### 3.1 Montaje del servidor

```js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.static('public'));        // (1) sirve el front-end estático

const servidorHTTP = http.createServer(app); // (2) server HTTP a partir de express
const io = new Server(servidorHTTP);         // (3) Socket.io "envuelve" ese server
```

- **(1) `express.static('public')`**: cualquier archivo de la carpeta `public/` se entrega por HTTP. Por eso al entrar a `http://localhost:3000` se ve `index.html`.
- **(2) `http.createServer(app)`**: necesitamos el objeto HTTP "crudo" porque Socket.io se engancha a él (no directamente a Express). Express queda como *handler* de las peticiones HTTP normales.
- **(3) `new Server(servidorHTTP)`**: crea el servidor de Socket.io **compartiendo el mismo puerto** que el HTTP. Así, un único proceso sirve el HTML **y** atiende los WebSockets.

> **`io`** = el servidor de Socket.io completo (todos los clientes).
> **`socket`** (más abajo) = la conexión de **un** cliente puntual.
> Esta distinción es la más importante de todo Socket.io.

### 3.2 Estado en memoria

```js
const usuarios = new Map();                      // socket.id -> nombre
const listaDeNombres = () => Array.from(usuarios.values());
const ahora = () => new Date().toLocaleTimeString();
```

- `usuarios` es un **`Map`** que asocia el **`socket.id`** (identificador único que Socket.io le da a cada conexión) con el **nombre** elegido.
- **¿Por qué un Map por `socket.id` y no un array de nombres?** Porque si dos personas eligen el mismo nombre (ej. "Juan"), al desconectarse una, un array borraría "el primer Juan que encuentre" → se eliminaría al usuario equivocado. El `socket.id` es **único por conexión**, así que nunca hay ambigüedad.

### 3.3 Reloj global (nivel básico)

```js
setInterval(() => {
    io.emit('hora', ahora());
}, 1000);
```

- Cada **1000 ms**, `io.emit('hora', ...)` **empuja** la hora a **TODOS** los clientes conectados (eso es `io.emit` = *broadcast* global).
- Es el ejemplo más puro de *push*: el cliente no pide nada, el servidor manda solo.

### 3.4 Bloque de anuncios (nivel medio)

```js
const anuncios = [ /* ...4 textos... */ ];
let indiceAnuncio = 0;

setInterval(() => {
    io.emit('anuncio', anuncios[indiceAnuncio]);
    indiceAnuncio = (indiceAnuncio + 1) % anuncios.length;  // rota en círculo
}, 5000);
```

- Cada **5 s** difunde el anuncio actual y avanza el índice.
- `(indiceAnuncio + 1) % anuncios.length` hace que después del último vuelva al primero (rotación circular).

### 3.5 Ciclo de vida de una conexión

```js
io.on('connection', (socket) => {
    // este bloque corre UNA VEZ por cada cliente que se conecta
    // `socket` es la conexión de ESE cliente
});
```

`io.on('connection', ...)` es el evento que dispara Socket.io **cada vez que un navegador se conecta**. Adentro registramos los *listeners* propios de ese cliente.

#### a) Registro de usuario

```js
socket.on('registrarUsuario', (nombre) => {
    const nombreLimpio = String(nombre || '').trim();
    if (nombreLimpio === '') return;                  // validación en el servidor

    usuarios.set(socket.id, nombreLimpio);

    socket.emit('usuarioRegistrado');                 // (A) SOLO a este cliente
    socket.emit('anuncio', anuncios[indiceAnuncio]);  // (B) anuncio actual ya mismo

    io.emit('mensajeSistema', `${nombreLimpio} se ha conectado`); // (C) a TODOS
    io.emit('usuarios', listaDeNombres());            // (D) lista actualizada a TODOS
});
```

Acá aparece la diferencia **`socket.emit` vs `io.emit`**:

| Llamada | A quién le llega |
|---|---|
| **`socket.emit(...)`** | Solo al cliente de *este* socket (A y B). |
| **`io.emit(...)`** | A **todos** los clientes conectados (C y D). |

- **(A)** confirma el alta solo al que se registró → el cliente usa esto para pasar del login al chat.
- **(B)** le manda el anuncio vigente sin esperar al ciclo de 5 s (mejor UX).
- **(C)** avisa a todos "Fulano se ha conectado".
- **(D)** reenvía la lista completa de conectados a todos para que actualicen el panel.

#### b) Mensaje de chat

```js
socket.on('mensaje', (datos) => {
    const nombre = usuarios.get(socket.id);
    if (!nombre) return;                              // solo usuarios registrados

    const texto = String((datos && datos.texto) || '').trim();
    if (texto === '') return;

    io.emit('mensaje', {                              // re-emite a TODOS
        usuario: nombre,
        texto: texto,
        hora: ahora(),
    });
});
```

- El cliente manda **solo** `{ texto }` (no manda su nombre: no es confiable).
- El servidor **completa** quién lo envió (a partir del `socket.id`) y le agrega la **hora**, y recién ahí lo difunde a todos con `io.emit`.
- Por eso **el emisor también recibe su propio mensaje** (está incluido en "todos"). Esto simplifica el cliente: no necesita pintar el mensaje "a mano", lo pinta cuando le vuelve del servidor.

#### c) Desconexión

```js
socket.on('disconnect', () => {
    const nombre = usuarios.get(socket.id);
    if (!nombre) return;                  // si nunca se registró, no hay nada que hacer

    usuarios.delete(socket.id);
    io.emit('mensajeSistema', `${nombre} se ha desconectado`);
    io.emit('usuarios', listaDeNombres());
});
```

- `'disconnect'` es un evento **propio de Socket.io**: se dispara solo cuando el cliente cierra la pestaña o se cae la red.
- Limpiamos el `Map` y avisamos a todos.

### 3.6 Levantar el servidor

```js
servidorHTTP.listen(3000, () => {
    console.log('Servidor escuchando en puerto 3000');
});
```

Escucha en el puerto **3000** (HTTP + Socket.io, todo junto).

---

## 4. `cliente.js` explicado

Acá vive la **programación reactiva**. La idea: **cada entrada se modela como un Observable** (tanto clics del DOM como eventos del `socket`), y la interfaz reacciona suscribiéndose a esos flujos.

### 4.1 Conexión e imports de RxJS

```js
const socket = io();                        // abre la conexión al servidor (mismo origen)

const { fromEvent, merge } = rxjs;          // funciones de creación
const { map, filter, scan } = rxjs.operators; // operadores
```

- `io()` **sin argumentos** conecta al **mismo host/puerto que sirvió la página** (localhost:3000). Por eso no hace falta poner la URL.
- Como RxJS se cargó por `<script>`, todo cuelga del global **`rxjs`**. (En un proyecto con bundler sería `import { fromEvent } from 'rxjs'`.)

### 4.2 Las herramientas de RxJS que usamos

| Herramienta | Qué hace | Dónde se usa |
|---|---|---|
| **`fromEvent(fuente, 'evento')`** | Convierte una fuente de eventos (un botón o el `socket`) en un **Observable**. | Login, reloj, anuncios, mensajes, usuarios. |
| **`merge(a$, b$)`** | Une varios Observables en **uno solo**: emite cuando emite cualquiera. | "Clic en Entrar" **o** "tecla Enter". |
| **`.pipe(...)`** | Encadena operadores sobre un Observable. | En todos lados. |
| **`map(fn)`** | Transforma cada valor emitido. | Evento → texto escrito. |
| **`filter(fn)`** | Deja pasar solo los valores que cumplen una condición. | Descartar nombres/mensajes vacíos. |
| **`scan(fn, inicial)`** | Acumula un estado en el tiempo (como un `reduce` que emite en cada paso). | **Historial de mensajes**. |
| **`.subscribe(fn)`** | Ejecuta el efecto final por cada valor. | Actualizar el DOM, emitir al socket. |

> Convención: a las variables que son Observables se les pone `$` al final (`clickIngresar$`). Es solo un nombre, no sintaxis.

### 4.3 Ingreso del usuario (merge + map + filter)

```js
const esEnter = (event) => event.key === 'Enter' || event.code === 'NumpadEnter';

const clickIngresar$ = fromEvent(btnIngresar, 'click');
const enterNombre$   = fromEvent(txtNombre, 'keydown').pipe(filter(esEnter));

merge(clickIngresar$, enterNombre$).pipe(
    map(() => txtNombre.value.trim()),     // (1) del evento, saco el texto
    filter((nombre) => nombre !== '')      // (2) descarto vacíos
).subscribe((nombre) => {
    socket.emit('registrarUsuario', nombre); // (3) lo mando al servidor
});
```

Paso a paso:

1. **Dos fuentes** de "quiero entrar": clic en el botón y Enter en el input. `enterNombre$` ya viene filtrado para que solo pase cuando la tecla es Enter.
2. **`merge`** las une: el flujo emite si pasa **cualquiera** de las dos.
3. **`map`** descarta el objeto evento y se queda con el **texto del input** (`.trim()` saca espacios).
4. **`filter`** corta si el nombre quedó vacío.
5. **`subscribe`** es el efecto: emitir `'registrarUsuario'` al servidor.

Cuando el servidor confirma:

```js
fromEvent(socket, 'usuarioRegistrado').subscribe(() => {
    login.style.display = 'none';   // oculto el login
    chat.style.display  = 'block';  // muestro el chat
    txtMensaje.focus();
});
```

Acá se ve que **`fromEvent` también funciona con el `socket`**, no solo con elementos del DOM. Un evento de Socket.io se vuelve un Observable.

### 4.4 Reloj y anuncios (suscripción simple)

```js
fromEvent(socket, 'hora').subscribe((horaActual) => {
    reloj.textContent = horaActual;
});

fromEvent(socket, 'anuncio').subscribe((texto) => {
    anuncio.textContent = texto;
});
```

- Cada vez que el servidor empuja `'hora'` o `'anuncio'`, el callback actualiza el DOM. Sin pedir nada, sin refrescar.

### 4.5 Envío de mensajes (mismo patrón que el login)

```js
const clickEnviar$  = fromEvent(btnEnviar, 'click');
const enterMensaje$ = fromEvent(txtMensaje, 'keydown').pipe(filter(esEnter));

merge(clickEnviar$, enterMensaje$).pipe(
    map(() => txtMensaje.value.trim()),
    filter((texto) => texto !== '')
).subscribe((texto) => {
    socket.emit('mensaje', { texto });   // solo mando el texto
    txtMensaje.value = '';               // limpio el input
    txtMensaje.focus();
});
```

Misma estructura que el ingreso: dos fuentes (clic / Enter) → `merge` → `map` (texto) → `filter` (no vacío) → `subscribe` (emitir + limpiar).

### 4.6 Recepción de mensajes con `scan` (el corazón reactivo)

Esta es la parte más representativa del paradigma. En vez de ir agregando `<li>` sueltos con cada evento, **acumulamos** el historial como un **único valor** que se re-emite con cada mensaje nuevo.

```js
// 1) Normalizo los dos tipos de mensaje a un mismo formato
const mensajeChat$ = fromEvent(socket, 'mensaje').pipe(
    map((d) => ({ tipo: 'usuario', usuario: d.usuario, texto: d.texto, hora: d.hora }))
);
const mensajeSistema$ = fromEvent(socket, 'mensajeSistema').pipe(
    map((texto) => ({ tipo: 'sistema', texto }))
);

// 2) Los uno y los acumulo
merge(mensajeChat$, mensajeSistema$).pipe(
    scan((historial, msg) => [...historial, msg], [])  // estado = array de mensajes
).subscribe((historial) => {
    listaMensajes.innerHTML = '';                      // limpio
    historial.forEach((m) => {                         // re-dibujo todo
        const li = document.createElement('li');
        if (m.tipo === 'sistema') {
            li.className = 'msg-sistema';
            li.textContent = `[Sistema] ${m.texto}`;
        } else {
            li.className = 'msg-usuario';
            li.textContent = `${m.hora} - ${m.usuario}: ${m.texto}`;
        }
        listaMensajes.appendChild(li);
    });
    listaMensajes.scrollTop = listaMensajes.scrollHeight; // auto-scroll al final
});
```

Cómo trabaja **`scan`**:

```
estado inicial:  []
llega msg A   →  scan devuelve  [A]            → render [A]
llega msg B   →  scan devuelve  [A, B]         → render [A, B]
llega msg C   →  scan devuelve  [A, B, C]      → render [A, B, C]
```

- `scan((acumulado, nuevo) => [...acumulado, nuevo], [])` es como un `reduce`, pero **emite el resultado parcial en cada paso** (un `reduce` solo daría el total al final).
- El **estado del chat es un flujo de datos**, no variables sueltas. La vista solo "reacciona" a ese estado.

> **Nota didáctica:** re-dibujar toda la lista en cada mensaje es simple y claro, pero con miles de mensajes sería más eficiente agregar solo el `<li>` nuevo. Está documentado como límite/trabajo futuro.

### 4.7 Lista de usuarios conectados

```js
fromEvent(socket, 'usuarios').subscribe((usuarios) => {
    listaUsuarios.innerHTML = '';
    usuarios.forEach((usuario) => {
        const li = document.createElement('li');
        li.textContent = usuario;
        listaUsuarios.appendChild(li);
    });
});
```

Cada vez que alguien entra o sale, el servidor manda la lista completa y el cliente la redibuja.

### 4.8 Seguridad: `textContent` (no `innerHTML`)

En todo el cliente los mensajes se insertan con **`li.textContent = ...`**, nunca con `innerHTML`. Esto evita **XSS**: si alguien escribe `<script>...`, se muestra como texto literal y **no se ejecuta**.

---

## 5. Protocolo de eventos completo

El "contrato" entre cliente y servidor son estos eventos con nombre:

| Evento | Sentido | Datos | Para qué |
|---|---|---|---|
| `registrarUsuario` | Cliente → Servidor | `nombre` (string) | Pide el alta con un nombre. |
| `usuarioRegistrado` | Servidor → Cliente | (sin datos) | Confirma al solicitante; el cliente muestra el chat. |
| `hora` | Servidor → **Todos** | string hora | Reloj, cada 1 s. |
| `anuncio` | Servidor → **Todos** | string texto | Anuncio vigente, cada 5 s. |
| `mensaje` | Cliente → Servidor | `{ texto }` | El cliente envía un mensaje. |
| `mensaje` | Servidor → **Todos** | `{ usuario, texto, hora }` | El servidor lo difunde completo. |
| `mensajeSistema` | Servidor → **Todos** | string texto | Avisos de conexión/desconexión. |
| `usuarios` | Servidor → **Todos** | `[nombre, ...]` | Lista actualizada de conectados. |
| `connection` | (interno Socket.io) | `socket` | Se dispara al conectarse un cliente. |
| `disconnect` | (interno Socket.io) | (sin datos) | Se dispara al desconectarse. |

---

## 6. Recorrido de un mensaje (end-to-end)

Ejemplo: **Ana** escribe "hola" y aprieta Enter. Hay otro cliente, **Beto**.

```
1. [Cliente Ana]  Enter en el input
       │  RxJS: enterMensaje$ → merge → map("hola") → filter(ok) → subscribe
       ▼
2. [Cliente Ana]  socket.emit('mensaje', { texto: 'hola' })
       │  viaja por WebSocket
       ▼
3. [Servidor]     socket.on('mensaje'): busca el nombre por socket.id ("Ana"),
                  arma { usuario:'Ana', texto:'hola', hora:'14:05:01' }
       │
       ▼
4. [Servidor]     io.emit('mensaje', {...})   ← BROADCAST a TODOS
       │                         │
       ▼                         ▼
5. [Cliente Ana]          [Cliente Beto]
   fromEvent(socket,'mensaje')   fromEvent(socket,'mensaje')
   → map → merge → scan          → map → merge → scan
   → render + auto-scroll        → render + auto-scroll
```

Lo clave: **Ana emite una sola vez** y el servidor se encarga de que el mensaje aparezca en **todas** las pantallas (incluida la de Ana). Eso es el modelo *push* + *broadcast*.

---

## 7. Glosario rápido

- **WebSocket**: canal TCP persistente y bidireccional sobre el que viajan los datos en tiempo real.
- **Socket.io**: librería que usa WebSocket y agrega eventos con nombre, reconexión y broadcast. Tiene parte de servidor y parte de cliente.
- **`io`** (servidor): el servidor Socket.io completo; `io.emit` = a **todos**.
- **`socket`**: la conexión de **un** cliente; `socket.emit` = solo a **ese** cliente.
- **`socket.id`**: identificador único de cada conexión.
- **`emit` / `on`**: enviar / escuchar un evento.
- **broadcast**: enviar a todos los clientes (`io.emit`).
- **push**: el servidor envía sin que el cliente lo pida.
- **polling**: lo contrario; el cliente pregunta cada tanto (lo que evitamos).
- **Observable** (RxJS): secuencia de valores que llegan en el tiempo.
- **operador** (RxJS): función que transforma un Observable (`map`, `filter`, `scan`, `merge`).
- **`pipe`**: encadena operadores.
- **`subscribe`**: ejecuta el efecto final por cada valor emitido.
- **`scan`**: acumula estado en el tiempo (como `reduce`, pero emitiendo en cada paso).
- **`$` al final**: convención de nombre para variables que son Observables.
- **XSS**: ataque por inyección de HTML/JS; lo evitamos usando `textContent`.
```
