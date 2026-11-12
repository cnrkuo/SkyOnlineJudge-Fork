# Compatibility with the PHP version

The rewrite was checked feature by feature against the last PHP revision
(`bd7b867`). This page records what behaves the same, what changed on
purpose, and what was not carried over.

## Where things went

| PHP | Now |
| --- | --- |
| `/problem/list`, `view`, `modify`, `submit`, `statistics` | `/problems`, `/problems/:id` (statement, submit form and statistics on one page), `/problems/:id/edit` |
| `/problem/view/:pid/:file` (attachments) | `/problems/:id/attachments/:name` |
| `/chal/list`, `/chal/result/:cid` | `/submissions`, `/submissions/:id` |
| `/contest/list`, `view`, `modify`, `register`, `scoreboard`, `scoreboard_download` | `/contests`, `/contests/:id`, `/contests/:id/edit`, `/contests/:id/scoreboard`, `/contests/:id/scoreboard.csv` |
| `/rank/list`, `view`, `modify`, `api/join` | `/scoreboards`, `/scoreboards/:id`, `/scoreboards/:id/edit`, "Join" button |
| `/code/codepad`, `/code/view/:hash` | `/codepad`, `/codepad/:hash` |
| `/user/view/:uid`, settings sub-pages | `/users/:id`, `/settings` |
| `/admin` (user list, judge profiles) | `/admin`, `/admin/users/:id` |
| `judge_profile` + HypeX bridge | `judge/` daemon, registered under Admin → Judge machines |

## Same behaviour

- **Levels and permissions.** `UserLevel` and the object access rule
  (`owner || higher rank || level > required`) keep their numeric values and
  semantics. Problems are `Open`, `Admin` or `Hidden`; submitting is `Open` or
  `Closed`; new problems start hidden and closed.
- **Accounts.** Log in with e-mail or nickname. Password hashes written by
  PHP (`password_hash(..., PASSWORD_BCRYPT)`, `$2y$…`) are accepted and
  upgraded on first login, so imported accounts keep their passwords.
  Administrators can edit another account, including its password, without
  the old password. Profiles keep quote, quote source and avatar, with the
  Gravatar of the e-mail as default avatar.
- **Verdicts.** Same codes and ordering (`WAIT 0 … AC 20, PE 25, WA 30, OLE 35,
  RE 40, TLE 50, MLE 60, RF 65, CE 70, JE 80, SE 85`); a submission's verdict
  is the worst testcase verdict, its time the sum over testcases.
- **Scoring.** `Average` (100 × passed ÷ total) and `GroupMin` (subtasks) are
  ported one to one, including the `[[score, count], …]` group definition. A
  broken configuration yields *Score Error*.
- **Testdata.** A zip of `name.in` + `name.ans` pairs; uploading adds to the
  existing set and overwrites same-named cases; "remove all" clears it.
- **Submissions.** Rejudge one or all of a problem; administrators can leave a
  comment and override the verdict by hand; statistics show the verdict
  distribution and the 20 fastest accepted runs (time, memory, id).
- **Problem list.** Ascending by id, with your own status and the AC rate
  (accepted ÷ all submissions).
- **Contests.** ICPC and IOI rules; registration modes closed / open /
  approval / password; team states (pending, accepted, hidden, rejected,
  unofficial, dropped); problem states (hidden, normal, read-only); a
  submission counts for a contest when it falls inside the contest window.
  Participants reach contest problems — statement, attachments, submitting —
  while those problems are hidden from the public.
- **Contest scoreboard.** Public from the start of the contest. Penalty is
  minutes to AC plus `penalty` per earlier attempt; first solver is marked;
  tied teams share a rank and the next rank follows directly (1, 1, 2). With a
  freeze, everyone but administrators sees only submissions from before the
  last `freeze_sec` seconds, and it stays that way after the contest — set
  the freeze to 0 to publish the final standings.
- **Training scoreboards** (`rank`): users × problems inside a date range,
  best score and best verdict per cell, sorted by total score, with an
  announcement and optional self-join.
- **Codepad.** Logged-in users save snippets (15 000 characters) behind an
  unguessable link that anyone can open.

## Deliberate differences

| Topic | PHP | Now | Why |
| --- | --- | --- | --- |
| Testcase order | Alphabetical (`1, 10, 2`) | Natural (`1, 2, 10`) | Matches what authors expect. **Check `GroupMin` problems whose files were not zero-padded: their subtask boundaries assumed the old order.** |
| Answer files | `.ans` only | `.ans` or `.out` | Common convention |
| Memory limit unit | bytes | kilobytes in the API, megabytes in the form | Readability |
| Peak memory of a submission | summed over testcases and over rejudges (a bug) | maximum over testcases | Correctness |
| Who may submit | everyone, even when closed (`isAllowSubmit` was a TODO returning `true`) | logged-in users, and only when open or through a running contest | The setting now does what it says |
| Scoreboard attempts | every submission, including compile errors and ones still judging | compile / judge / score errors and pending runs are not attempts | ICPC convention |
| Other users' code | owner and administrators (`codeview_access` was stored but ignored) | same, plus everyone when the problem sets code view to "Everyone" | The setting now has an effect |
| Submissions of hidden problems | listed for everyone | listed for the author and for those who can see the problem | Do not leak hidden contests |
| Contest page after the end | "contest over" page | problems stay visible to participants | Upsolving |
| Registration | separate login step afterwards | logged in immediately | Convenience |
| Password rule | 3–30 characters from `[._@a-zA-Z0-9]` | 6–128 characters, any (old shorter passwords still log in) | Security |
| Session | PHP session + CSRF tokens per form | signed http-only `SameSite=Lax` cookie holding an API token | Stateless web server |
| First administrator | `$_E['site']['admin'] = [1]` in a settings file | the first registered account becomes site owner | No config edit needed |
| Statement markup | Markdown via Parsedown (raw HTML allowed), MathJax optional | Markdown + KaTeX, raw HTML not rendered | No script injection through statements |
| Scoreboard announcement | raw HTML | Markdown | Same reason |

## Not carried over

- **Data.** There is no importer from the MySQL schema yet. The new schema
  keeps the old concepts (accounts, problems, challenges → submissions,
  contests and their problems/users, scoreboards, codepads), and old password
  hashes verify, so an importer is a mapping exercise — but it has not been
  written or tested.
- **Other online judges on scoreboards** (TOJ / UVa capture, linked OJ
  accounts on profiles). Training scoreboards cover local problems only.
- **Per-account IP lock** (`allow_ip`, `$_E['iplock']`).
- **Random problem sets** (`RandomSet` contest plug-in), the **balloon** feed
  and the **Bangkok resolver** pages.
- **PDF statements** — attach the PDF and link it from the Markdown statement.
- **Plug-in installer, system log page, `judge.json`** per problem.
- **Traditional Chinese interface** — the UI is English only for now.
- The half-finished JSON API under `SkyOJ/API` (ping, login, register, an
  empty problem list); the oRPC contract replaces it.
