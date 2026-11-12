import { BoardForm } from '~/components/board-form';
import { idParam } from '~/lib/params';
import { ButtonLink, Measure, PageHeader } from '~/ui';
import { api, load, submit } from '~/lib/api.server';
import { parseBoardForm } from '~/lib/board-form.server';
import type { Route } from './+types/board-edit';

export async function loader({ request, params }: Route.LoaderArgs) {
  const board = await load(request, (o) => api.board.get({ id: idParam(params.id) }, o));
  if (!board.canManage) throw new Response('Administrator permission required', { status: 403 });
  return {
    id: board.id,
    title: board.title,
    announce: board.announce,
    startAt: board.startAt,
    endAt: board.endAt,
    allowJoin: board.allowJoin,
    users: board.rows
      .map((row) => row.user.id)
      .sort((a, b) => a - b)
      .join(', '),
    problems: board.problems.map((p) => `${p.problemId}${p.note ? ` ${p.note}` : ''}`).join('\n'),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const parsed = parseBoardForm(await request.formData());
  if (!parsed.ok) return parsed;
  const result = await submit(request, (o) => api.board.update({ id: idParam(params.id), ...parsed.value }, o));
  return { ...result, message: 'Scoreboard saved.' };
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Edit: ${loaderData?.title ?? 'scoreboard'}` }];

export default function BoardEdit({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <Measure size="page">
      <PageHeader
        title="Edit scoreboard"
        actions={<ButtonLink to={`/scoreboards/${loaderData.id}`}>View scoreboard</ButtonLink>}
      />
      <BoardForm values={loaderData} submitLabel="Save scoreboard" result={actionData} />
    </Measure>
  );
}
