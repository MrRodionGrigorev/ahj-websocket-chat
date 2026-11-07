import { createChatServer } from './app.js';

const port = Number(process.env.PORT || 3000);
const server = createChatServer();
server.listen(port, '0.0.0.0', () => console.info(`Chat server: http://localhost:${port}`));
server.on('error', (error) => {
  console.error(`Не удалось запустить сервер: ${error.code}`);
  process.exitCode = 1;
});
