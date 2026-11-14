Sky Online Judge
================

An open source online judge: problems, automatic judging, contests with live
scoreboards, and a codepad.

This is a ground-up rewrite of the original PHP system as a TypeScript
monorepo with a C++ judge machine.

| Part | Path | Stack |
| --- | --- | --- |
| API contract | `packages/contract` | [oRPC](https://orpc.dev) contract + [ArkType](https://arktype.io) schemas, shared by API and web |
| Backend API | `apps/api` | NestJS 12 on Fastify, `@orpc/nest`, Drizzle ORM, PostgreSQL, RabbitMQ |
| Web app | `apps/web` | React Router 8 (framework mode, SSR), Bootstrap 5, TanStack Query + Table, Radix UI, Shiki |
| Judge machine | `judge` | C++20 daemon; submissions run in [nsjail](https://github.com/google/nsjail) |

Read [docs/architecture.md](docs/architecture.md) for how the pieces fit
together, the layering rules of the backend, the judge protocol, the
sandbox, testing and code style, and [docs/design.md](docs/design.md) for how the Bootstrap interface is put
together and the rules that keep it consistent.

Quick start with Docker
-----------------------

Everything — PostgreSQL, RabbitMQ, API, web app and a judge — runs in
containers. You need Docker Engine 25+ with Compose v2.24+ on Linux (the
judge's sandbox needs the host kernel's namespaces; Docker Desktop's Linux VM
works too).

**Development** — live-reloading containers on your working copy:

```sh
pnpm docker:dev        # = docker compose up --build
```

Web http://localhost:3000, API http://localhost:3001, RabbitMQ console
http://localhost:15672, PostgreSQL on localhost:5432 (`skyoj` / `skyoj`).
Edits on the host rebuild the contract, restart the API and hot-reload the
web app. Containers run as uid 1000; if your user's id differs, export
`DEV_UID=$(id -u) DEV_GID=$(id -g)` first.

**Production** — one command builds the images and starts the stack:

```sh
pnpm docker:prod       # = sh docker/prod.sh
```

The first run writes `.env.production` with freshly generated passwords and
tokens (keep it; back it up with the volumes), then waits until every
service is healthy. Serve port 3000 through a TLS reverse proxy. Run it
again after `git pull` to upgrade; the API migrates the database on start.

In both, open the site and register: **the first account becomes the site
owner**; every later account is a regular user. A judge is already
connected. [docs/deployment.md](docs/deployment.md) covers what runs where,
configuration, backups, extra judge machines and troubleshooting.

Running without Docker
----------------------

Requirements:

- Node.js 22.22+ and pnpm 10
- PostgreSQL 14+
- RabbitMQ 3.12+
- For the judge: Linux with user namespaces enabled, CMake 3.20+, a C++20
  compiler, [nsjail](https://github.com/google/nsjail) (built by
  `judge/scripts/install-nsjail.sh`), plus the toolchains you want to offer
  to contestants (`gcc`, `g++` 13+ for C++23, `clang++` 17+ with libc++
  — Debian/Ubuntu: `clang libc++-dev libc++abi-dev` — and `python3` by
  default; a judge disables any language whose toolchain is missing)

```sh
pnpm install

# 1. Database and message queue (or point DATABASE_URL / RABBITMQ_URL at
#    existing servers)
docker compose up -d postgres rabbitmq

# 2. Configuration
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3. Build everything once (the contract must be built before the apps)
pnpm build

# 4. Run — each in its own terminal
pnpm --filter @skyoj/api start     # http://127.0.0.1:3001, applies DB migrations on boot
pnpm --filter @skyoj/web start     # http://localhost:3000
```

Open http://localhost:3000 and register (the first account becomes the
owner). For development use `pnpm dev:contract`, `pnpm dev:api` and
`pnpm dev:web` (watch mode) instead of `build` + `start`.

### Connecting a judge machine

Submissions wait in RabbitMQ until a judge picks them up. (The Docker
stacks start one for you; this is for judges on other machines or without
Docker. A judge can also run from the `skyoj/judge` image, see
[docs/deployment.md](docs/deployment.md#more-judge-machines).)

```sh
sudo judge/scripts/install-nsjail.sh     # → /usr/local/bin/nsjail (pinned 3.6)
pnpm build:judge                          # → judge/build/skyoj-judge
cp judge/config.example.json judge/config.json
```

1. In the web UI go to **Admin → Judge machines**, create a judge and copy
   its token (shown once) into `judge/config.json`.
2. Set `work_dir` / `cache_dir` to directories the judge may write to. Every
   parent directory of `work_dir` and of the judge binary must be
   searchable by other users (`chmod o+x`); the judge checks this at start.
3. Start it: `sudo judge/build/skyoj-judge --config judge/config.json`

Run as many judges as you like, on any machines that can reach the API; each
needs its own token. See [docs/architecture.md](docs/architecture.md#the-judge-machine)
for the privileges the sandbox needs and what each mode protects against.

Day-to-day
----------

- **Problems** are written in Markdown with TeX math. Testdata is uploaded as
  a zip of `name.in` + `name.ans` pairs. New problems start hidden and closed.
- **Languages:** C (C11), C++17 and C++23 with GCC/libstdc++, C++17 and
  C++23 with Clang/libc++, and Python 3. Each judge's config can change the
  compiler commands or add languages; each judge only receives submissions
  in languages whose toolchain passed its start-up check.
- **Scoring** is either the average of passed testcases or subtasks
  (`group_min`: a group of testcases scores only if all of them pass).
- **Contests** follow ICPC or IOI rules, with open / password / approval /
  invitation registration and an optional scoreboard freeze (a frozen board
  stays frozen until an administrator sets the freeze to 0). Participants can
  read and submit a contest's problems during the contest even while those
  problems are hidden from the public list.

- **Scoreboards** track a group of users on a set of problems over a date
  range — handy for classes and training plans.

Scripts
-------

| Command | What it does |
| --- | --- |
| `pnpm docker:dev` | Development stack in Docker, live reload (`compose.yaml`) |
| `pnpm docker:prod` | Build and start (or upgrade) the production stack (`compose.prod.yaml`) |
| `pnpm docker:prod:down` | Stop the production stack (data volumes are kept) |
| `pnpm build` | Build contract, API and web |
| `pnpm typecheck` | Type-check all TypeScript packages |
| `pnpm lint` / `pnpm lint:fix` | [Biome](https://biomejs.dev) lint and format check of all TypeScript, CSS and JSON (`biome.json`); `:fix` applies safe fixes |
| `pnpm format` | Format TypeScript, CSS and JSON with Biome |
| `pnpm lint:judge` | clang-tidy (`judge/.clang-tidy`) and a clang-format check of the judge; needs `pnpm build:judge` first |
| `pnpm format:judge` | Format the judge with clang-format (`judge/.clang-format`) |
| `pnpm test` | Unit tests of the contract, the API's rules and services, and the web app's helpers ([what is covered](docs/architecture.md#testing)) |
| `pnpm test:e2e` | Browser end-to-end test of a running site (`BASE_URL`; on a site with accounts also `E2E_USER` / `E2E_PASSWORD` of an administrator) |
| `pnpm --filter @skyoj/web audit:contrast` | axe-core contrast audit of a running site (`BASE_URL`, optional `AUDIT_USER` / `AUDIT_PASSWORD`) |
| `pnpm db:generate` | Generate a SQL migration after editing `apps/api/src/database/schema.ts` |
| `pnpm build:judge` | Configure and build the C++ judge |
| `ctest --test-dir judge/build` | Judge tests (checker, config, nsjail sandbox, toolchains, runner); need nsjail |

Coming from the PHP version
---------------------------

The legacy code remains in the git history (last commit before the rewrite:
`bd7b867`). [docs/compatibility.md](docs/compatibility.md) maps every old
page to its new place and lists what behaves the same, what changed on
purpose and what was not carried over.

In short: levels and permissions, verdict codes, both score modes, contest
rules and scoreboards, training scoreboards and the codepad work as before,
and password hashes from the PHP database are still accepted. There is no
data importer from MySQL yet, and scoreboards no longer pull results from
other online judges.
