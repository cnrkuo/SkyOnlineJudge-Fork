import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module.js';
import { config } from './config.js';

async function bootstrap() {
  // oRPC parses request bodies itself (JSON and multipart uploads).
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableShutdownHooks();
  // Bodies are buffered in memory, so refuse oversized ones up front —
  // before any handler (or its authorization check) runs.
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (Number(request.headers['content-length'] ?? 0) > config.maxUploadBytes) {
      response.status(413).json({ code: 'PAYLOAD_TOO_LARGE', status: 413, message: 'Request body is too large' });
      return;
    }
    next();
  });
  // Outlive the idle timeout of HTTP clients (the web server, judges) so a
  // pooled connection is never closed underneath a request in flight.
  app.getHttpServer().keepAliveTimeout = 65_000;
  await app.listen(config.port, config.host);
  new Logger('Bootstrap').log(`API listening on http://${config.host}:${config.port}`);
}

void bootstrap();
