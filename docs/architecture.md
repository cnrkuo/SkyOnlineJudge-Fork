# Architecture

```
 Browser ──HTML/forms──▶  apps/web  ──oRPC over HTTP──▶  apps/api  ──SQL──▶ PostgreSQL
                       React Router 8      (typed by       NestJS      └──▶ DATA_DIR (testdata,
                       SSR, loaders &   packages/contract)                   attachments)
                       actions                                 ▲
                                                               │ oRPC over HTTP (judge.*)
                                                        judge/ skyoj-judge  (C++, 1..n machines)
```

- **`packages/contract`** is the single source of truth for the HTTP API:
  every procedure, its input and output schema, and the error codes. Both
  TypeScript apps import it, so a change that breaks either side fails to
  compile.
- **`apps/api`** owns all business rules and all data.
- **`apps/web`** renders pages. It holds no business logic and no database
  access; it only calls the API.
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

Every procedure may fail with `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`,
`NOT_FOUND` or `CONFLICT`. Input that violates a schema is rejected with
`BAD_REQUEST` before a controller runs; outputs are validated too, so the API
cannot leak a field the contract does not declare.

## Backend: Controller → Service → Repository

```
apps/api/src
├── main.ts, app.module.ts
├── common/        actor & permission rules, auth guard, domain errors, crypto
├── database/      Drizzle schema, connection + migrations, PersistenceModule
├── storage/       blob storage on the local filesystem
└── modules/<feature>/
    ├── <feature>.controller.ts   transport
    ├── <feature>.service.ts      business rules
    └── <feature>.repository.ts   persistence
```

| Layer | Responsibility | Must not |
| --- | --- | --- |
| **Controller** | Implements one contract namespace with `@Implement(contract.x)`. Receives the current `Actor`, forwards validated input to a service, returns its result. | Contain rules, touch the database |
| **Service** | Authorization ("may this actor do this?"), validation across entities, orchestration, mapping rows to contract outputs. Throws `DomainError`s. | Know about HTTP or oRPC; build SQL |
| **Repository** | Every query for one aggregate, written with Drizzle. Returns plain rows. | Make decisions about who may see what\* |

\* One deliberate exception: list queries take the actor and filter by
visibility inside SQL (`visibleTo` in `problem.repository.ts`) so pagination
stays correct. The rule itself is the SQL twin of `satisfies()` in
`common/actor.ts`.

Cross-cutting pieces:

- **Authentication** — `AuthGuard` (global) resolves the bearer token into
  an `Actor` (`GUEST` when absent). It never rejects; services decide. Tokens
  are random 256-bit strings; only their SHA-256 is stored (`sessions`).
- **Errors** — services throw `NotFoundError`, `ForbiddenError`, … from
  `common/errors.ts`. One oRPC interceptor (`common/orpc.ts`) maps them onto
  the contract's error codes and logs anything unexpected.
- **Repositories are global** (`PersistenceModule`). Services of different
  features may share repositories — e.g. `ProblemService` asks
  `ContestRepository` whether a contest grants access — without module import
  cycles. Services depend on other services sparingly (`SubmissionService` →
  `ProblemService`).
- **Pure domain logic** lives in plain functions with unit tests:
  `submission/scoring.ts`, `contest/scoreboard.ts`,
  `problem/testdata-archive.ts`, `common/actor.ts`.

### Permission model

Users have a level (`GUEST 0 < BANNED 2 < UNVERIFIED 4 < USER 6 < ADMIN 8 <
ROOT 100`). An object with owner *o* and required level *r* is accessible to
actor *a* when `a.id == o.id || a.level > o.level || a.level > r`. Problems
use `r = OPEN (-1)`, `ADMIN (7)` or `HIDDEN (8)`: a hidden problem is visible
to its owner and to higher-ranked administrators only.

Contest participation extends this: an accepted participant can read a
contest's problems once it has started and submit to them while it runs
(`ContestRepository.grantsFor`).

### Data

PostgreSQL via Drizzle. `schema.ts` is the source; `pnpm db:generate` writes
SQL migrations to `apps/api/migrations`, which the API applies on startup.
Files live under `DATA_DIR`: testdata is content-addressed
(`problems/<id>/testdata/<sha256>`), attachments keep their names.

## Web app

React Router 8 in framework mode with server rendering. All data access goes
through **one oRPC client**, `apps/web/app/lib/api.server.ts`, which exists
only on the web server:

- loaders call `load(request, (o) => api.problem.get({ id }, o))` — contract
  errors become HTTP error responses or a redirect to the login page;
- actions call `submit(...)` — contract errors come back as values so the
  form can display them.

The browser never talks to the API. After login the web server keeps the API
token in a signed, http-only, `SameSite=Lax` cookie and attaches it to its
API calls, so the token is out of reach of page scripts and the API needs no
CORS setup and can stay on a private network.

Pages are plain forms and links (they work before hydration); JavaScript adds
auto-refresh for pending submissions and running scoreboards. Statements are
rendered with `react-markdown` + KaTeX; raw HTML in Markdown is not rendered.
All times are shown in one site-wide zone (`SITE_TIMEZONE`).

## The judge machine

### Protocol

Three procedures, authenticated with a per-judge bearer token created in the
admin UI (stored hashed in `judges`):

| Procedure | Purpose |
| --- | --- |
| `POST /judge/fetch` | Claim the oldest waiting submission. Returns the code, limits and the testcase list with content hashes, or `{ "task": null }`. |
| `POST /judge/testdata` | Download one testcase file. Judges cache by hash, so each file is fetched once per machine. |
| `POST /judge/report` | Send per-testcase results, or a compile/judge error. |

The queue is the `submissions` table. `fetch` claims a row with
`SELECT … FOR UPDATE SKIP LOCKED`, so any number of judges can poll
concurrently and each submission goes to exactly one. A submission whose
judge disappears is handed out again after `JUDGE_TIMEOUT_SEC`. A report is
only accepted from the judge holding the claim, which makes rejudging during
a run safe.

The judge reports raw results; the **API** computes the final verdict (the
worst testcase verdict) and the score (`scoring.ts`), so scoring rules live
in one place and can change without redeploying judges.

### Sandbox

Each compile and each testcase run goes through `sandbox::run`
(`judge/src/sandbox.cpp`):

| Layer | Effect |
| --- | --- |
| Mount, PID, network, IPC and UTS namespaces (plus a user namespace when the judge is not root) | No network; cannot see or signal other processes; every stray child dies with the namespace |
| Masked paths | The testdata cache (expected answers), captured output and the judge's config file (its token) are hidden behind empty mounts |
| Read-only working directory | A run cannot leave files behind for later testcases |
| Unprivileged uid (`run_uid`) when started as root | No access to the judge's own files |
| rlimits | CPU time, address space, stack, output size, open files, process count |
| seccomp-bpf deny-list | Kills the program on `ptrace`, `mount`, `unshare`, `bpf`, … → *Restricted Function* |

Verdicts: CPU time over the limit or wall time over `2 × limit + 1 s` → TLE;
peak RSS over the limit → MLE; `SIGXFSZ` → OLE; `SIGSYS` → RF; any other
signal or a non-zero exit → RE; otherwise the checker decides AC / PE / WA.

At startup the judge runs a self-test and logs which mode it got:

- `namespaces + dedicated uid + seccomp` — started as root (recommended);
- `user namespaces + seccomp` — unprivileged, kernel allows user namespaces;
- a warning when namespaces are unavailable (some containers). Only rlimits
  and seccomp apply then and submissions can read whatever the judge user
  can. Set `"require_isolation": true` to refuse to run in that state.

Known limits: memory is enforced by address-space limit and judged by peak
RSS, not by a cgroup, so a program can be reported as RE instead of MLE when
one huge allocation fails outright. Only the built-in token/line checker
exists; special judges are not implemented yet.

## Extending

- **New API procedure** — add it to the contract, implement it in the
  feature's controller (TypeScript will insist), put the rule in the service
  and the query in the repository.
- **New language** — add its id to `Language` in the contract, and a
  `languages` entry (source file name, compile and run commands) to the
  judge's defaults in `judge/src/config.cpp` or to each judge's config file.
- **New score mode** — add it to `ScoreMode` and to `computeScore`.
