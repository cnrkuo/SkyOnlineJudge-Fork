import { Verdict, VERDICT_LABEL, VERDICT_SHORT } from '@skyoj/contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Markdown } from '~/components/markdown';
import { api, load, seed } from '~/lib/api.server';
import { renderMarkdown } from '~/lib/markdown.server';
import { orpc } from '~/lib/orpc';
import { idParam } from '~/lib/params';
import { Button, ButtonLink, Card, css, Empty, Muted, Notice, PageHeader, Stack, Time, UserLink, useRoot } from '~/ui';
import { DataTable, type Column } from '~/ui/data-table';
import { Tip } from '~/ui/overlays';
import * as table from '~/ui/table.css';
import type { Route } from './+types/board';

export async function loader({ request, params }: Route.LoaderArgs) {
  const id = idParam(params.id);
  const board = await load(request, (o) => api.board.get({ id }, o));
  return {
    id,
    announce: await renderMarkdown(board.announce),
    dehydrated: seed([[orpc.board.get.queryKey({ input: { id } }), board]]),
  };
}

export const meta: Route.MetaFunction = () => [{ title: 'Scoreboard' }];

type Board = Awaited<ReturnType<typeof api.board.get>>;
type Row = Board['rows'][number];
type Cell = Row['cells'][number];

const round = (value: number) => Math.round(value * 100) / 100;

function cellTone(cell: Cell | undefined): string | undefined {
  if (!cell || cell.verdict === null) return undefined;
  if (cell.verdict === Verdict.AC) return css.toneFill.success;
  return cell.score > 0 ? css.toneFill.warning : css.toneFill.danger;
}

export default function Board({ loaderData }: Route.ComponentProps) {
  const { id, announce } = loaderData;
  const { user } = useRoot();
  const queryClient = useQueryClient();
  const options = orpc.board.get.queryOptions({ input: { id } });
  const { data: board } = useQuery({ ...options, refetchInterval: 60_000 });
  const join = useMutation(orpc.board.join.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: options.queryKey }) }));

  const columns = useMemo<Column<Row>[]>(() => {
    if (!board) return [];
    const total = board.problems.length;
    return [
      { id: 'user', header: 'User', fixed: true, sortValue: (r) => r.user.nickname.toLowerCase(), cell: (r) => <UserLink user={r.user} /> },
      { id: 'score', header: 'Score', align: 'right', descFirst: true, sortValue: (r) => r.score, cell: (r) => <strong>{round(r.score)}</strong> },
      { id: 'ac', header: 'AC', align: 'right', descFirst: true, sortValue: (r) => r.accepted, cell: (r) => r.accepted },
      {
        id: 'rate',
        header: 'Rate',
        align: 'right',
        descFirst: true,
        hidden: true,
        sortValue: (r) => r.accepted,
        cell: (r) => `${total ? Math.round((100 * r.accepted) / total) : 0}%`,
      },
      ...board.problems.map(
        (problem, index): Column<Row> => ({
          id: `p${problem.problemId}`,
          header: `${problem.problemId}${problem.note ? ` ${problem.note}` : ''}`,
          headerNode: (
            <Tip label={problem.note ? `${problem.title} — ${problem.note}` : problem.title}>
              <Link to={`/problems/${problem.problemId}`}>{problem.problemId}</Link>
            </Tip>
          ),
          align: 'center',
          descFirst: true,
          sortValue: (r) => r.cells[index]?.score ?? 0,
          cellClass: (r) => `${table.scoreCell} ${cellTone(r.cells[index]) ?? ''}`,
          cell: (r) => {
            const cell = r.cells[index];
            if (!cell || cell.verdict === null) return <Muted>·</Muted>;
            return (
              <Tip label={VERDICT_LABEL[cell.verdict]}>
                <Link to={`/submissions?user=${r.user.id}&problem=${problem.problemId}`}>
                  <strong>{VERDICT_SHORT[cell.verdict]}</strong>
                  <span className={table.scoreCellSub}>{round(cell.score)}</span>
                </Link>
              </Tip>
            );
          },
        }),
      ),
    ];
  }, [board]);

  if (!board) return null;
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
              <Button busy={join.isPending} onClick={() => join.mutate({ id })}>
                Join
              </Button>
            )}
            {board.canManage && <ButtonLink to="edit">Edit</ButtonLink>}
          </>
        }
      />
      <Stack gap="lg">
        {join.isError && <Notice result={{ ok: false, error: join.error.message }} />}
        {join.isSuccess && <Notice result={{ ok: true, message: 'You have joined this scoreboard.' }} />}
        {announce && (
          <Card>
            <Markdown html={announce} />
          </Card>
        )}
        <Card flush>
          <DataTable
            caption={board.title}
            data={board.rows}
            columns={columns}
            rowKey={(r) => r.user.id}
            columnMenu
            highlight={(r) => r.user.id === user?.id}
            empty={<Empty>Nobody is on this scoreboard yet.</Empty>}
          />
        </Card>
      </Stack>
    </>
  );
}
