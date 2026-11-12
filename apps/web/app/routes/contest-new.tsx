import { ContestStyle, RegisterType, UserLevel } from '@skyoj/contract';
import { redirect } from 'react-router';
import { ContestForm } from '~/components/contest-form';
import { Measure, PageHeader } from '~/ui';
import { api, load, submit } from '~/lib/api.server';
import { parseContestForm } from '~/lib/contest-form.server';
import type { Route } from './+types/contest-new';

export async function loader({ request }: Route.LoaderArgs) {
  const me = await load(request, (o) => api.auth.me(undefined, o));
  if (!me) throw redirect('/login?next=/contests/new');
  if (me.level < UserLevel.ADMIN) throw new Response('Administrator permission required', { status: 403 });
  // Default to a five-hour contest starting at the next full hour, tomorrow.
  const start = new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000 + 86_400_000);
  return { startAt: start.toISOString(), endAt: new Date(start.getTime() + 5 * 3_600_000).toISOString() };
}

export async function action({ request }: Route.ActionArgs) {
  const parsed = parseContestForm(await request.formData());
  if (!parsed.ok) return parsed;
  const result = await submit(request, (o) => api.contest.create(parsed.value, o));
  return result.ok ? redirect(`/contests/${result.data.id}`) : result;
}

export const meta: Route.MetaFunction = () => [{ title: 'New contest' }];

export default function ContestNew({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <Measure size="page">
      <PageHeader title="New contest" />
      <ContestForm
        submitLabel="Create contest"
        result={actionData}
        values={{
          title: '',
          description: '',
          style: ContestStyle.ICPC,
          ...loaderData,
          registerType: RegisterType.OPEN,
          registerPassword: '',
          freezeSec: 3600,
          penaltySec: 1200,
          problems: '',
        }}
      />
    </Measure>
  );
}
