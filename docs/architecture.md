# Architecture

```
 Browser ──HTML/forms──▶  apps/web  ──oRPC over HTTP──▶  apps/api ──reads, low-volume writes──▶ PostgreSQL
                       React Router 8     (typed by      NestJS on                                  ▲
                       SSR, loaders &  packages/contract)  Fastify ──publish──▶ RabbitMQ ──consume──┘
                       actions                               ▲                 (bursty writes, at a
                                                             │                  bounded rate)
                                              oRPC over HTTP (judge.*)
                                                      judge/ skyoj-judge  (C++, 1..n machines)
```

- **`packages/contract`** is the single source of truth for the HTTP API:
  every procedure, its input and output schema, and the error codes. Both
  TypeScript apps import it, so a change that breaks either side fails to
  compile.
- **`apps/api`** owns all business rules and all data.
- **`apps/web`** renders pages. It holds no business logic and no database
  access; it only calls the API, on its own behalf and as a gateway for the
  browser.
- **`judge/`** turns queued submissions into verdicts. It is a client of the
  API like the web app, just written in C++.

## The contract

`packages/contract/src/contract.ts` groups procedures into namespaces
(`auth`, `user`, `problem`, `submission`, `contest`, `board`, `codepad`,
`admin`, `judge`). `populateContractRouterPaths` exposes each one as
`POST /<namespace>/<procedure>` with a JSON body (multipart when the input
contains a file). Timestamps travel as ISO-8601 strings; enums
(`packages/contract/src/enums.ts`) keep the numeric values of the legacy
system so permission arithmetic and verdict ordering are unchanged.

Schemas are written with [ArkType](https://arktype.io). oRPC consumes them
through the Standard Schema interface, so the same definitions validate at
runtime on the server and give the web client its static types. Three
ArkType specifics matter here:

- `arktype-config.ts` sets `onUndeclaredKey: 'delete'` globally (and is
  imported before `arktype` itself). Inputs lose anything beyond the
  contract, and — because outputs are validated too — the API cannot leak a
  column the contract does not declare.
- Ids are `string.integer.parse | number.integer`: multipart uploads carry
  every field as text, and the morph turns `"12"` into `12`.
- Defaults (`'number.integer >= 1 = 1'`) are only used on create/list
  inputs. Update inputs are built with `.partial()` from schemas *without*
  defaults, so an omitted field means "leave unchanged".

Every procedure may fail with `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`,
`NOT_FOUND`, `CONFLICT` or `SERVICE_UNAVAILABLE` (the message queue is down;
safe to retry). Input that violates a schema is rejected with `BAD_REQUEST`
before a controller runs.

## Backend: Controller → Service → Repository

```
apps/api/src
├── main.ts, app.module.ts
├── common/        actor & permission rules, auth guard, domain errors, crypto,
│                  time windows
├── database/      Drizzle schema, connection + migrations, PersistenceModule
├── messaging/     RabbitMQ connection, queues, message types
├── storage/       blob storage on the local filesystem
├── testing/       fixtures for unit tests (not built)
└── modules/<feature>/
    ├── <feature>.controller.ts   transport
    ├── <feature>.service.ts      business rules (a feature may have several)
    ├── <feature>.repository.ts   persistence
    ├── <rule>.ts                 pure domain functions
    └── *.test.ts                 unit tests next to the code they test
```

A feature splits into several services when it has separate jobs. The
problem module has `ProblemService` (access rules, statements, settings),
`TestdataService` (zip uploads, merging, blob clean-up) and
`AttachmentService`. The submission module has `SubmissionService` (what users
do) and `SubmissionResultService` (turns judges' reports into verdicts).

| Layer | Responsibility | Must not |
| --- | --- | --- |
| **Controller** | Implements one contract namespace with `@Implement(contract.x)`. Receives the current `Actor`, forwards validated input to a service, returns its result. | Contain rules, touch the database |
| **Service** | Authorization ("may this actor do this?"), validation across entities, orchestration, mapping rows to contract outputs. Throws `DomainError`s. | Know about HTTP or oRPC; build SQL |
| **Repository** | Every query for one aggregate, written with Drizzle. Returns plain rows. | Make decisions about who may see what\* |

\* One deliberate exception: list queries take the actor and filter by
visibility inside SQL (`visibleTo` in `problem.repository.ts`) so pagination
stays correct. The rule itself is the SQL twin of `satisfies()` in
`common/actor.ts`.

The HTTP server is Fastify (`@nestjs/platform-fastify`). Its body parsers
are removed in `main.ts`: oRPC reads the raw stream itself, which is what
makes JSON and multipart uploads go through the same validated path.

Cross-cutting pieces:

- **Authentication** — `AuthGuard` (global) resolves the bearer token into
  an `Actor` (`GUEST` when absent). It never rejects; services decide. Tokens
  are random 256-bit strings; only their SHA-256 is stored (`sessions`).
- **Errors** — services throw `NotFoundError`, `ForbiddenError`, … from
  `common/errors.ts`. One oRPC interceptor (`common/orpc.ts`) maps them onto
  the contract's error codes and logs anything unexpected.
- **Repositories are global** (`PersistenceModule`). Services of different
  features may share repositories — e.g. `ProblemService` asks
  `ContestRepository` which contests list a problem — without module import
  cycles. Services depend on other services sparingly (`SubmissionService`,
  `TestdataService` and `AttachmentService` → `ProblemService`).
- **Pure domain logic** lives in plain functions, so the rules can be tested
  without a database: `common/actor.ts` (permissions),
  `common/time-window.ts`, `contest/grants.ts` (what contests allow),
  `contest/scoreboard.ts`, `problem/testdata.ts` (merging testcase sets),
  `problem/testdata-archive.ts`, `submission/scoring.ts` and
  `submission/judging.ts` (a judge's report → verdict, score and usage).
  Repositories fetch, these decide, services connect the two.

### Permission model

Users have a level (`GUEST 0 < BANNED 2 < UNVERIFIED 4 < USER 6 < ADMIN 8 <
ROOT 100`). An object with owner *o* and required level *r* is accessible to
actor *a* when `a.id == o.id || a.level > o.level || a.level > r`. Problems
use `r = OPEN (-1)`, `ADMIN (7)` or `HIDDEN (8)`: a hidden problem is visible
to its owner and to higher-ranked administrators only.

Contest participation extends this: an accepted participant can read a
contest's problems once it has started and submit to them while it runs
(`contestGrant()` in `contest/grants.ts`, fed by
`ContestRepository.entriesFor`).

### Data

PostgreSQL via Drizzle. `schema.ts` is the source; `pnpm db:generate` writes
SQL migrations to `apps/api/migrations`, which the API applies on startup.
Files live under `DATA_DIR`: testdata is content-addressed
(`problems/<id>/testdata/<sha256>`), attachments keep their names.

### The write queue

Most writes are rare (editing a problem, registering). Two are not: creating
submissions and storing judge results arrive in bursts — a contest starting,
a mass rejudge finishing — and would otherwise open as many concurrent
transactions as there are requests. These go through RabbitMQ instead.

| Queue | Message | Consumer |
| --- | --- | --- |
| `skyoj.writes` | `submission.create`, `submission.result` (`messaging/commands.ts`) | `WriteQueueConsumer`, prefetch = `DB_WRITE_CONCURRENCY` (default 8) |
| `skyoj.judge` | `{ submissionId }`, one per submission awaiting a judge | pulled one at a time by `judge.fetch` |
| `skyoj.dead` | write commands that failed twice | none; inspect by hand |

Submitting therefore looks like this:

1. `SubmissionService.create` checks permissions (reads only), reserves an
   id from the submissions sequence, publishes `submission.create` and
   returns the id once RabbitMQ has confirmed the message as persisted.
2. `WriteQueueConsumer` inserts the row — at most `DB_WRITE_CONCURRENCY`
   inserts run at once, however many requests came in — and publishes the
   judge task.
3. A judge's `fetch` pulls a task and claims the row
   (`UPDATE … WHERE verdict = WAIT`); its `report` publishes
   `submission.result`, which the consumer hands to
   `SubmissionResultService` to score and store.

Consequences worth knowing:

- **Read-your-write gap.** A new submission's id is valid a few
  milliseconds before its row exists. The web app's `load(…, {
  awaitCreation: true })` rides that out after a submit.
- **Timestamps** are taken when the user submits, not when the row is
  written, so queueing never moves a submission across a contest boundary.
- **Idempotent commands.** Inserts use `ON CONFLICT DO NOTHING` and results
  only apply to the judge holding the claim, so redelivery is harmless. A
  command that throws is retried once, then dead-lettered.
- **Broker down.** Submitting and reporting fail with `SERVICE_UNAVAILABLE`
  after a five-second wait instead of losing data; everything else keeps
  working. The connection recovers on its own.
- **Lost tasks.** `JudgeSweeper` runs every 30 s: submissions stuck in
  "Judging" past `JUDGE_TIMEOUT_SEC` return to the queue, and if the judge
  queue is empty while submissions still wait, their tasks are published
  again. Duplicate tasks are skipped by the claim.

## Web app

React Router 8 in framework mode with server rendering.

### One client, two transports

All data access goes through **one oRPC client**, `app/lib/orpc.ts`, typed by
the shared contract. The object is the same on both sides; only its transport
differs:

- **On the web server** (loaders, actions, server rendering) it calls the API
  directly, authenticating with the session token passed as call context.
- **In the browser** it calls this site's own `/rpc/*` route
  (`routes/rpc.ts`). That gateway takes the token from the signed, http-only,
  `SameSite=Lax` session cookie, forwards the call unchanged, and relays the
  answer. It refuses `auth.*` and `judge.*` and any cross-origin caller.

So the browser never sees the token or the API's address, the API needs no
CORS setup and can stay on a private network, and validation and
authorization still happen in exactly one place — the API.

### Loaders, actions and TanStack Query

| Need | Tool |
| --- | --- |
| First render of a page | A **loader** calls `prefetch(request, …)`, which runs TanStack Query on the server and returns the cache in dehydrated form. The root layout hydrates it, so the page's `useQuery` has data during server rendering and on arrival — no request is repeated. |
| Paging, filtering, searching a list | The state is in the URL. `shouldRevalidate` skips the loader when only the query string changes; `useQuery` sees the new input, fetches through `/rpc`, and keeps the previous rows on screen (dimmed) meanwhile. |
| Live data | `refetchInterval` on the query: a submission polls until it has a verdict, a running contest's scoreboard and the judge list refresh on their own. |
| One-click changes | `useMutation` (rejudge, join a scoreboard, enable a judge, change a user's level), invalidating the affected query. |
| Forms | Plain React Router **actions** with native form controls. They work before JavaScript loads; afterwards the loader's fresh data re-hydrates the cache. |

`orpc.<namespace>.<procedure>.queryOptions({ input })` (from
`@orpc/tanstack-query`) produces both the query key and the fetch function,
so the server prefetch and the browser query cannot disagree about a key.

### Interface

The interface is Bootstrap 5 (its stylesheet only) in dark mode, set in
IBM Plex, contrast-checked to WCAG AA, and composed through a small UI kit so pages contain no
class names. Every table is one `DataTable` component built on TanStack
Table; menus, selects, tooltips, dialogs and tabs are Radix UI wearing
Bootstrap's classes. [docs/design.md](design.md) explains the set-up and its
rules. All times are shown in one site-wide zone (`SITE_TIMEZONE`).

### Code highlighting

Shiki highlights source code **on the server** (`app/lib/highlight.server.ts`):
submissions and codepads in their loaders, fenced code blocks inside the
Markdown pipeline. The browser receives coloured markup; no highlighter or
grammar is in the client bundle. The theme consists of CSS variables defined
in `styles/app.css`, each checked for contrast on the code background. Shiki runs on its
Oniguruma (WebAssembly) engine — the pure-JavaScript engine cannot execute
every pattern of the C++ grammar.

### Markdown and math

Statements, contest descriptions and scoreboard announcements are rendered
to HTML **on the server**, in the loaders (`app/lib/markdown.server.ts`):
remark (GFM + math) → rehype → sanitize → Shiki code blocks → MathML → HTML string. The browser
receives finished markup; no Markdown or math library is part of the client
bundle, and the Markdown source itself is not sent either.

- **Math** (`$inline$`, `$$display$$`) is converted from TeX to MathML with
  Temml and laid out natively by the browser. `$$…$$` counts as a displayed
  equation when it is fenced on its own lines *or* is a paragraph by itself.
  Malformed TeX shows Temml's error in place instead of failing the page.
- **Fonts.** MathML needs an OpenType math font. Windows and macOS have one;
  for everyone else a single STIX Two Math file (about 400 kB, OFL) is
  bundled as the last fallback. Browsers fetch it only when no system math
  font matches and the page actually contains math.
- **Safety.** Raw HTML in the source is dropped and the tree is sanitized
  (no scripts, event handlers or `javascript:` URLs) *before* the MathML is
  inserted; the MathML comes from Temml with `trust: false` and bounded
  macro expansion, never from the author. That is what makes it safe for the
  `Markdown` component to inject the string.

## The judge machine

### Protocol

Three procedures, authenticated with a per-judge bearer token created in the
admin UI (stored hashed in `judges`):

| Procedure | Purpose |
| --- | --- |
| `POST /judge/fetch` | Claim the next queued submission in one of `languages` (the judge's working toolchains). Returns the code, limits and the testcase list with content hashes, or `{ "task": null }`. |
| `POST /judge/testdata` | Download one testcase file. Judges cache by hash, so each file is fetched once per machine. |
| `POST /judge/report` | Send per-testcase results, or a compile/judge error. Returns once the report is durably queued. |

Tasks come from the `skyoj.judge` queue (see *The write queue*). The judge
itself never speaks AMQP: `fetch` pulls a task on its behalf and claims the
submission in the database, so any number of judges can poll concurrently and
each submission goes to exactly one. A report is only accepted from the judge
holding the claim, which makes rejudging during a run safe.

**Mixed fleets.** Judges need not have the same compilers. At start-up each
judge compiles and runs a hello-world program for every configured language
inside the sandbox, disables the languages that fail (logging the
compiler's first error line, e.g. `'iostream' file not found` when libc++
is missing) and sends the rest as `languages` with every fetch. The claim
then also requires `language IN (…)`; a task for another language goes back
to the end of `skyoj.judge` for a judge that has the toolchain, and a fetch
stops once it meets a task it already put back, so a queue with nothing for
this judge costs one pass. The cost is ordering: a submission put back
queues behind newer ones. The last list each judge sent is stored in
`judges.languages` and shown under Admin → Judge machines; a language that
no judge offers simply waits.

The judge reports raw results; the **API** computes the final verdict (the
worst testcase verdict) and the score (`submission/judging.ts`,
`scoring.ts`), so scoring rules live
in one place and can change without redeploying judges.

### Sandbox

Each compilation and each testcase run is one [nsjail](https://github.com/google/nsjail)
jail, started by `sandbox::run` (`judge/src/sandbox.cpp`):

| Layer | Effect |
| --- | --- |
| Mount, PID, network, IPC, UTS, cgroup and user namespaces | No network (only loopback); no other processes visible or signallable; every stray child dies with the jail |
| A filesystem built from scratch | Only `/usr` (and the `/bin`, `/lib`… links), the linker cache, `/etc/alternatives`, `/dev/null`, `/dev/zero`, `/dev/urandom`, a private `/tmp` and the work directory as `/box` exist. The testdata cache, captured output, the judge's config and token, `/etc/passwd` and every home directory are simply absent. |
| Read-only `/box` for testcase runs | A run cannot leave files behind for later testcases (compilation gets it read-write) |
| Unprivileged uid | `run_uid` (65534) when the judge is root; uid 1000 mapped to the judge's own uid otherwise |
| Memory cgroup (when available) | A hard memory limit per run, enforced by the kernel; swap is capped too. The judge owns `skyoj-judge/<host>-<pid>` in the cgroup tree (v1 or v2) and nsjail creates one cgroup per jail inside it |
| rlimits | CPU time, stack, output file size, open files, process count; address space only without a memory cgroup |
| seccomp policy (Kafel) | Kills on `ptrace`, `mount`, `unshare`, `setns`, `bpf`, namespace-creating `clone`, … → *Restricted Function*; `socket` fails with `EPERM` |
| One CPU per run | `--max_cpus 1`, so timings do not depend on the machine's core count (compilers may use all) |

**The init.** nsjail would start the submission as PID 1 of its PID
namespace, and the kernel ignores most signals sent to a PID 1: a program
writing past the output limit would get an error instead of `SIGXFSZ` (RE
instead of OLE), and `abort()` or a program signalling itself would not die
properly. So PID 1 is the judge binary itself, mounted read-only at
`/.skyoj-init` and started as `/.skyoj-init --sandbox-init 3 <program…>`.
It runs the program as its child, waits for it, and writes the program's
exact exit status and resource usage (`wait4`) to file descriptor 3, which
nsjail passes through to the judge. CPU time and peak memory come from that
report.

**Memory.** With a memory cgroup, each jail may use the problem's memory
limit plus its private `/tmp` plus 32 MB of headroom (the init, page tables
and page cache are charged too) before the kernel's OOM killer stops it.
Only memory that is used counts: reserving a huge array and touching part of
it is fine. There is no address-space limit then. Without a cgroup (the judge
not running as root, or a read-only cgroup filesystem), an address-space
limit of twice the memory limit plus 64 MB is the only backstop, and the
judge logs a warning at start-up.

**Verdicts.** CPU time over the limit or wall time over `2 × limit + 1 s` →
TLE; peak RSS over the limit → MLE; with a memory cgroup, a `SIGKILL` that is
not the CPU limit → MLE (the OOM killer; nothing else in the jail sends it,
short of the program killing itself); `SIGXFSZ` → OLE; `SIGSYS` → RF; any
other signal or a non-zero exit → RE; otherwise the checker decides AC / PE /
WA. The judge stops the jail itself at the exact wall-clock limit (SIGTERM to
nsjail, which then removes the jail's cgroup; SIGKILL after a second, and the
judge removes the cgroup); nsjail's own `--time_limit` is a backstop one
second later.

**In Docker** the judge image ships nsjail and every toolchain; the
container needs relaxed seccomp, AppArmor and `/proc` masking but no extra
capabilities ([deployment.md](deployment.md#the-bundled-judge)).

**Requirements and start-up.** nsjail is not packaged for Debian or Ubuntu;
`judge/scripts/install-nsjail.sh` builds a pinned release (3.6) and checks
the commit. The kernel must allow user namespaces. At start-up the judge
prepares its memory cgroup (`memory_cgroup`, `cgroup_root` in the config),
runs a self-test jail — retrying without the cgroup if jails fail with it —
and refuses to start if it fails (then checks each
language's toolchain, see *Mixed fleets*) — most often because
a parent directory of `work_dir` or of the judge binary is not searchable by
the jail's uid (nsjail mounts them from inside the user namespace; fix with
`chmod o+x`). The error message quotes nsjail's own.

Known limits: without a memory cgroup, a program can be reported as RE
instead of MLE when one huge allocation fails outright. A program that kills
itself with `SIGKILL` is reported as MLE when the cgroup is active. Only the
built-in token/line checker exists; special judges are not implemented yet.

## Testing

| Layer | What is tested | Where | Command |
| --- | --- | --- | --- |
| Contract | Schemas (ids, paging, limits); the judge's verdict codes and built-in languages against the contract's, read from the C++ sources | `packages/contract/src/*.test.ts` | `pnpm test` |
| API rules | Pure domain functions, and every service against in-memory fakes of its repositories, queue and storage: permissions, contest registration, freeze and grants, scoreboards, admin rank rules, accounts, submissions, testdata merging, judging, the sweeper and the write-queue consumer | `apps/api/src/**/*.test.ts` | `pnpm test` |
| Web | Form parsing, time zones, URL parameters, the loader/action helpers (redirects, waiting for queued writes, error messages), Markdown rendering, interface consistency, colour contrast | `apps/web/app/**/*.test.ts` | `pnpm test` |
| Judge | Checker, configuration, the nsjail sandbox (limits, signals, seccomp, isolation), compiling C++23 with g++ and clang++/libc++, the runner judging from a pre-filled testdata cache | `judge/tests/*_test.cpp` (doctest) | `ctest --test-dir judge/build`; in Docker `judge-selftest` |
| Whole system | A browser session against a running site: problem setup, one submission per language and verdict, rejudging, attachments, the judge list | `apps/web/scripts/e2e.mjs` | `pnpm test:e2e` |

Service tests build their dependencies with `fake()` from
`apps/api/src/testing/fixtures.ts`: an object that has only the methods a
test gives it, so an unexpected query fails the test instead of passing
silently. Database queries themselves are covered by the end-to-end run.

## Code style

TypeScript, CSS and JSON are linted and formatted by
[Biome](https://biomejs.dev) (`biome.json`, `pnpm lint`); the judge by
clang-tidy and clang-format (`judge/.clang-tidy`, `judge/.clang-format`,
`pnpm lint:judge`). Both run warnings-as-errors and are clean; the few
suppressions carry a reason next to them. Two settings matter beyond taste:

- `useImportType` is off for the API: Nest's dependency injection needs
  constructor parameter types imported as values, and a type-only import
  would compile but fail at start-up.
- clang-tidy leaves out the checks that fight the sandbox's direct POSIX
  code; `judge/.clang-tidy` lists them with the reason.

## Extending

- **New API procedure** — add it to the contract, implement it in the
  feature's controller (TypeScript will insist), put the rule in the service
  and the query in the repository.
- **New language** — add its id to `Language` in the contract, and a
  `languages` entry (source file name, compile and run commands) to the
  judge's defaults in `judge/src/config.cpp` or to each judge's config file.
  The contract test fails until both sides agree.
- **New score mode** — add it to `ScoreMode` and to `computeScore`.
