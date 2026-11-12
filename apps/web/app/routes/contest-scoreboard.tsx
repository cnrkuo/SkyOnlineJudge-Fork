import { ContestPhase, ContestStyle, TeamState } from '@skyoj/contract';
import { useEffect } from 'react';
import { Link, useRevalidator } from 'react-router';
import { Card, Empty, idParam, PageHeader, UserLink, useRoot } from '~/components/ui';
import { api, load } from '~/lib/api.server';
import type { Route } from './+types/contest-scoreboard';

export async function loader({ request, params }: Route.LoaderArgs) {
  const id = idParam(params.id);
  const [contest, board] = await Promise.all([
    load(request, (o) => api.contest.get({ id }, o)),
    load(request, (o) => api.contest.scoreboard({ id }, o)),
  ]);
  return { contest: { id: contest.id, title: contest.title, phase: contest.phase }, board };
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Scoreboard — ${loaderData?.contest.title ?? ''}` }];

type Cell = Route.ComponentProps['loaderData']['board']['rows'][number]['cells'][number];

function IcpcCell({ cell }: { cell: Cell }) {
  if (cell.attempts === 0) return <td className="text-center text-muted">·</td>;
  if (!cell.accepted) {
    return (
      <td className="bg-bad/10 text-center text-bad" title={`${cell.attempts} rejected`}>
        −{cell.attempts}
      </td>
    );
  }
  return (
    <td className={`text-center ${cell.firstBlood ? 'bg-good/30' : 'bg-good/10'} text-good`} title={cell.firstBlood ? 'First to solve' : undefined}>
      <div className="font-semibold">+{cell.attempts > 1 ? cell.attempts - 1 : ''}</div>
      <div className="text-xs tabular-nums">{cell.acceptedMinute}′</div>
    </td>
  );
}

function IoiCell({ cell }: { cell: Cell }) {
  if (cell.attempts === 0) return <td className="text-center text-muted">·</td>;
  const tone = cell.accepted ? 'bg-good/10 text-good' : cell.score > 0 ? 'bg-warn/10 text-warn' : 'bg-bad/10 text-bad';
  return (
    <td className={`text-center font-semibold tabular-nums ${tone}`} title={`${cell.attempts} submission${cell.attempts === 1 ? '' : 's'}`}>
      {Math.round(cell.score * 100) / 100}
    </td>
  );
}

export default function Scoreboard({ loaderData }: Route.ComponentProps) {
  const { contest, board } = loaderData;
  const { user } = useRoot();
  const ioi = board.style === ContestStyle.IOI;
  const live = contest.phase === ContestPhase.RUNNING;
  const { revalidate } = useRevalidator();

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => document.visibilityState === 'visible' && void revalidate(), 20_000);
    return () => clearInterval(timer);
  }, [live, revalidate]);

  return (
    <>
      <PageHeader
        title="Scoreboard"
        meta={
          <>
            <Link to={`/contests/${contest.id}`}>{contest.title}</Link>
            {live && ' · updates automatically'}
          </>
        }
      />
      {board.frozen && (
        <p role="status" className="mb-4 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
          The scoreboard is frozen: submissions from the final stretch are not shown until the contest ends.
        </p>
      )}
      <Card>
        {board.rows.length === 0 ? (
          <Empty>No participants yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-12">Rank</th>
                  <th>Participant</th>
                  <th className="num">{ioi ? 'Score' : 'Solved'}</th>
                  {!ioi && <th className="num">Penalty</th>}
                  {board.problems.map((problem) => (
                    <th key={problem.problemId} className="w-16 text-center!">
                      <Link to={`/problems/${problem.problemId}`}>{problem.tag}</Link>
                      <div className="font-normal normal-case" title="accepted / attempts">
                        {problem.accepted}/{problem.attempts}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {board.rows.map((row) => (
                  <tr key={row.user.id} className={row.user.id === user?.id ? 'bg-accent/5' : undefined}>
                    <td className="tabular-nums">{row.rank}</td>
                    <td>
                      <UserLink user={row.user} />
                      {row.state === TeamState.UNOFFICIAL && <span className="ml-2 text-xs text-muted">unofficial</span>}
                      {row.state === TeamState.HIDDEN && <span className="ml-2 text-xs text-muted">hidden</span>}
                    </td>
                    <td className="num font-semibold">{ioi ? Math.round(row.score * 100) / 100 : row.solved}</td>
                    {!ioi && <td className="num">{row.penalty}</td>}
                    {row.cells.map((cell, index) =>
                      ioi ? <IoiCell key={index} cell={cell} /> : <IcpcCell key={index} cell={cell} />,
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
