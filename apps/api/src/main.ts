import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { config } from './config.js';

async function bootstrap() {
  const adapter = new FastifyAdapter({
    // Outlive the idle timeout of HTTP clients (the web server, judges) so a
    // pooled connection is never closed underneath a request in flight.
    keepAliveTimeout: 65_000,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { bodyParser: false });
  const fastify = app.getHttpAdapter().getInstance();

  // oRPC reads and parses request bodies itself (JSON and multipart
  // uploads), so Fastify must leave the stream untouched for every type.
  fastify.removeAllContentTypeParsers();
  fastify.addContentTypeParser('*', (_request, _payload, done) => done(null, undefined));

  // Bodies are buffered in memory, so refuse oversized ones up front —
  // before any handler (or its authorization check) runs.
  fastify.addHook('onRequest', async (request, reply) => {
    if (Number(request.headers['content-length'] ?? 0) > config.maxUploadBytes) {
      return reply.code(413).send({ code: 'PAYLOAD_TOO_LARGE', status: 413, message: 'Request body is too large' });
    }
  });

  app.enableShutdownHooks();
  await app.listen(config.port, config.host);
  new Logger('Bootstrap').log(`API listening on http://${config.host}:${config.port}`);
}

void bootstrap();
