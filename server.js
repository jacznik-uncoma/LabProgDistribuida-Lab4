require('dotenv').config(); // carga las variables del archivo .env en process.env

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

app.use(express.static('public')); // sirve index.html, cliente.js y css desde /public

const servidorHTTP = http.createServer(app); // server HTTP (Socket.io se engancha aca)

const io = new Server(servidorHTTP); // io = servidor Socket.io (todos los clientes)

// Puerto configurable por variable de entorno; 3000 es solo el valor por defecto
const PUERTO = process.env.PORT || 3000;

const usuarios = new Map(); // socket.id -> nombre (id unico, evita borrar al usuario equivocado)

const listaDeNombres = () => Array.from(usuarios.values()); // solo los nombres, para enviar al cliente

const ahora = () => new Date().toLocaleTimeString();

// RELOJ: empuja la hora a TODOS cada 1 segundo (io.emit = broadcast)
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

// ANUNCIOS: rota el anuncio y lo empuja a TODOS cada 5 segundos
setInterval(() => {

    io.emit('anuncio', anuncios[indiceAnuncio]);

    indiceAnuncio = (indiceAnuncio + 1) % anuncios.length; // vuelve al primero al llegar al final

}, 5000);

// Se ejecuta UNA vez por cada cliente que se conecta. `socket` = ese cliente puntual
io.on('connection', (socket) => {

    console.log('Cliente conectado:', socket.id);

    // Registro de usuario
    socket.on('registrarUsuario', (nombre) => {

        const nombreLimpio = String(nombre || '').trim();

        if (nombreLimpio === '') {
            return; // ignora nombres vacios (validacion del lado servidor)
        }

        usuarios.set(socket.id, nombreLimpio); // guarda el nombre asociado a esta conexion

        console.log(`${nombreLimpio} se ha conectado`);

        socket.emit('usuarioRegistrado'); // confirma SOLO a este cliente (pasa del login al chat)

        // Mostramos el anuncio actual
        socket.emit('anuncio', anuncios[indiceAnuncio]); // anuncio vigente, sin esperar el ciclo

        io.emit('mensajeSistema', `${nombreLimpio} se ha conectado`); // avisa a TODOS

        io.emit('usuarios', listaDeNombres()); // actualiza la lista de conectados en TODOS

    });

    // Mensajes del chat
    socket.on('mensaje', (datos) => {

        const nombre = usuarios.get(socket.id); // de quien es este socket

        if (!nombre) {
            return; // si no esta registrado, no se difunde
        }

        const texto = String((datos && datos.texto) || '').trim();

        if (texto === '') {
            return;
        }

        // El servidor completa usuario y hora (el cliente solo manda el texto) y difunde a TODOS
        io.emit('mensaje', {
            usuario: nombre,
            texto: texto,
            hora: ahora(),
        });

    });

    // Desconexion (se dispara solo al cerrar pestania o caerse la red)
    socket.on('disconnect', () => {

        const nombre = usuarios.get(socket.id);

        if (!nombre) {
            return; // nunca se registro: nada que limpiar
        }

        usuarios.delete(socket.id); // saca al usuario del Map

        console.log(`${nombre} se ha desconectado`);

        io.emit('mensajeSistema', `${nombre} se ha desconectado`);

        io.emit('usuarios', listaDeNombres());

    });

});

// Levanta HTTP + Socket.io en el puerto configurado
servidorHTTP.listen(PUERTO, () => {

    console.log(`Servidor escuchando en puerto ${PUERTO}`);

});
