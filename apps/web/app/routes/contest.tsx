import { ContestPhase, ContestProblemState, ContestStyle, RegisterType, TeamState } from '@skyoj/contract';
import { Form, Link } from 'react-router';
import { Markdown } from '~/components/markdown';
import { api, load, submit } from '~/lib/api.server';
import { renderMarkdown } from '~/lib/markdown.server';
import { idParam } from '~/lib/params';
import { formatDuration } from '~/lib/time';
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  Cluster,
  css,
  Empty,
  Field,
  Muted,
  Notice,
  PageHeader,
  PhaseBadge,
  Stack,
  Time,
  UserLink,
  useRoot,
} from '~/ui';
import { type Column, DataTable } from '~/ui/data-table';
import type { Route } from './+types/contest';

export async function loader({ request, params }: Route.LoaderArgs) {
  const contest = await load(request, (o) => api.contest.get({ id: idParam(params.id) }, o));
  return { ...contest, description: await renderMarkdown(contest.description) };
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
      return <Callout>Your registration is waiting for approval by an administrator.</Callout>;
    case TeamState.REJECTED:
      return <Callout tone="danger">Your registration was rejected.</Callout>;
    case TeamState.DROPPED:
      return <Callout tone="danger">You have been disqualified from this contest.</Callout>;
    case TeamState.NOT_REGISTERED:
      break;
    default:
      return (
        <Callout tone="success">
          You are registered{contest.myState === TeamState.UNOFFICIAL ? ' as an unofficial participant' : ''}.
          {contest.phase === ContestPhase.PREPARING && ' The problems appear here when the contest starts.'}
        </Callout>
      );
  }
  if (contest.phase === ContestPhase.ENDED) return <Muted>This contest has ended.</Muted>;
  if (contest.registerType === RegisterType.CLOSED) return <Muted>Registration is by invitation only.</Muted>;
  if (!loggedIn) {
    return (
      <Muted>
        <Link to={`/login?next=/contests/${contest.id}`}>Log in</Link> to register for this contest.
      </Muted>
    );
  }
  return (
    <Form method="post">
      <Cluster align="end" gap="md">
        {contest.registerType === RegisterType.PASSWORD && (
          <Field label="Contest password">
            <input className={css.inputWidth.md} name="password" type="password" autoComplete="off" required />
          </Field>
        )}
        <Button>Register</Button>
        {contest.registerType === RegisterType.PERMIT_REQUIRED && (
          <Muted small>An administrator has to approve your registration.</Muted>
        )}
      </Cluster>
    </Form>
  );
}

const problemColumns: Column<Contest['problems'][number]>[] = [
  { id: 'tag', header: '#', cell: (p) => <strong>{p.tag}</strong> },
  { id: 'title', header: 'Title', cell: (p) => <Link to={`/problems/${p.problemId}`}>{p.title}</Link> },
  {
    id: 'state',
    header: 'Status',
    align: 'right',
    cell: (p) =>
      p.state === ContestProblemState.READONLY ? (
        <Badge>submissions closed</Badge>
      ) : p.state === ContestProblemState.HIDDEN ? (
        <Badge>hidden from participants</Badge>
      ) : null,
  },
];

export default function Contest({ loaderData: contest, actionData }: Route.ComponentProps) {
  const { user } = useRoot();
  const boardVisible = contest.canManage || contest.phase !== ContestPhase.PREPARING;
  return (
    <>
      <PageHeader
        title={contest.title}
        meta={
          <Cluster>
            <PhaseBadge phase={contest.phase} />
            <span>
              <Time value={contest.startAt} /> → <Time value={contest.endAt} /> (
              {formatDuration((Date.parse(contest.endAt) - Date.parse(contest.startAt)) / 1000)})
            </span>
            <span>{contest.style === ContestStyle.IOI ? 'IOI rules' : 'ICPC rules'}</span>
            <span>
              {contest.participants} participant{contest.participants === 1 ? '' : 's'}
            </span>
            <span>
              by <UserLink user={contest.owner} />
            </span>
          </Cluster>
        }
        actions={
          <>
            {boardVisible && <ButtonLink to="scoreboard">Scoreboard</ButtonLink>}
            {user && contest.canEnter && <ButtonLink to={`/submissions?user=${user.id}`}>My submissions</ButtonLink>}
            {contest.canManage && <ButtonLink to="edit">Edit</ButtonLink>}
          </>
        }
      />

      <Stack gap="lg">
        <Stack gap="sm">
          <Notice result={actionData} />
          <Registration contest={contest} loggedIn={user !== null} />
        </Stack>

        {contest.description && (
          <Card>
            <Markdown html={contest.description} />
          </Card>
        )}

        {contest.canEnter && (
          <Card flush title="Problems">
            <DataTable
              data={contest.problems}
              columns={problemColumns}
              rowKey={(p) => p.problemId}
              empty={<Empty>This contest has no problems yet.</Empty>}
            />
          </Card>
        )}
      </Stack>
    </>
  );
}
