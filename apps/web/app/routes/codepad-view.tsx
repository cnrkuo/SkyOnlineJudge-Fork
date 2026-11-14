import { api, load } from '~/lib/api.server';
import { highlight } from '~/lib/highlight.server';
import { ButtonLink, PageHeader, Time, UserLink } from '~/ui';
import { CodeView, languageName } from '~/ui/code';
import type { Route } from './+types/codepad-view';

export async function loader({ request, params }: Route.LoaderArgs) {
  const { content, ...pad } = await load(request, (o) => api.codepad.get({ hash: params.hash }, o));
  return { pad, html: await highlight(content, pad.language) };
}

export const meta: Route.MetaFunction = () => [{ title: 'Codepad' }, { name: 'robots', content: 'noindex' }];

export default function CodepadView({ loaderData: { pad, html } }: Route.ComponentProps) {
  return (
    <>
      <PageHeader
        title="Codepad"
        meta={
          <>
            {languageName(pad.language)} · {pad.owner ? <UserLink user={pad.owner} /> : 'deleted user'} ·{' '}
            <Time value={pad.createdAt} />
          </>
        }
        actions={<ButtonLink to="/codepad">New pad</ButtonLink>}
      />
      <CodeView html={html} />
    </>
  );
}
