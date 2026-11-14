import { ContestStyle, RegisterType, UserLevel } from '@skyoj/contract';
import { redirect } from 'react-router';
import { ContestForm } from '~/components/contest-form';
import { api, load, submit } from '~/lib/api.server';
import { parseContestForm } from '~/lib/contest-form.server';
import { SITE_TIMEZONE } from '~/lib/site.server';
import { defaultContestWindow } from '~/lib/time';
import { Measure, PageHeader } from '~/ui';
import type { Route } from './+types/contest-new';

export async function loader({ request }: Route.LoaderArgs) {
  const me = await load(request, (o) => api.auth.me(undefined, o));
  if (!me) throw redirect('/login?next=/contests/new');
  if (me.level < UserLevel.ADMIN) throw new Response('Administrator permission required', { status: 403 });
  return defaultContestWindow(SITE_TIMEZONE);
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
