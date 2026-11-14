import { Form, Link, redirect } from 'react-router';
import { api, as, submit } from '~/lib/api.server';
import { Button, Card, Cluster, css, Muted, Notice, PageHeader, Split, Stack, Time } from '~/ui';
import { CodeInput, LanguageSelect, languageName, parseLanguage } from '~/ui/code';
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
  if (!loggedIn) {
    return (
      <>
        <PageHeader title="Codepad" meta="Share a snippet of code through an unguessable link." />
        <Card>
          <Muted>
            <Link to="/login?next=/codepad">Log in</Link> to create a pad. Anyone with a pad's link can read it.
          </Muted>
        </Card>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Codepad" meta="Share a snippet of code through an unguessable link." />
      <Split>
        <Card>
          <Form method="post">
            <Stack gap="sm">
              <Notice result={actionData} />
              <CodeInput maxLength={15000} />
              <Cluster>
                <LanguageSelect />
                <Button>Save and get a link</Button>
              </Cluster>
            </Stack>
          </Form>
        </Card>
        <Card flush title="Your pads">
          {mine.length === 0 ? (
            <div className={css.cardBody}>
              <Muted>You have not saved any pads yet.</Muted>
            </div>
          ) : (
            <ul className={css.list}>
              {mine.map((pad) => (
                <li key={pad.hash} className={css.listItem}>
                  <Link to={`/codepad/${pad.hash}`} className={css.grow}>
                    <Time value={pad.createdAt} />
                  </Link>
                  <Muted small>{languageName(pad.language)}</Muted>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Split>
    </>
  );
}
