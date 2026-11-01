// Single entry point: serves the REST API under /api and the React app.
//   node server/index.js --dev   -> Vite runs inside Express (hot reload)
//   node server/index.js         -> serves the built app from dist/
import './env.js'; // must stay the first import
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { api } from './api.js';
import { auth, migrateAuth } from './auth.js';
import { migrate } from './db.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isDev = process.argv.includes('--dev');
const port = Number(process.env.PORT) || 3000;

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1); // hosts terminate TLS in front of us; keeps secure cookies/IPs correct

await migrate();
await migrateAuth();

// Better Auth must be mounted BEFORE any body parser (api.js adds express.json()).
app.all('/api/auth/*', toNodeHandler(auth));
app.use('/api', api);

if (isDev) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root,
    appType: 'spa',
    server: { middlewareMode: true, hmr: { server } },
  });
  app.use(vite.middlewares);
} else {
  const dist = path.join(root, 'dist');
  app.use(express.static(dist));
  // Client-side routes all load the SPA shell.
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

server.listen(port, () => {
  console.log(`__APP_NAME__ running at http://localhost:${port} (${isDev ? 'development' : 'production'})`);
});
