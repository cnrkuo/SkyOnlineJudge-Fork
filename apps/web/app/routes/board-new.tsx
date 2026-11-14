import { UserLevel } from '@skyoj/contract';
import { redirect } from 'react-router';
import { BoardForm } from '~/components/board-form';
import { api, load, submit } from '~/lib/api.server';
import { parseBoardForm } from '~/lib/board-form.server';
import { DAY_MS, HOUR_MS } from '~/lib/time';
import { Measure, PageHeader } from '~/ui';
import type { Route } from './+types/board-new';

export async function loader({ request }: Route.LoaderArgs) {
  const me = await load(request, (o) => api.auth.me(undefined, o));
  if (!me) throw redirect('/login?next=/scoreboards/new');
  if (me.level < UserLevel.ADMIN) throw new Response('Administrator permission required', { status: 403 });
  // Default window: from the current hour, for one year.
  const start = new Date(Math.floor(Date.now() / HOUR_MS) * HOUR_MS);
  return { startAt: start.toISOString(), endAt: new Date(start.getTime() + 365 * DAY_MS).toISOString() };
}

export async function action({ request }: Route.ActionArgs) {
  const parsed = parseBoardForm(await request.formData());
  if (!parsed.ok) return parsed;
  const result = await submit(request, (o) => api.board.create(parsed.value, o));
  return result.ok ? redirect(`/scoreboards/${result.data.id}`) : result;
}

export const meta: Route.MetaFunction = () => [{ title: 'New scoreboard' }];

export default function BoardNew({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <Measure size="page">
      <PageHeader title="New scoreboard" />
      <BoardForm
        submitLabel="Create scoreboard"
        result={actionData}
        values={{ title: '', announce: '', ...loaderData, allowJoin: true, users: '', problems: '' }}
      />
    </Measure>
  );
}
