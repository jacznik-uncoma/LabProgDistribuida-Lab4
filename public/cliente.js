const socket = io(); // abre la conexion WebSocket al mismo host que sirvio la pagina

const { fromEvent, merge } = rxjs; // funciones de creacion de Observables
const { map, filter, scan } = rxjs.operators; // operadores para transformar los flujos

// Referencias a los elementos del DOM
const login = document.getElementById('login');
const chat = document.getElementById('chat');

const txtNombre = document.getElementById('txtNombre');
const btnIngresar = document.getElementById('btnIngresar');

const reloj = document.getElementById('reloj');
const anuncio = document.getElementById('anuncio');

const txtMensaje = document.getElementById('txtMensaje');
const btnEnviar = document.getElementById('btnEnviar');
const listaMensajes = document.getElementById('mensajes');
const listaUsuarios = document.getElementById('usuarios');

const esEnter = (event) => // true si la tecla presionada es Enter
    event.key === 'Enter' || event.code === 'NumpadEnter';

// INGRESO: dos formas de entrar -> clic en el boton o Enter en el input
const clickIngresar$ = fromEvent(btnIngresar, 'click'); // flujo de clics

const enterNombre$ = fromEvent(txtNombre, 'keydown').pipe(
    filter(esEnter) // deja pasar solo cuando es Enter
);

// merge une ambos flujos; map saca el texto; filter descarta vacios
merge(clickIngresar$, enterNombre$).pipe(
    map(() => txtNombre.value.trim()),
    filter((nombre) => nombre !== '')
).subscribe((nombre) => {
    socket.emit('registrarUsuario', nombre); // pide el alta al servidor
});

// fromEvent tambien funciona con el socket: el servidor confirma el alta
fromEvent(socket, 'usuarioRegistrado').subscribe(() => {
    login.style.display = 'none'; // oculta el login
    chat.style.display = 'block'; // muestra el chat
    txtMensaje.focus();
});


// RELOJ: cada hora que empuja el servidor actualiza el texto
fromEvent(socket, 'hora').subscribe((horaActual) => {
    reloj.textContent = horaActual;
});


// ANUNCIOS: muestra el anuncio que empuja el servidor
fromEvent(socket, 'anuncio').subscribe((texto) => {
    anuncio.textContent = texto;
});

// ENVIO: mismo patron que el ingreso (clic o Enter)
const clickEnviar$ = fromEvent(btnEnviar, 'click');

const enterMensaje$ = fromEvent(txtMensaje, 'keydown').pipe(
    filter(esEnter)
);

merge(clickEnviar$, enterMensaje$).pipe(
    map(() => txtMensaje.value.trim()),
    filter((texto) => texto !== '')
).subscribe((texto) => {
    socket.emit('mensaje', { texto }); // manda solo el texto (el server agrega usuario y hora)
    txtMensaje.value = ''; // limpia el input
    txtMensaje.focus();
});


// Mensajes de usuarios -> los normalizo a un formato comun
const mensajeChat$ = fromEvent(socket, 'mensaje').pipe(
    map((datos) => ({
        tipo: 'usuario',
        usuario: datos.usuario,
        texto: datos.texto,
        hora: datos.hora,
    }))
);

// Mensajes del sistema (conexion/desconexion) -> mismo formato
const mensajeSistema$ = fromEvent(socket, 'mensajeSistema').pipe(
    map((texto) => ({
        tipo: 'sistema',
        texto,
    }))
);


// scan acumula el historial completo (como un reduce que emite en cada mensaje)
merge(mensajeChat$, mensajeSistema$).pipe(
    scan((historial, mensaje) => [...historial, mensaje], [])
).subscribe((historial) => {

    listaMensajes.innerHTML = ''; // limpia y vuelve a dibujar toda la lista

    historial.forEach((mensaje) => {

        const li = document.createElement('li');

        if (mensaje.tipo === 'sistema') {
            li.className = 'msg-sistema';
            li.textContent = `[Sistema] ${mensaje.texto}`;
        } else {
            li.className = 'msg-usuario';
            li.textContent = // textContent (no innerHTML) evita inyeccion de HTML (XSS)
                `${mensaje.hora} - ${mensaje.usuario}: ${mensaje.texto}`;
        }

        listaMensajes.appendChild(li);

    });

    listaMensajes.scrollTop = listaMensajes.scrollHeight; // auto-scroll al ultimo mensaje

});

// USUARIOS: redibuja la lista de conectados cada vez que cambia
fromEvent(socket, 'usuarios').subscribe((usuarios) => {

    listaUsuarios.innerHTML = '';

    usuarios.forEach((usuario) => {
        const li = document.createElement('li');
        li.textContent = usuario;
        listaUsuarios.appendChild(li);
    });

});
