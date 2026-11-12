Sky Online Judge
================

An open source online judge: problems, automatic judging, contests with live
scoreboards, and a codepad.

This is a ground-up rewrite of the original PHP system as a TypeScript
monorepo with a C++ judge machine.

| Part | Path | Stack |
| --- | --- | --- |
| API contract | `packages/contract` | [oRPC](https://orpc.dev) contract + Zod schemas, shared by API and web |
| Backend API | `apps/api` | NestJS 12, `@orpc/nest`, Drizzle ORM, PostgreSQL |
| Web app | `apps/web` | React Router 8 (framework mode, SSR), Tailwind CSS 4 |
| Judge machine | `judge` | C++20 daemon with a namespace/seccomp sandbox |

Read [docs/architecture.md](docs/architecture.md) for how the pieces fit
together, the layering rules of the backend, the judge protocol and the
sandbox.

Requirements
------------

- Node.js 22.22+ and pnpm 10
- PostgreSQL 14+
- For the judge: Linux, CMake 3.20+, a C++20 compiler, plus the toolchains
  you want to offer to contestants (`gcc`, `g++`, `python3` by default)

Getting started
---------------

```sh
pnpm install

# 1. Database (or point DATABASE_URL at an existing PostgreSQL)
docker compose up -d postgres

# 2. Configuration
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3. Build everything once (the contract must be built before the apps)
pnpm build

# 4. Run — each in its own terminal
pnpm --filter @skyoj/api start     # http://127.0.0.1:3001, applies DB migrations on boot
pnpm --filter @skyoj/web start     # http://localhost:3000
```

Open http://localhost:3000 and register. **The first account becomes the
site owner**; every later account is a regular user.

For development use `pnpm dev:contract`, `pnpm dev:api` and `pnpm dev:web`
(watch mode) instead of `build` + `start`.

### Connecting a judge machine

Submissions wait in a queue until a judge picks them up.

```sh
pnpm build:judge                          # → judge/build/skyoj-judge
cp judge/config.example.json judge/config.json
```

1. In the web UI go to **Admin → Judge machines**, create a judge and copy
   its token (shown once) into `judge/config.json`.
2. Set `work_dir` / `cache_dir` to directories the judge may write to.
3. Start it: `sudo judge/build/skyoj-judge --config judge/config.json`

Run as many judges as you like, on any machines that can reach the API; each
needs its own token. See [docs/architecture.md](docs/architecture.md#the-judge-machine)
for the privileges the sandbox needs and what each mode protects against.

Day-to-day
----------

- **Problems** are written in Markdown with TeX math. Testdata is uploaded as
  a zip of `name.in` + `name.ans` pairs. New problems start hidden and closed.
- **Scoring** is either the average of passed testcases or subtasks
  (`group_min`: a group of testcases scores only if all of them pass).
- **Contests** follow ICPC or IOI rules, with open / password / approval /
  invitation registration and an optional scoreboard freeze. Participants can
  read and submit a contest's problems during the contest even while those
  problems are hidden from the public list.

Scripts
-------

| Command | What it does |
| --- | --- |
| `pnpm build` | Build contract, API and web |
| `pnpm typecheck` | Type-check all TypeScript packages |
| `pnpm test` | Unit tests (scoring, scoreboard, permissions, testdata archives, time zones) |
| `pnpm db:generate` | Generate a SQL migration after editing `apps/api/src/database/schema.ts` |
| `pnpm build:judge` | Configure and build the C++ judge |
| `ctest --test-dir judge/build` | Judge tests (checker and sandbox) |

Migrating from the PHP version
------------------------------

The legacy code remains in the git history (last commit before the rewrite:
`bd7b867`). There is no automatic data migration: the database moved from
MySQL to PostgreSQL with a new schema, and passwords are hashed differently.
The following legacy features were intentionally not carried over:

- scoreboards that scrape other online judges (TOJ / UVa capture plugins);
- the plugin installer, the HypeX judge bridge (replaced by `judge/`), the
  balloon page and the Bangkok resolver;
- PDF problem statements (attach the PDF and link it from the Markdown
  statement instead).
