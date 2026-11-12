import { ContestPhase, ContestProblemState, ContestStyle, RegisterType, TeamState } from '@skyoj/contract';
import { Form, Link } from 'react-router';
import { Markdown } from '~/components/markdown';
import { Card, Empty, idParam, Notice, PageHeader, PhaseBadge, Time, UserLink, useRoot } from '~/components/ui';
import { api, load, submit } from '~/lib/api.server';
import { formatDuration } from '~/lib/time';
import type { Route } from './+types/contest';

export async function loader({ request, params }: Route.LoaderArgs) {
  return load(request, (o) => api.contest.get({ id: idParam(params.id) }, o));
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const password = form.get('password');
  const result = await submit(request, (o) =>
    api.contest.register({ id: idParam(params.id), password: typeof password === 'string' ? password : undefined }, o),
  );
  if (!result.ok) return result;
  return {
    ok: true as const,
    message: result.data.state === TeamState.PENDING ? 'Registered — waiting for approval.' : 'You are registered.',
  };
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: loaderData?.title ?? 'Contest' }];

type Contest = Route.ComponentProps['loaderData'];

/** What the viewer's registration state means for them right now. */
function Registration({ contest, loggedIn }: { contest: Contest; loggedIn: boolean }) {
  switch (contest.myState) {
    case TeamState.PENDING:
      return <p className="text-sm">Your registration is waiting for approval by an administrator.</p>;
    case TeamState.REJECTED:
      return <p className="text-sm text-bad">Your registration was rejected.</p>;
    case TeamState.DROPPED:
      return <p className="text-sm text-bad">You have been disqualified from this contest.</p>;
    case TeamState.NOT_REGISTERED:
      break;
    default:
      return (
        <p className="text-sm text-good">
          You are registered{contest.myState === TeamState.UNOFFICIAL ? ' as an unofficial participant' : ''}.
          {contest.phase === ContestPhase.PREPARING && ' The problems appear here when the contest starts.'}
        </p>
      );
  }
  if (contest.phase === ContestPhase.ENDED) return <p className="text-sm text-muted">This contest has ended.</p>;
  if (contest.registerType === RegisterType.CLOSED) {
    return <p className="text-sm text-muted">Registration is by invitation only.</p>;
  }
  if (!loggedIn) {
    return (
      <p className="text-sm">
        <Link to={`/login?next=/contests/${contest.id}`}>Log in</Link> to register for this contest.
      </p>
    );
  }
  return (
    <Form method="post" className="flex flex-wrap items-end gap-2">
      {contest.registerType === RegisterType.PASSWORD && (
        <label className="text-sm">
          <span className="label">Contest password</span>
          <input className="input w-56" name="password" type="password" autoComplete="off" required />
        </label>
      )}
      <button className="btn btn-primary">Register</button>
      {contest.registerType === RegisterType.PERMIT_REQUIRED && (
        <span className="text-sm text-muted">An administrator has to approve your registration.</span>
      )}
    </Form>
  );
}

export default function Contest({ loaderData: contest, actionData }: Route.ComponentProps) {
  const { user } = useRoot();
  const boardVisible = contest.canManage || contest.phase === ContestPhase.ENDED || (contest.canEnter && contest.phase === ContestPhase.RUNNING);
  return (
    <>
      <PageHeader
        title={contest.title}
        meta={
          <>
            <PhaseBadge phase={contest.phase} /> · <Time value={contest.startAt} /> → <Time value={contest.endAt} /> (
            {formatDuration((Date.parse(contest.endAt) - Date.parse(contest.startAt)) / 1000)}) ·{' '}
            {contest.style === ContestStyle.IOI ? 'IOI rules' : 'ICPC rules'} · {contest.participants} participant
            {contest.participants === 1 ? '' : 's'} · by <UserLink user={contest.owner} />
          </>
        }
        actions={
          <>
            {boardVisible && (
              <Link className="btn" to="scoreboard">
                Scoreboard
              </Link>
            )}
            {contest.canManage && (
              <Link className="btn" to="edit">
                Edit
              </Link>
            )}
          </>
        }
      />

      <div className="space-y-6">
        <Card className="space-y-3 p-4">
          <Notice result={actionData} />
          <Registration contest={contest} loggedIn={user !== null} />
        </Card>

        {contest.description.trim() && (
          <Card className="p-5">
            <Markdown source={contest.description} />
          </Card>
        )}

        {contest.canEnter && (
          <Card title="Problems">
            {contest.problems.length === 0 ? (
              <Empty>This contest has no problems yet.</Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-16">#</th>
                    <th>Title</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {contest.problems.map((problem) => (
                    <tr key={problem.problemId}>
                      <td className="font-semibold">{problem.tag}</td>
                      <td>
                        <Link to={`/problems/${problem.problemId}`}>{problem.title}</Link>
                      </td>
                      <td className="text-right text-xs text-muted">
                        {problem.state === ContestProblemState.READONLY && 'submissions closed'}
                        {problem.state === ContestProblemState.HIDDEN && 'hidden from participants'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
