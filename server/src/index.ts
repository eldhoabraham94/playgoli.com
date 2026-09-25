import { createApp } from './app';

const app = createApp();
const port = await app.listen();
console.log(`Goli server listening on http://localhost:${port}`);
console.log(app.servesClient ? `Serving the client from ${app.cfg.staticDir}` : 'No client build found (API + sockets only)');

// Render/Fly send SIGTERM on deploy: close sockets cleanly.
const shutdown = () => {
  void app.close().then(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
