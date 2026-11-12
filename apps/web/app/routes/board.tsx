import { Verdict, VERDICT_SHORT } from '@skyoj/contract';
import { Form, Link } from 'react-router';
import { Markdown } from '~/components/markdown';
import { Card, Empty, idParam, Notice, PageHeader, Time, UserLink, useRoot } from '~/components/ui';
import { api, load, submit } from '~/lib/api.server';
import type { Route } from './+types/board';

export async function loader({ request, params }: Route.LoaderArgs) {
  return load(request, (o) => api.board.get({ id: idParam(params.id) }, o));
}

/** "Join" button. */
export async function action({ request, params }: Route.ActionArgs) {
  const result = await submit(request, (o) => api.board.join({ id: idParam(params.id) }, o));
  return { ...result, message: 'You have joined this scoreboard.' };
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: loaderData?.title ?? 'Scoreboard' }];

type Cell = Route.ComponentProps['loaderData']['rows'][number]['cells'][number];

function ResultCell({ cell, userId, problemId }: { cell: Cell; userId: number; problemId: number }) {
  if (cell.verdict === null) return <td className="text-center text-muted">·</td>;
  const tone =
    cell.verdict === Verdict.AC ? 'bg-good/10 text-good' : cell.score > 0 ? 'bg-warn/10 text-warn' : 'bg-bad/10 text-bad';
  return (
    <td className={`text-center ${tone}`}>
      <Link className="text-inherit" to={`/submissions?user=${userId}&problem=${problemId}`}>
        <div className="font-semibold">{VERDICT_SHORT[cell.verdict]}</div>
        <div className="text-xs tabular-nums">{Math.round(cell.score * 100) / 100}</div>
      </Link>
    </td>
  );
}

export default function Board({ loaderData: board, actionData }: Route.ComponentProps) {
  const { user } = useRoot();
  const total = board.problems.length;
  return (
    <>
      <PageHeader
        title={board.title}
        meta={
          <>
            Submissions from <Time value={board.startAt} /> to <Time value={board.endAt} /> · by <UserLink user={board.owner} />
          </>
        }
        actions={
          <>
            {board.canJoin && (
              <Form method="post">
                <button className="btn btn-primary">Join</button>
              </Form>
            )}
            {board.canManage && (
              <Link className="btn" to="edit">
                Edit
              </Link>
            )}
          </>
        }
      />
      <div className="space-y-6">
        <Notice result={actionData} />
        {board.announce.trim() && (
          <Card className="p-5">
            <Markdown source={board.announce} />
          </Card>
        )}
        <Card>
          {board.rows.length === 0 ? (
            <Empty>Nobody is on this scoreboard yet.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>User</th>
                    <th className="num">Score</th>
                    <th className="num">AC</th>
                    <th className="num">Rate</th>
                    {board.problems.map((problem) => (
                      <th key={problem.problemId} className="w-16 text-center!" title={problem.title}>
                        <Link to={`/problems/${problem.problemId}`}>{problem.problemId}</Link>
                        {problem.note && <div className="font-normal normal-case">{problem.note}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map((row, index) => (
                    <tr key={row.user.id} className={row.user.id === user?.id ? 'bg-accent/5' : undefined}>
                      <td className="tabular-nums">{index + 1}</td>
                      <td>
                        <UserLink user={row.user} />
                      </td>
                      <td className="num font-semibold">{Math.round(row.score * 100) / 100}</td>
                      <td className="num">{row.accepted}</td>
                      <td className="num">{total ? Math.round((100 * row.accepted) / total) : 0}%</td>
                      {row.cells.map((cell, column) => (
                        <ResultCell key={column} cell={cell} userId={row.user.id} problemId={board.problems[column]!.problemId} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
