import { ContestStyle } from '@skyoj/contract';
import { api, load } from '~/lib/api.server';
import { idParam } from '~/lib/params';
import { formatElapsed } from '~/lib/time';
import type { Route } from './+types/contest-scoreboard-csv';

/** Quotes a CSV field and defuses spreadsheet formulas in user-chosen names. */
function field(value: string | number): string {
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** The scoreboard exactly as the viewer may see it (frozen or not), as CSV. */
export async function loader({ request, params }: Route.LoaderArgs) {
  const id = idParam(params.id);
  const board = await load(request, (o) => api.contest.scoreboard({ id }, o));
  const ioi = board.style === ContestStyle.IOI;

  const header = [
    'rank',
    'nickname',
    ...board.problems.map((p) => p.tag),
    ioi ? 'score' : 'solved',
    ioi ? 'time' : 'penalty',
    'run_time_ms',
    'memory_kb',
  ];
  const lines = board.rows.map((row) => [
    row.rank,
    row.user.nickname,
    ...row.cells.map((cell) =>
      ioi
        ? cell.score
        : cell.accepted && cell.solvedSeconds !== null
          ? `${cell.attempts}/${Math.floor(cell.solvedSeconds / 60)}`
          : cell.attempts
            ? `${cell.attempts}/--`
            : '',
    ),
    ioi ? row.score : row.solved,
    ioi ? formatElapsed(row.solveSeconds, true) : row.penalty,
    row.runTimeMs,
    row.memoryKb,
  ]);
  const csv = [header, ...lines].map((line) => line.map(field).join(',')).join('\r\n');

  // The BOM makes spreadsheet apps read the file as UTF-8.
  return new Response(`﻿${csv}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="contest-${id}-scoreboard.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
