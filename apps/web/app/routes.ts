import { index, prefix, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),

  route('login', 'routes/login.tsx'),
  route('register', 'routes/register.tsx'),
  route('logout', 'routes/logout.ts'),
  route('settings', 'routes/settings.tsx'),
  route('users/:id', 'routes/user.tsx'),

  ...prefix('problems', [
    index('routes/problems.tsx'),
    route(':id', 'routes/problem.tsx'),
    route(':id/edit', 'routes/problem-edit.tsx'),
    route(':id/attachments/:name', 'routes/problem-attachment.ts'),
  ]),

  ...prefix('submissions', [index('routes/submissions.tsx'), route(':id', 'routes/submission.tsx')]),

  ...prefix('contests', [
    index('routes/contests.tsx'),
    route('new', 'routes/contest-new.tsx'),
    route(':id', 'routes/contest.tsx'),
    route(':id/edit', 'routes/contest-edit.tsx'),
    route(':id/scoreboard', 'routes/contest-scoreboard.tsx'),
    route(':id/scoreboard.csv', 'routes/contest-scoreboard-csv.ts'),
  ]),

  ...prefix('scoreboards', [
    index('routes/boards.tsx'),
    route('new', 'routes/board-new.tsx'),
    route(':id', 'routes/board.tsx'),
    route(':id/edit', 'routes/board-edit.tsx'),
  ]),

  ...prefix('codepad', [index('routes/codepad.tsx'), route(':hash', 'routes/codepad-view.tsx')]),

  route('admin', 'routes/admin.tsx'),
  route('admin/users/:id', 'routes/admin-user.tsx'),

  // Gateway for the browser's oRPC client.
  route('rpc/*', 'routes/rpc.ts'),
] satisfies RouteConfig;
