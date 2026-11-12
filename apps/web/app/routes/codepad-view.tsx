import { LANGUAGE_LABEL } from '@skyoj/contract';
import { Link } from 'react-router';
import { CodeBlock } from '~/components/code';
import { PageHeader, Time, UserLink } from '~/components/ui';
import { api, load } from '~/lib/api.server';
import type { Route } from './+types/codepad-view';

export async function loader({ request, params }: Route.LoaderArgs) {
  return load(request, (o) => api.codepad.get({ hash: params.hash }, o));
}

export const meta: Route.MetaFunction = () => [{ title: 'Codepad' }, { name: 'robots', content: 'noindex' }];

export default function CodepadView({ loaderData: pad }: Route.ComponentProps) {
  return (
    <>
      <PageHeader
        title="Codepad"
        meta={
          <>
            {LANGUAGE_LABEL[pad.language].split(' (')[0]} · {pad.owner ? <UserLink user={pad.owner} /> : 'deleted user'} ·{' '}
            <Time value={pad.createdAt} />
          </>
        }
        actions={
          <Link className="btn" to="/codepad">
            New pad
          </Link>
        }
      />
      <CodeBlock code={pad.content} />
    </>
  );
}
