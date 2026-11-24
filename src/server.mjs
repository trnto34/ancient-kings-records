import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import app from './app.mjs';
import { openDatabase } from './sqlite.mjs';
import { seedCatalogue } from './data.mjs';
import { seedBandcamp } from './bandcamp.mjs';

const project = fileURLToPath(new URL('..', import.meta.url));
const database = openDatabase(process.env.DATABASE_PATH === ':memory:' ? ':memory:' : resolve(project, process.env.DATABASE_PATH ?? 'data/store.sqlite'));
const demo = process.env.SEED_DEMO;
await seedCatalogue(database, demo === 'samples');
if (demo !== 'false' && demo !== 'samples') await seedBandcamp(database);

const server = new Hono();
server.use('/assets/*', serveStatic({
  root: resolve(project, 'public'),
  onFound: (_path, c) => c.header('Cache-Control', 'public, max-age=3600'),
}));
server.route('/', app);

const { values } = parseArgs({ options: {
  host: { type: 'string' },
  port: { type: 'string' },
  strictPort: { type: 'boolean' },
} });
const port = Number(values.port ?? process.env.PORT ?? 3000);
const hostname = values.host ?? process.env.HOST ?? '0.0.0.0';
serve({
  fetch: request => server.fetch(request, { ...process.env, DB: database }),
  port,
  hostname,
}, info => console.log(`Ancient King Records is listening on port ${info.port}.`));
