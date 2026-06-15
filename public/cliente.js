const socket = io();

const { fromEvent, merge } = rxjs; // Importamos las funciones necesarias de RxJS
const { map, filter } = rxjs.operators; // Importamos los operadores necesarios de RxJS

// =====================
// LOGIN
// =====================

const login =
    document.getElementById('login'); // Contenedor del login

const chat =
    document.getElementById('chat'); // Contenedor del chat (inicialmente oculto)

const txtNombre =
    document.getElementById('txtNombre'); // Campo de texto para ingresar el nombre de usuario

const btnIngresar =
    document.getElementById('btnIngresar'); // Botón para ingresar al chat

// =====================
// RELOJ
// =====================

const reloj =
    document.getElementById('reloj'); // Elemento para mostrar la hora

// =====================
// CHAT
// =====================

const txtMensaje =
    document.getElementById('txtMensaje'); // Campo de texto para ingresar mensajes

const btnEnviar =
    document.getElementById('btnEnviar'); // Botón para enviar mensajes

const listaMensajes =
    document.getElementById('mensajes'); // Lista de mensajes

const listaUsuarios =
    document.getElementById('usuarios'); // Lista de usuarios

// =====================
// INGRESO DE USUARIO
// =====================

const clickIngresar$ =
    fromEvent(btnIngresar, 'click'); // Observable para el evento de clic en el botón de ingresar

const enterNombre$ =
    fromEvent(txtNombre, 'keydown').pipe(
        filter(
            (event) =>
                event.key === 'Enter' ||
                event.code === 'NumpadEnter'
        )
    ); // Observable para el evento de presionar Enter en el campo de nombre

merge(clickIngresar$, enterNombre$).pipe(
    map(() => txtNombre.value.trim()),
    filter((nombre) => nombre !== '')
).subscribe((nombre) => {

    socket.emit(
        'registrarUsuario',
        nombre
    ); // Emitimos el evento para registrar el usuario con el nombre ingresado

}); // Combinamos ambos eventos (clic y Enter) para registrar al usuario de manera más intuitiva

socket.on(
    'usuarioRegistrado',
    () => {

        login.style.display = 'none';

        chat.style.display = 'block';

    }
);

// =====================
// RELOJ
// =====================

socket.on(
    'hora',
    (horaActual) => {

        reloj.textContent =
            horaActual;

    }
); // Actualizamos el contenido del elemento del reloj con la hora actual recibida del servidor

// =====================
// MENSAJES DEL CHAT
// =====================

btnEnviar.addEventListener(
    'click',
    () => {

        const texto =
            txtMensaje.value.trim();

        if (texto === '') {
            return;
        }

        socket.emit(
            'mensaje',
            {
                texto: texto
            }
        );

        txtMensaje.value = '';

    }
); // Agregamos un evento de clic al botón de enviar para emitir el mensaje al servidor, asegurándonos de que el mensaje no esté vacío

socket.on(
    'mensaje',
    (datos) => {

        const li =
            document.createElement('li');

        li.textContent =
            `${datos.usuario}: ${datos.texto}`;

        listaMensajes.appendChild(li);

    }
); // Escuchamos el evento de mensaje para agregar el mensaje recibido a la lista de mensajes en el chat

// =====================
// MENSAJES DEL SISTEMA
// =====================

socket.on(
    'mensajeSistema',
    (texto) => {

        const li =
            document.createElement('li');

        li.textContent =
            `[Sistema] ${texto}`;

        listaMensajes.appendChild(li);

    }
); // Escuchamos el evento de mensaje del sistema para agregar los mensajes del sistema a la lista de mensajes en el chat

// =====================
// LISTA DE USUARIOS
// =====================

socket.on(
    'usuarios',
    (usuarios) => {

        listaUsuarios.innerHTML = '';

        usuarios.forEach((usuario) => {

            const li =
                document.createElement('li');

            li.textContent =
                usuario;

            listaUsuarios.appendChild(li);

        });

    }
); // Escuchamos el evento de usuarios para actualizar la lista de usuarios conectados en el chat cada vez que se recibe una actualización del servidor