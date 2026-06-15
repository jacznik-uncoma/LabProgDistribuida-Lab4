const socket = io();

// =====================
// LOGIN
// =====================

const login =
    document.getElementById('login');

const chat =
    document.getElementById('chat');

const txtNombre =
    document.getElementById('txtNombre');

const btnIngresar =
    document.getElementById('btnIngresar');

// =====================
// RELOJ
// =====================

const reloj =
    document.getElementById('reloj');

// =====================
// CHAT
// =====================

const txtMensaje =
    document.getElementById('txtMensaje');

const btnEnviar =
    document.getElementById('btnEnviar');

const listaMensajes =
    document.getElementById('mensajes');

const listaUsuarios =
    document.getElementById('usuarios');

// =====================
// INGRESO DE USUARIO
// =====================

btnIngresar.addEventListener(
    'click',
    () => {

        const nombre =
            txtNombre.value.trim();

        if (nombre === '') {
            return;
        }

        socket.emit(
            'registrarUsuario',
            nombre
        );

    }
);

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
);

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
);

socket.on(
    'mensaje',
    (datos) => {

        const li =
            document.createElement('li');

        li.textContent =
            `${datos.usuario}: ${datos.texto}`;

        listaMensajes.appendChild(li);

    }
);

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
);

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
);