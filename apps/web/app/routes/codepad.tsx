import { LANGUAGE_LABEL } from '@skyoj/contract';
import { Form, Link, redirect } from 'react-router';
import { CodeInput, LanguageSelect, parseLanguage } from '~/components/code';
import { Card, Notice, PageHeader, Time } from '~/components/ui';
import { api, as, submit } from '~/lib/api.server';
import type { Route } from './+types/codepad';

export async function loader({ request }: Route.LoaderArgs) {
  const options = await as(request);
  const user = await api.auth.me(undefined, options);
  return { loggedIn: user !== null, mine: user ? await api.codepad.mine(undefined, options) : [] };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const result = await submit(request, (o) =>
    api.codepad.create({ language: parseLanguage(form.get('language')), content: String(form.get('code') ?? '') }, o),
  );
  return result.ok ? redirect(`/codepad/${result.data.hash}`) : result;
}

export const meta: Route.MetaFunction = () => [{ title: 'Codepad' }];

export default function Codepad({ loaderData, actionData }: Route.ComponentProps) {
  const { loggedIn, mine } = loaderData;
  return (
    <>
      <PageHeader title="Codepad" meta="Share a snippet of code through an unguessable link." />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          {loggedIn ? (
            <Form method="post" className="space-y-3 p-4">
              <Notice result={actionData} />
              <CodeInput maxLength={15000} />
              <div className="flex flex-wrap items-center gap-2">
                <LanguageSelect />
                <button className="btn btn-primary">Save and get a link</button>
              </div>
            </Form>
          ) : (
            <p className="p-4 text-sm">
              <Link to="/login?next=/codepad">Log in</Link> to create a pad. Anyone with a pad's link can read it.
            </p>
          )}
        </Card>
        {loggedIn && (
          <Card title="Your pads">
            {mine.length === 0 ? (
              <p className="p-4 text-sm text-muted">You have not saved any pads yet.</p>
            ) : (
              <ul className="text-sm">
                {mine.map((pad) => (
                  <li key={pad.hash} className="border-b border-line px-4 py-2 last:border-b-0">
                    <Link to={`/codepad/${pad.hash}`}>
                      <Time value={pad.createdAt} />
                    </Link>
                    <div className="text-xs text-muted">{LANGUAGE_LABEL[pad.language].split(' (')[0]}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
