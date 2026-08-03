import { env } from './env.js';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { RunRegistry } from './runs.js';
import { CreateRunBodySchema, ClientCommandSchema } from './types.js';
import { startRun } from './agent/loop.js';
import { loadFixtures } from './fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const registry = new RunRegistry();
const fixtureCount = loadFixtures(registry);

const app = Fastify({
  logger: { level: env.NODE_ENV === 'development' ? 'info' : 'warn' },
});

await app.register(fastifyWebsocket);

// Serve built web UI from server/public/
await app.register(fastifyStatic, {
  root: join(__dirname, '../public'),
  prefix: '/',
  decorateReply: false,
});

// POST /api/runs — start a new run
app.post('/api/runs', async (req, reply) => {
  const body = CreateRunBodySchema.safeParse(req.body);
  if (!body.success) {
    return reply.status(400).send({ error: body.error.flatten() });
  }

  const { record, bus } = registry.create(body.data.goal);

  startRun({
    record,
    bus,
    registry,
    apiKey: env.ANTHROPIC_API_KEY,
    autonomy: body.data.autonomy,
  }).catch((err: unknown) => {
    app.log.error(err, 'Unhandled startRun error');
  });

  return reply.status(201).send({ id: record.id, status: record.status });
});

// GET /api/runs/:id — return the full run record + event log
app.get('/api/runs/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const run = registry.get(id);
  if (!run) return reply.status(404).send({ error: 'Run not found' });
  return reply.send(run.record);
});

// GET /api/runs — list all runs
app.get('/api/runs', async (_req, reply) => {
  return reply.send(registry.list().map((r) => ({ id: r.id, goal: r.goal, status: r.status, createdAt: r.createdAt })));
});

// WS /api/runs/:id/stream — live event stream + command ingestion
app.get('/api/runs/:id/stream', { websocket: true }, (socket, req) => {
  const { id } = (req.params as { id: string });
  const run = registry.get(id);
  if (!run) {
    socket.close(4004, 'Run not found');
    return;
  }
  const { record, bus } = run;

  // Replay all past events immediately so a refresh reconstructs the full UI
  for (const ev of record.events) {
    socket.send(JSON.stringify(ev));
  }

  // Forward future events
  const stopListening = bus.onEvent((ev) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(ev));
    }
  });

  // Accept commands from the client
  socket.on('message', (raw: Buffer) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const result = ClientCommandSchema.safeParse(parsed);
    if (!result.success) return;
    bus.sendCommand(result.data);
  });

  socket.on('close', () => {
    stopListening();
  });
});

// SPA fallback — serve index.html for any unknown path
app.setNotFoundHandler(async (_req, reply) => {
  return reply.sendFile('index.html');
});

await app.listen({ port: env.PORT, host: '0.0.0.0' });
app.log.info(`Ariadne running at http://0.0.0.0:${env.PORT}`);
if (fixtureCount > 0) app.log.info(`Loaded ${fixtureCount} fixture run(s) — viewable at /?run=fixture-linear`);
