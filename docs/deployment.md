# Deployment with Docker

Two Compose files describe the same five services, configured for two
different jobs:

| | Development: `compose.yaml` | Production: `compose.prod.yaml` |
| --- | --- | --- |
| Start | `pnpm docker:dev` (`docker compose up --build`) | `pnpm docker:prod` (`sh docker/prod.sh`) |
| Project / volumes | `yato-dev` | `yato` (separate data; both can exist side by side) |
| API, web, contract | One Node image (`docker/dev.Dockerfile`) runs the watch scripts on the bind-mounted working copy | Built images `yato/api`, `yato/web` with production dependencies only, on a distroless base, running as the unprivileged `nonroot` user (uid 65532) |
| Judge | `judge/Dockerfile`, same as production | `yato/judge` |
| Secrets | Fixed, well-known development values | Generated into `.env.production` on first run; Compose refuses to start without them |
| Published ports | Web 3000, API 3001, PostgreSQL 5432, RabbitMQ 5672 + console 15672, all on 127.0.0.1 | Web on `WEB_BIND:WEB_PORT` (default 0.0.0.0:3000), API on `API_BIND:API_PORT` (default 127.0.0.1:3001); databases not published |
| Restarts | None (you are watching it) | `unless-stopped`, health checks on every service |
| Session cookie | Plain HTTP (`COOKIE_SECURE=false`) | `Secure` (`COOKIE_SECURE=true`) |

Minimum versions: Node.js 24, PostgreSQL 18, RabbitMQ 4. The images:

| Service | Development | Production |
| --- | --- | --- |
| API, web | `node:26-trixie` | built on `node:26-trixie-slim`, served by `gcr.io/distroless/nodejs26-debian13:nonroot-amd64` (Node 26 on Debian 13 for x86-64, no shell or package manager) |
| Judge | `debian:trixie` (GCC 14, Clang 19 with libc++, Python 3.13) | the same |
| PostgreSQL | `postgres:18` | `postgres:18-alpine` |
| RabbitMQ | `rabbitmq:4-management-alpine` (with the web console) | `rabbitmq:4-alpine` |

Each base is a build argument (`BUILD_IMAGE` and `RUNTIME_IMAGE` for the
Node images, `DEBIAN_IMAGE` for the judge), so it can point at a mirror or a
digest; on an ARM host, set `RUNTIME_IMAGE` to the `nonroot-arm64` variant.
Pin the judge's to a digest during a contest season: its packages
decide the compiler versions contestants get. The distroless images have no
shell, so `docker compose exec api sh` does not work; use
`docker compose run --rm --entrypoint /nodejs/bin/node api -e '…'` or a
debug sidecar instead.

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
container gets the same value as `YATO_JUDGE_TOKEN`. In production the token
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
needed.

Memory limits are enforced with one cgroup per run, created inside the
judge's own cgroup (`yato-judge/<container>-<pid>`). Docker mounts the
cgroup filesystem read-only, so the judge service also has

```yaml
cgroup: host
volumes:
  - /sys/fs/cgroup:/sys/fs/cgroup:rw
```

This works on cgroup v1 and v2 hosts. It gives the judge's process — not
the submissions, which never see `/sys/fs/cgroup` — write access to the
host's cgroup tree; if you would rather not, remove both lines and the judge
falls back to an address-space limit (a program that allocates far too much
at once may then be judged RE instead of MLE). The start-up log says which:
`memory: cgroup v2 (…)`, or a warning with the reason.

At start it runs a sandbox self-test and compiles a sample program
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
| `TRUST_PROXY` | loopback and private addresses | Which reverse proxies' `X-Forwarded-Proto` / `-Host` the web app believes; see below |
| `API_BIND`, `API_PORT` | `127.0.0.1`, `3001` | Where the API is published, for judges on other machines |
| `SITE_NAME`, `SITE_TIMEZONE` | `YATO Judge`, `Asia/Taipei` | Shown in the interface |
| `MAX_UPLOAD_MB`, `JUDGE_TIMEOUT_SEC` | `256`, `600` | See `apps/api/.env.example` |
| `YATO_TAG` | `latest` | Tag of the `yato/*` images |

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
| Database backup | `dc exec postgres pg_dump -U yato yato > yato.sql` |
| Testdata and attachments | volume `yato_api_data` (`/var/lib/yato/data` in the API container) |

### Upgrading an installation from before the rename

The project used to be called Sky Online Judge, and everything was named
`skyoj`: the Compose project and so its volumes (`skyoj_postgres`,
`skyoj_api_data`, …), the database and its user, the images, the judge's
`SKYOJ_*` variables. All of these are `yato` now, so the new stack starts
with empty volumes next to the old ones, which are left untouched. Those
installations also ran PostgreSQL 16, whose files PostgreSQL 18 cannot open.
Move the data once:

```sh
# 1. Before pulling: dump the database with the old stack, then stop it.
old="docker compose -p skyoj -f compose.prod.yaml --env-file .env.production"
$old exec postgres pg_dump -U skyoj --no-owner skyoj > backup.sql
$old down

# 2. Pull. Copy testdata and attachments into the new volume, owned by the
#    user the API image runs as now (65532; it used to be 1000).
git pull
docker run --rm -v skyoj_api_data:/from -v yato_api_data:/to alpine \
  sh -c 'cp -a /from/. /to/ && chown -R 65532:65532 /to'

# 3. Start the new PostgreSQL alone, load the dump, then everything.
dc up -d --wait postgres
dc exec -T postgres psql -q -U yato -d yato < backup.sql
pnpm docker:prod

# 4. Once the site looks right, remove the old volumes:
#    docker volume rm skyoj_postgres skyoj_rabbitmq skyoj_api_data skyoj_judge_work
```

What else changes:

- `.env.production` keeps working as it is; set `SITE_NAME` if you want the
  new name shown. An existing `JUDGE_TOKEN` stays valid whatever its prefix.
- Everyone is signed out once (the session cookie has a new name).
- RabbitMQ starts empty. Its queues only hold work in flight, so let
  submissions finish judging before step 1.
- Judges on other machines need the new image (`yato/judge`) and variable
  names (`YATO_API_URL`, `YATO_JUDGE_TOKEN`); their tokens stay valid.

### Behind a reverse proxy

Put a reverse proxy that terminates TLS (Caddy, nginx, Traefik) in front of
port 3000 and keep `COOKIE_SECURE=true`. Uploads go through the web server to
the API, so allow request bodies up to `MAX_UPLOAD_MB` in the proxy. Set
`WEB_BIND=127.0.0.1` when the proxy runs on the same host, so plain HTTP is
not reachable from outside.

The proxy must send `X-Forwarded-Proto` (Caddy, nginx with
`proxy_set_header X-Forwarded-Proto $scheme;` and Traefik do). React Router
refuses a form submission whose `Origin` (`https://…`) differs from the
request's own origin, as protection against cross-site requests, and behind
a proxy the server only knows the request was HTTPS from that header. It
believes the header from loopback and private addresses — a proxy on the
same host or in a Docker network. A proxy elsewhere needs `TRUST_PROXY` set
to its address (or `1` for one hop); a wrong setting shows as **400 Bad
Request** on every form, with "origin does not match" in `dc logs web`.

Caddy on the same host, for example:

```caddy
judge.example.com {
	encode zstd gzip
	request_body {
		max_size 256MB # MAX_UPLOAD_MB
	}
	reverse_proxy 127.0.0.1:3000
}
```

## More judge machines

Any machine with Docker can add judging capacity. Create a judge under
Admin → Judge machines, publish the API where that machine can reach it
(`API_BIND` = a private address), build the judge image (or copy
`yato/judge` there) and run:

```sh
docker run -d --name yato-judge --restart unless-stopped \
  --security-opt seccomp=unconfined --security-opt apparmor=unconfined \
  --security-opt systempaths=unconfined \
  --cgroupns host -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
  -e YATO_API_URL=http://10.0.0.5:3001 -e YATO_JUDGE_TOKEN=yato_judge_… \
  -v yato-judge:/var/lib/yato-judge yato/judge
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
