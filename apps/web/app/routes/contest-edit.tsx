import { TeamState } from '@skyoj/contract';
import { Form, Link } from 'react-router';
import { ContestForm } from '~/components/contest-form';
import { Card, Empty, idParam, Notice, PageHeader, Time, UserLink } from '~/components/ui';
import { api, load, submit } from '~/lib/api.server';
import { parseContestForm, stateWord } from '~/lib/contest-form.server';
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

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Edit: ${loaderData?.settings.title ?? 'contest'}` }];

export default function ContestEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { settings, participants } = loaderData;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Edit contest"
        actions={
          <Link className="btn" to={`/contests/${settings.id}`}>
            View contest
          </Link>
        }
      />
      <ContestForm values={settings} submitLabel="Save contest" result={actionData?.intent === 'settings' ? actionData : null} />

      <Card title={`Participants (${participants.length})`}>
        <div className="space-y-3 p-4">
          {actionData?.intent === 'participant' && <Notice result={actionData} />}
          <Form method="post" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="intent" value="participant" />
            <input type="hidden" name="state" value={TeamState.ACCEPTED} />
            <label className="text-sm">
              <span className="label">Add a user by id</span>
              <input className="input w-32" name="userId" inputMode="numeric" required />
            </label>
            <button className="btn">Add as accepted</button>
          </Form>
        </div>
        {participants.length === 0 ? (
          <Empty>Nobody has registered yet.</Empty>
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Registered</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((participant) => (
                  <tr key={participant.user.id}>
                    <td>
                      <UserLink user={participant.user} /> <span className="text-muted">#{participant.user.id}</span>
                    </td>
                    <td className="text-muted">
                      <Time value={participant.registeredAt} />
                    </td>
                    <td>
                      <Form method="post" className="flex items-center gap-2">
                        <input type="hidden" name="intent" value="participant" />
                        <input type="hidden" name="userId" value={participant.user.id} />
                        <select className="input w-auto" name="state" defaultValue={participant.state} aria-label={`State of ${participant.user.nickname}`}>
                          {TEAM_STATES.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <button className="btn">Set</button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
