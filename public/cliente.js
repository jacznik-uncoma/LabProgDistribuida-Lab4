const socket = io();

const { fromEvent, merge } = rxjs;
const { map, filter, scan } = rxjs.operators;

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

const esEnter = (event) =>
    event.key === 'Enter' || event.code === 'NumpadEnter';

const clickIngresar$ = fromEvent(btnIngresar, 'click');

const enterNombre$ = fromEvent(txtNombre, 'keydown').pipe(
    filter(esEnter)
);

merge(clickIngresar$, enterNombre$).pipe(
    map(() => txtNombre.value.trim()),
    filter((nombre) => nombre !== '')
).subscribe((nombre) => {
    socket.emit('registrarUsuario', nombre);
});

fromEvent(socket, 'usuarioRegistrado').subscribe(() => {
    login.style.display = 'none';
    chat.style.display = 'block';
    txtMensaje.focus();
});


fromEvent(socket, 'hora').subscribe((horaActual) => {
    reloj.textContent = horaActual;
});


fromEvent(socket, 'anuncio').subscribe((texto) => {
    anuncio.textContent = texto;
});

const clickEnviar$ = fromEvent(btnEnviar, 'click');

const enterMensaje$ = fromEvent(txtMensaje, 'keydown').pipe(
    filter(esEnter)
);

merge(clickEnviar$, enterMensaje$).pipe(
    map(() => txtMensaje.value.trim()),
    filter((texto) => texto !== '')
).subscribe((texto) => {
    socket.emit('mensaje', { texto });
    txtMensaje.value = '';
    txtMensaje.focus();
});


const mensajeChat$ = fromEvent(socket, 'mensaje').pipe(
    map((datos) => ({
        tipo: 'usuario',
        usuario: datos.usuario,
        texto: datos.texto,
        hora: datos.hora,
    }))
);

const mensajeSistema$ = fromEvent(socket, 'mensajeSistema').pipe(
    map((texto) => ({
        tipo: 'sistema',
        texto,
    }))
);


merge(mensajeChat$, mensajeSistema$).pipe(
    scan((historial, mensaje) => [...historial, mensaje], [])
).subscribe((historial) => {

    listaMensajes.innerHTML = '';

    historial.forEach((mensaje) => {

        const li = document.createElement('li');

        if (mensaje.tipo === 'sistema') {
            li.className = 'msg-sistema';
            li.textContent = `[Sistema] ${mensaje.texto}`;
        } else {
            li.className = 'msg-usuario';
            li.textContent =
                `${mensaje.hora} - ${mensaje.usuario}: ${mensaje.texto}`;
        }

        listaMensajes.appendChild(li);

    });

    listaMensajes.scrollTop = listaMensajes.scrollHeight;

});

fromEvent(socket, 'usuarios').subscribe((usuarios) => {

    listaUsuarios.innerHTML = '';

    usuarios.forEach((usuario) => {
        const li = document.createElement('li');
        li.textContent = usuario;
        listaUsuarios.appendChild(li);
    });

});
