# Deployment with Docker

Two Compose files describe the same five services, configured for two
different jobs:

| | Development: `compose.yaml` | Production: `compose.prod.yaml` |
| --- | --- | --- |
| Start | `pnpm docker:dev` (`docker compose up --build`) | `pnpm docker:prod` (`sh docker/prod.sh`) |
| Project / volumes | `skyoj-dev` | `skyoj` (separate data; both can exist side by side) |
| API, web, contract | One Node image (`docker/dev.Dockerfile`) runs the watch scripts on the bind-mounted working copy | Built images `skyoj/api`, `skyoj/web` with production dependencies only, running as `node` |
| Judge | `judge/Dockerfile`, same as production | `skyoj/judge` |
| Secrets | Fixed, well-known development values | Generated into `.env.production` on first run; Compose refuses to start without them |
| Published ports | Web 3000, API 3001, PostgreSQL 5432, RabbitMQ 5672 + console 15672, all on 127.0.0.1 | Web on `WEB_BIND:WEB_PORT` (default 0.0.0.0:3000), API on `API_BIND:API_PORT` (default 127.0.0.1:3001); databases not published |
| Restarts | None (you are watching it) | `unless-stopped`, health checks on every service |
| Session cookie | Plain HTTP (`COOKIE_SECURE=false`) | `Secure` (`COOKIE_SECURE=true`) |

```
                 ┌──────────── compose network ─────────────┐
 browser ──3000──▶ web ──HTTP──▶ api ──▶ postgres            │
                 │                │ └──▶ rabbitmq            │
                 │      judge ────┘  (fetch / testdata /     │
                 │      (nsjail)      report over HTTP)      │
                 └───────────────────────────────────────────┘
```

## The bundled judge

A judge normally needs a token created under Admin → Judge machines. To
make the stacks start complete, the API reads `BUNDLED_JUDGE_TOKEN` at start
and registers (or re-keys) a judge named `bundled` with it; the judge
container gets the same value as `SKYOJ_JUDGE_TOKEN`. In production the token
is `JUDGE_TOKEN` in `.env.production`. Administrators can still disable it
like any other judge; a deleted bundled judge comes back at the next API
start while the variable is set.

The judge container runs as root and creates one nsjail jail per run (user,
PID, mount, network, IPC and UTS namespaces, seccomp policy, rlimits; see
[architecture.md](architecture.md#sandbox)). Docker's own seccomp and
AppArmor profiles forbid creating those namespaces and mounts, and its
masked `/proc` paths stop nsjail from setting up the jail, so the judge
service sets

```yaml
security_opt: [seccomp=unconfined, apparmor=unconfined, systempaths=unconfined]
```

It gets no extra capabilities and no host devices; `privileged: true` is not
needed. At start it runs a sandbox self-test and compiles a sample program
per language; check the result with `docker compose logs judge`
(`languages: c, clang-cpp17, …`). To run the full sandbox test suite on a
host:

```sh
docker compose -f compose.prod.yaml --env-file .env.production run --rm judge judge-selftest
```

**Ubuntu 23.10+ hosts** restrict unprivileged user namespaces through
AppArmor. If the self-test fails with `Permission denied` on `clone` or
`unshare`, allow them: `sudo sysctl kernel.apparmor_restrict_unprivileged_userns=0`
(persist it in `/etc/sysctl.d/`).

## Production

`docker/prod.sh` is the whole procedure:

1. On the first run it writes `.env.production` (mode 600) with random
   `POSTGRES_PASSWORD`, `RABBITMQ_PASSWORD`, `SESSION_SECRET` and
   `JUDGE_TOKEN`, plus the settings below with their defaults.
2. `docker compose -f compose.prod.yaml --env-file .env.production up -d --build --wait`
   builds the three images, starts PostgreSQL and RabbitMQ, then the API
   once they are healthy (it applies migrations), then web and judge, and
   returns when everything reports healthy.

Settings in `.env.production`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `WEB_BIND`, `WEB_PORT` | `0.0.0.0`, `3000` | Where the web app is published |
| `COOKIE_SECURE` | `true` | Set `false` only to try the site over plain HTTP |
| `API_BIND`, `API_PORT` | `127.0.0.1`, `3001` | Where the API is published, for judges on other machines |
| `SITE_NAME`, `SITE_TIMEZONE` | `Sky Online Judge`, `Asia/Taipei` | Shown in the interface |
| `MAX_UPLOAD_MB`, `JUDGE_TIMEOUT_SEC` | `256`, `600` | See `apps/api/.env.example` |
| `SKYOJ_TAG` | `latest` | Tag of the `skyoj/*` images |

The passwords are baked into the PostgreSQL and RabbitMQ volumes when those
are first created; changing them in the file afterwards locks the API out.
Keep the file with your backups.

Day to day (`dc` = `docker compose -f compose.prod.yaml --env-file .env.production`):

| Task | Command |
| --- | --- |
| Upgrade after `git pull` | `pnpm docker:prod` |
| Restart without rebuilding | `sh docker/prod.sh --no-build` |
| Logs | `dc logs -f api judge` |
| Stop (keeps data) | `pnpm docker:prod:down` |
| Database backup | `dc exec postgres pg_dump -U skyoj skyoj > skyoj.sql` |
| Testdata and attachments | volume `skyoj_api_data` (`/var/lib/skyoj/data` in the API container) |

Put a reverse proxy that terminates TLS (Caddy, nginx, Traefik) in front of
port 3000 and keep `COOKIE_SECURE=true`. Uploads go through the web server to
the API, so allow request bodies up to `MAX_UPLOAD_MB` in the proxy.

## More judge machines

Any machine with Docker can add judging capacity. Create a judge under
Admin → Judge machines, publish the API where that machine can reach it
(`API_BIND` = a private address), build the judge image (or copy
`skyoj/judge` there) and run:

```sh
docker run -d --name skyoj-judge --restart unless-stopped \
  --security-opt seccomp=unconfined --security-opt apparmor=unconfined \
  --security-opt systempaths=unconfined \
  -e SKYOJ_API_URL=http://10.0.0.5:3001 -e SKYOJ_JUDGE_TOKEN=skyoj_judge_… \
  -v skyoj-judge:/var/lib/skyoj-judge skyoj/judge
```

Each judge only receives submissions in the languages that passed its
start-up check, so machines with different images can share the queue.

## Development

`docker compose up` runs, in dependency order:

- `install` (one-shot): `pnpm install --frozen-lockfile` into named volumes
  (one per `node_modules`, so the host's own `node_modules` are never
  touched) and a first build of the contract;
- `contract`, `api`, `web`: `pnpm dev` of each package, on the source
  bind-mounted at `/workspace`;
- `judge`: the production judge image, with a fixed development token;
- `postgres`, `rabbitmq` with the credentials from `apps/*/.env.example`.

The infrastructure is published on localhost, so you can also run only
`docker compose up -d postgres rabbitmq` and the apps on the host, as
before. Local adjustments go into `compose.override.yaml`, which Compose
loads automatically and git ignores. `docker compose down -v` resets the
development database.

## Builds behind a TLS-intercepting proxy

Corporate proxies that re-sign HTTPS break `pnpm install`, `git clone` and
downloads inside image builds. Export the proxy's CA certificate before
building:

```sh
export BUILD_CA_CERT="$(cat proxy-ca.pem)"
```

The Compose files pass it to the builds as a secret. Production images use
it only while building and do not contain it; the development image keeps it,
because it runs `pnpm install` itself. With plain `docker build`, pass
`--secret id=ca,src=proxy-ca.pem`.
