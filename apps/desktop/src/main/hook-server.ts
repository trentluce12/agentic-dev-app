import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { HookPayload } from '@agentic-dev-app/claude-protocol';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppDatabase } from './db/index.ts';

export interface HookServerOptions {
  db: AppDatabase;
  /** Override for tests. In prod, generated and stored via keytar. */
  token?: string;
  /** Bind to this port; 0 = ephemeral. */
  port?: number;
}

export interface HookServerHandle {
  url: string;
  token: string;
  port: number;
  stop: () => Promise<void>;
  onEvent: (listener: (payload: HookPayload) => void) => () => void;
}

/**
 * Loopback-only Fastify server that receives Claude hook POSTs.
 *
 * Contract: handler must respond in <5ms — push payload into the emitter
 * and return. DB writes, correlation, and rendering happen downstream.
 */
export async function startHookServer(options: HookServerOptions): Promise<HookServerHandle> {
  const token = options.token ?? randomBytes(24).toString('base64url');
  const emitter = new EventEmitter();
  const app: FastifyInstance = Fastify({ logger: false, disableRequestLogging: true });

  app.post('/hook', async (req, reply) => {
    const provided = (req.query as { token?: string })?.token ?? req.headers['x-hook-token'];
    if (provided !== token) {
      reply.code(401).send({ ok: false });
      return;
    }
    const payload = req.body as HookPayload;
    emitter.emit('payload', payload);
    reply.code(200).send({ ok: true });
  });

  app.get('/healthz', async () => ({ ok: true }));

  const port = options.port ?? 0;
  await app.listen({ host: '127.0.0.1', port });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Hook server failed to bind');
  }
  const url = `http://127.0.0.1:${address.port}/hook?token=${token}`;

  return {
    url,
    token,
    port: address.port,
    stop: () => app.close(),
    onEvent: (listener) => {
      emitter.on('payload', listener);
      return () => emitter.off('payload', listener);
    },
  };
}
