import { useQuery } from '@tanstack/react-query';
import { ContestPhase, ContestStyle, TeamState } from '@yato/contract';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { type api, prefetch } from '~/lib/api.server';
import { orpc } from '~/lib/orpc';
import { idParam } from '~/lib/params';
import { formatElapsed } from '~/lib/time';
import { Badge, Callout, Card, Cluster, css, Empty, Muted, PageHeader, Stack, UserLink, useRoot } from '~/ui';
import { table } from '~/ui/classes';
import { type Column, DataTable } from '~/ui/data-table';
import { Tip } from '~/ui/overlays';
import type { Route } from './+types/contest-scoreboard';

export async function loader({ request, params }: Route.LoaderArgs) {
  const id = idParam(params.id);
  const dehydrated = await prefetch(request, (context) => [
    orpc.contest.get.queryOptions({ input: { id }, context }),
    orpc.contest.scoreboard.queryOptions({ input: { id }, context }),
  ]);
  return { id, dehydrated };
}

export const meta: Route.MetaFunction = () => [{ title: 'Scoreboard' }];

type Board = Awaited<ReturnType<typeof api.contest.scoreboard>>;
type Row = Board['rows'][number];
type Cell = Row['cells'][number];

const round = (value: number) => Math.round(value * 100) / 100;

/** Tint of a result cell: solved, partially solved, or failed so far. */
function cellTone(cell: Cell | undefined): string | undefined {
  if (!cell || cell.attempts === 0) return undefined;
  if (cell.accepted) return css.toneFill.success;
  return cell.score > 0 ? css.toneFill.warning : css.toneFill.danger;
}

/**
 * A cell's counted result: its value — in brackets for the first to solve
 * the problem — over the time since the contest started, linking to the
 * submission it counts.
 */
function Result({ cell, value, contestId }: { cell: Cell; value: string; contestId: number }) {
  const seconds = cell.solvedSeconds ?? 0;
  const when = `${formatElapsed(seconds, true)} after the start`;
  return (
    <Tip label={cell.firstBlood ? `First to solve · ${when}` : when}>
      <Link to={`/submissions/${cell.submissionId}?contest=${contestId}`} className={table.scoreLink}>
        <strong>{cell.firstBlood ? `[${value}]` : value}</strong>
        <span className={table.scoreCellSub}>{formatElapsed(seconds)}</span>
      </Link>
    </Tip>
  );
}

function IcpcCell({ cell, contestId }: { cell: Cell; contestId: number }) {
  if (cell.attempts === 0) return <Muted>·</Muted>;
  if (!cell.accepted || cell.submissionId === null) {
    return (
      <Tip label={`${cell.attempts} rejected`}>
        <span>−{cell.attempts}</span>
      </Tip>
    );
  }
  return <Result cell={cell} value={`+${cell.attempts > 1 ? cell.attempts - 1 : ''}`} contestId={contestId} />;
}

function IoiCell({ cell, contestId }: { cell: Cell; contestId: number }) {
  if (cell.attempts === 0) return <Muted>·</Muted>;
  if (cell.submissionId === null) {
    return (
      <Tip label={`${cell.attempts} submission${cell.attempts === 1 ? '' : 's'}, no points yet`}>
        <strong>0</strong>
      </Tip>
    );
  }
  return <Result cell={cell} value={String(round(cell.score))} contestId={contestId} />;
}

export default function Scoreboard({ loaderData }: Route.ComponentProps) {
  const { id } = loaderData;
  const { user } = useRoot();
  const contest = useQuery(orpc.contest.get.queryOptions({ input: { id } })).data;
  const live = contest?.phase === ContestPhase.RUNNING;
  // A running contest's board refreshes itself.
  const board = useQuery({
    ...orpc.contest.scoreboard.queryOptions({ input: { id } }),
    refetchInterval: live ? 20_000 : false,
  }).data;
  const ioi = board?.style === ContestStyle.IOI;

  const columns = useMemo<Column<Row>[]>(() => {
    if (!board) return [];
    return [
      { id: 'rank', header: 'Rank', fixed: true, sortValue: (r) => r.rank, cell: (r) => r.rank },
      {
        id: 'user',
        header: 'Participant',
        fixed: true,
        sortValue: (r) => r.user.username.toLowerCase(),
        cell: (r) => (
          <Cluster>
            <UserLink user={r.user} />
            {r.state === TeamState.UNOFFICIAL && <Badge>unofficial</Badge>}
            {r.state === TeamState.HIDDEN && <Badge>hidden</Badge>}
          </Cluster>
        ),
      },
      ioi
        ? {
            id: 'score',
            header: 'Score',
            align: 'right',
            descFirst: true,
            sortValue: (r) => r.score,
            cell: (r) => <strong>{round(r.score)}</strong>,
          }
        : {
            id: 'solved',
            header: 'Solved',
            align: 'right',
            descFirst: true,
            sortValue: (r) => r.solved,
            cell: (r) => <strong>{r.solved}</strong>,
          },
      ...(ioi
        ? []
        : [
            {
              id: 'penalty',
              header: 'Penalty',
              align: 'right',
              sortValue: (r) => r.penalty,
              cell: (r) => r.penalty,
            } satisfies Column<Row>,
          ]),
      // The tie-breaks, in order; all but the solving time are in the column menu.
      {
        id: 'time',
        header: 'Time',
        align: 'right',
        hidden: !ioi,
        sortValue: (r) => r.solveSeconds,
        cell: (r) => formatElapsed(r.solveSeconds, true),
      },
      {
        id: 'firstBloods',
        header: 'First solves',
        align: 'right',
        hidden: true,
        descFirst: true,
        sortValue: (r) => r.firstBloods,
        cell: (r) => r.firstBloods,
      },
      {
        id: 'rejected',
        header: 'Rejected',
        align: 'right',
        hidden: true,
        sortValue: (r) => r.rejected,
        cell: (r) => r.rejected,
      },
      {
        id: 'runTime',
        header: 'Run time',
        align: 'right',
        hidden: true,
        sortValue: (r) => r.runTimeMs,
        cell: (r) => `${r.runTimeMs} ms`,
      },
      {
        id: 'memory',
        header: 'Memory',
        align: 'right',
        hidden: true,
        sortValue: (r) => r.memoryKb,
        cell: (r) => `${r.memoryKb} KB`,
      },
      ...board.problems.map(
        (problem, index): Column<Row> => ({
          id: `p${problem.problemId}`,
          header: problem.tag,
          headerNode: (
            <Tip label={`${problem.accepted} solved / ${problem.attempts} attempts`}>
              <Link to={`/problems/${problem.problemId}?contest=${id}`}>{problem.tag}</Link>
            </Tip>
          ),
          align: 'center',
          descFirst: true,
          sortValue: (r) => r.cells[index]?.score ?? 0,
          cellClass: (r) => `${table.scoreCell} ${cellTone(r.cells[index]) ?? ''}`,
          cell: (r) => {
            const cell = r.cells[index];
            if (!cell) return null;
            return ioi ? <IoiCell cell={cell} contestId={id} /> : <IcpcCell cell={cell} contestId={id} />;
          },
        }),
      ),
    ];
  }, [board, ioi, id]);

  if (!board || !contest) return null;
  return (
    <>
      <PageHeader
        title="Scoreboard"
        meta={
          <>
            <Link to={`/contests/${id}`}>{contest.title}</Link>
            {live && ' · updates automatically'}
          </>
        }
        actions={
          <a className={css.button({ variant: 'secondary' })} href="scoreboard.csv" download>
            Download CSV
          </a>
        }
      />
      <Stack>
        {board.frozen && (
          <Callout>
            The scoreboard is frozen: submissions from the final stretch of the contest are not shown until the
            organisers publish the final standings.
          </Callout>
        )}
        <Card flush>
          <DataTable
            caption="Scoreboard"
            data={board.rows}
            columns={columns}
            rowKey={(r) => r.user.id}
            columnMenu
            highlight={(r) => r.user.id === user?.id}
            empty={<Empty>No participants yet.</Empty>}
          />
        </Card>
      </Stack>
    </>
  );
}
