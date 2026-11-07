import { randomUUID } from 'node:crypto';
import http from 'node:http';
import cors from 'cors';
import express from 'express';
import WebSocket, { WebSocketServer } from 'ws';

export function createChatServer({ disconnectGraceMs = 3000 } = {}) {
  const app = express();
  const users = new Map();
  const sockets = new Map();

  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (_request, response) => response.json({ status: 'ok' }));
  app.post('/new-user', (request, response) => {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
    if (!name || name.length > 30) {
      return response.status(400).json({ status: 'error', message: 'Введите имя длиной от 1 до 30 символов' });
    }
    const key = name.toLocaleLowerCase('ru-RU');
    const duplicate = [...users.values()].some((user) => user.key === key);
    if (duplicate) return response.status(409).json({ status: 'error', message: 'Это имя уже занято' });
    const user = { id: randomUUID(), name, key, connected: false, removalTimer: null };
    users.set(user.id, user);
    const pendingTimer = setTimeout(() => {
      if (!user.connected) users.delete(user.id);
    }, 15000);
    pendingTimer.unref();
    user.removalTimer = pendingTimer;
    return response.status(201).json({ status: 'ok', user: { id: user.id, name: user.name } });
  });
  app.use((_request, response) => response.status(404).json({ message: 'Ресурс не найден' }));
  app.use((error, _request, response, _next) => {
    if (error.type === 'entity.parse.failed') return response.status(400).json({ message: 'Некорректный JSON' });
    return response.status(500).json({ message: 'Внутренняя ошибка сервера' });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });
  const publicUser = ({ id, name }) => ({ id, name });
  const activeUsers = () => [...users.values()].filter((user) => user.connected).map(publicUser);
  const broadcast = (value) => {
    const data = JSON.stringify(value);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  };
  const removeUser = (id) => {
    const user = users.get(id);
    if (!user) return;
    clearTimeout(user.removalTimer);
    users.delete(id);
    sockets.delete(id);
    broadcast(activeUsers());
  };

  wss.on('connection', (socket, request) => {
    const url = new URL(request.url, 'http://localhost');
    const user = users.get(url.searchParams.get('userId'));
    if (!user) {
      socket.close(1008, 'Unknown user');
      return;
    }
    clearTimeout(user.removalTimer);
    const previous = sockets.get(user.id);
    if (previous && previous !== socket && previous.readyState === WebSocket.OPEN) previous.close(1000, 'Reconnected');
    user.connected = true;
    user.removalTimer = null;
    sockets.set(user.id, socket);
    socket.userId = user.id;
    socket.isAlive = true;
    broadcast(activeUsers());

    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('message', (buffer, isBinary) => {
      if (isBinary) return;
      let payload;
      try { payload = JSON.parse(buffer.toString()); } catch { return; }
      if (payload.type === 'exit') {
        removeUser(user.id);
        socket.close(1000, 'Exit');
        return;
      }
      const message = typeof payload.message === 'string' ? payload.message.trim() : '';
      if (payload.type !== 'send' || !message || message.length > 2000) return;
      broadcast({ type: 'send', message, user: publicUser(user), created: Date.now() });
    });
    socket.on('close', () => {
      if (sockets.get(user.id) !== socket || !users.has(user.id)) return;
      user.connected = false;
      user.removalTimer = setTimeout(() => removeUser(user.id), disconnectGraceMs);
      user.removalTimer.unref();
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) socket.terminate();
      else { socket.isAlive = false; socket.ping(); }
    }
  }, 25000);
  heartbeat.unref();
  server.on('close', () => {
    clearInterval(heartbeat);
    for (const user of users.values()) clearTimeout(user.removalTimer);
    wss.close();
  });
  return server;
}
