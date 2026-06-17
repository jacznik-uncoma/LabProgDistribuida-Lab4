const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

app.use(express.static('public'));

const servidorHTTP = http.createServer(app);

const io = new Server(servidorHTTP);

const usuarios = new Map();

const listaDeNombres = () => Array.from(usuarios.values());

const ahora = () => new Date().toLocaleTimeString();

setInterval(() => {

    io.emit('hora', ahora());

}, 1000);

const anuncios = [
    'Bienvenidos al Laboratorio de Programacion Distribuida',
    'El servidor empuja los datos al cliente (push), sin refrescar la pagina',
    'Comunicacion bidireccional con Socket.io + RxJS',
    'Facultad de Informatica - UNCOMA',
];

let indiceAnuncio = 0;

setInterval(() => {

    io.emit('anuncio', anuncios[indiceAnuncio]);

    indiceAnuncio = (indiceAnuncio + 1) % anuncios.length;

}, 5000);

io.on('connection', (socket) => {

    console.log('Cliente conectado:', socket.id);

    // Registro de usuario
    socket.on('registrarUsuario', (nombre) => {

        const nombreLimpio = String(nombre || '').trim();

        if (nombreLimpio === '') {
            return;
        }

        usuarios.set(socket.id, nombreLimpio);

        console.log(`${nombreLimpio} se ha conectado`);

        socket.emit('usuarioRegistrado');

        // Mostramos el anuncio actual
        socket.emit('anuncio', anuncios[indiceAnuncio]);

        io.emit('mensajeSistema', `${nombreLimpio} se ha conectado`);

        io.emit('usuarios', listaDeNombres());

    });

    // Mensajes del chat
    socket.on('mensaje', (datos) => {

        const nombre = usuarios.get(socket.id);

        if (!nombre) {
            return;
        }

        const texto = String((datos && datos.texto) || '').trim();

        if (texto === '') {
            return;
        }

        io.emit('mensaje', {
            usuario: nombre,
            texto: texto,
            hora: ahora(),
        });

    });

    // Desconexion
    socket.on('disconnect', () => {

        const nombre = usuarios.get(socket.id);

        if (!nombre) {
            return;
        }

        usuarios.delete(socket.id);

        console.log(`${nombre} se ha desconectado`);

        io.emit('mensajeSistema', `${nombre} se ha desconectado`);

        io.emit('usuarios', listaDeNombres());

    });

});

servidorHTTP.listen(3000, () => {

    console.log('Servidor escuchando en puerto 3000');

});
