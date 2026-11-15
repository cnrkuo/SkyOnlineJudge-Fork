// Production server for the web app: what `react-router-serve` does
// (compression, static assets, request log), plus trusting a reverse proxy.
//
// Behind a proxy that terminates TLS (Caddy, nginx, Traefik) the browser
// talks HTTPS but this server receives plain HTTP. React Router refuses a
// form submission whose `Origin` header does not match the request's own
// origin (its protection against cross-site requests), so the request URL
// must be rebuilt from the proxy's X-Forwarded-Proto / X-Forwarded-Host —
// which Express only reads from proxies it trusts.
//
// TRUST_PROXY (Express's "trust proxy" setting):
//   unset            loopback and private addresses (a proxy on this host,
//                    or in the same Docker network) — the default
//   false            no proxy: ignore X-Forwarded-* headers
//   true             any proxy (only if nothing else can reach this server)
//   a number         that many proxy hops
//   addresses        a comma-separated list of addresses or subnets
import path from 'node:path';
import { createRequestHandler } from '@react-router/express';
import compression from 'compression';
import express from 'express';
import morgan from 'morgan';

const build = await import('./build/server/index.js');

function trustProxySetting(value = '') {
  const setting = value.trim();
  if (setting === '') return 'loopback, linklocal, uniquelocal';
  if (setting === 'false') return false;
  if (setting === 'true') return true;
  if (/^\d+$/.test(setting)) return Number(setting);
  return setting;
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', trustProxySetting(process.env.TRUST_PROXY));
app.use(compression());
const client = path.resolve('build/client');
// Fingerprinted files never change; everything else may.
app.use('/assets', express.static(path.join(client, 'assets'), { immutable: true, maxAge: '1y' }));
app.use(express.static(client, { maxAge: '1h' }));
app.use(morgan('tiny'));
app.all('/{*splat}', createRequestHandler({ build, mode: process.env.NODE_ENV }));

const port = Number(process.env.PORT) || 3000;
const server = process.env.HOST ? app.listen(port, process.env.HOST) : app.listen(port);
server.on('listening', () => console.log(`[web] listening on port ${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close());
