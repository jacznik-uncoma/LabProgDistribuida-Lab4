const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

app.use(express.static('public'));

const servidorHTTP = http.createServer(app);

const io = new Server(servidorHTTP);

const usuarios = [];

// =====================
// RELOJ GLOBAL
// =====================

setInterval(() => {

    io.emit(
        'hora',
        new Date().toLocaleTimeString()
    );

}, 1000);

// =====================
// SOCKETS
// =====================

io.on('connection', (socket) => {

    console.log('Cliente conectado:', socket.id);

    // Registro de usuario
    socket.on('registrarUsuario', (nombre) => {

        socket.nombre = nombre;

        usuarios.push(nombre);

        console.log(`${nombre} se ha conectado`);

        socket.emit('usuarioRegistrado');

        io.emit(
            'mensajeSistema',
            `${nombre} se ha conectado`
        );

        io.emit(
            'usuarios',
            usuarios
        );

    });

    // Mensajes del chat
    socket.on('mensaje', (datos) => {

        io.emit(
            'mensaje',
            {
                usuario: socket.nombre,
                texto: datos.texto
            }
        );

    });

    // Desconexión
    socket.on('disconnect', () => {

        if (!socket.nombre) {
            return;
        }

        const indice =
            usuarios.indexOf(socket.nombre);

        if (indice !== -1) {
            usuarios.splice(indice, 1);
        }

        console.log(
            `${socket.nombre} se ha desconectado`
        );

        io.emit(
            'mensajeSistema',
            `${socket.nombre} se ha desconectado`
        );

        io.emit(
            'usuarios',
            usuarios
        );

    });

});

servidorHTTP.listen(3000, () => {

    console.log(
        'Servidor escuchando en puerto 3000'
    );

});