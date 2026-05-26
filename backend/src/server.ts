import http from 'http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { corsOrigins, env } from './config/env.js';

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: corsOrigins, credentials: true } });

app.set('io', io);

io.on('connection', (socket) => {
  socket.emit('connected', { socketId: socket.id });
});

server.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});
