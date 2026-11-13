import { TeamState } from '@skyoj/contract';
import { Form } from 'react-router';
import { ContestForm } from '~/components/contest-form';
import { api, load, submit } from '~/lib/api.server';
import { parseContestForm, stateWord } from '~/lib/contest-form.server';
import { idParam } from '~/lib/params';
import {
  Button,
  ButtonLink,
  Card,
  CardBody,
  Cluster,
  css,
  Empty,
  Field,
  Measure,
  Muted,
  Notice,
  PageHeader,
  Stack,
  Time,
  UserLink,
} from '~/ui';
import { type Column, DataTable } from '~/ui/data-table';
import type { Route } from './+types/contest-edit';

const TEAM_STATES: [TeamState, string][] = [
  [TeamState.PENDING, 'Pending approval'],
  [TeamState.ACCEPTED, 'Accepted'],
  [TeamState.UNOFFICIAL, 'Unofficial'],
  [TeamState.HIDDEN, 'Hidden (test account)'],
  [TeamState.REJECTED, 'Rejected'],
  [TeamState.DROPPED, 'Disqualified'],
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const id = idParam(params.id);
  const [settings, participants] = await Promise.all([
    load(request, (o) => api.contest.settings({ id }, o)),
    load(request, (o) => api.contest.participants({ id }, o)),
  ]);
  const problems = settings.problems
    .map((p) => `${p.tag} ${p.problemId}${stateWord(p.state) === 'normal' ? '' : ` ${stateWord(p.state)}`}`)
    .join('\n');
  return { settings: { ...settings, problems }, participants };
}

export async function action({ request, params }: Route.ActionArgs) {
  const id = idParam(params.id);
  const form = await request.formData();

  if (form.get('intent') === 'participant') {
    const state = TEAM_STATES.find(([value]) => String(value) === form.get('state'))?.[0] ?? TeamState.PENDING;
    const result = await submit(request, (o) =>
      api.contest.setParticipant({ id, userId: Number(form.get('userId')), state }, o),
    );
    return { intent: 'participant', ...result, message: 'Participant updated.' };
  }

  const parsed = parseContestForm(form);
  if (!parsed.ok) return { intent: 'settings', ...parsed };
  const result = await submit(request, (o) => api.contest.update({ id, ...parsed.value }, o));
  return { intent: 'settings', ...result, message: 'Contest saved.' };
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `Edit: ${loaderData?.settings.title ?? 'contest'}` },
];

type Participant = Route.ComponentProps['loaderData']['participants'][number];

const participantColumns: Column<Participant>[] = [
  {
    id: 'user',
    header: 'User',
    sortValue: (p) => p.user.nickname.toLowerCase(),
    cell: (p) => (
      <Cluster>
        <UserLink user={p.user} /> <Muted small>#{p.user.id}</Muted>
      </Cluster>
    ),
  },
  {
    id: 'registered',
    header: 'Registered',
    sortValue: (p) => p.registeredAt,
    cell: (p) => (
      <Muted>
        <Time value={p.registeredAt} />
      </Muted>
    ),
  },
  {
    id: 'state',
    header: 'State',
    sortValue: (p) => p.state,
    // A native form per row: changing a participant works without JavaScript.
    cell: (p) => (
      <Form method="post">
        <Cluster>
          <input type="hidden" name="intent" value="participant" />
          <input type="hidden" name="userId" value={p.user.id} />
          <select
            className={`${css.select} ${css.inputWidth.auto}`}
            name="state"
            defaultValue={p.state}
            aria-label={`State of ${p.user.nickname}`}>
            {TEAM_STATES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Button variant="secondary" size="sm">
            Set
          </Button>
        </Cluster>
      </Form>
    ),
  },
];

export default function ContestEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { settings, participants } = loaderData;
  return (
    <Measure size="page">
      <PageHeader
        title="Edit contest"
        actions={<ButtonLink to={`/contests/${settings.id}`}>View contest</ButtonLink>}
      />
      <Stack gap="lg">
        <ContestForm
          values={settings}
          submitLabel="Save contest"
          result={actionData?.intent === 'settings' ? actionData : null}
        />

        <Card flush title={`Participants (${participants.length})`}>
          <CardBody>
            <Stack gap="sm">
              {actionData?.intent === 'participant' && <Notice result={actionData} />}
              <Form method="post">
                <Cluster align="end" gap="md">
                  <input type="hidden" name="intent" value="participant" />
                  <input type="hidden" name="state" value={TeamState.ACCEPTED} />
                  <Field label="Add a user by id">
                    <input className={css.inputWidth.sm} name="userId" inputMode="numeric" required />
                  </Field>
                  <Button variant="secondary">Add as accepted</Button>
                </Cluster>
              </Form>
            </Stack>
          </CardBody>
          <DataTable
            data={participants}
            columns={participantColumns}
            rowKey={(p) => p.user.id}
            empty={<Empty>Nobody has registered yet.</Empty>}
          />
        </Card>
      </Stack>
    </Measure>
  );
}
