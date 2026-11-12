import {
  columnVisibilityFeature,
  createSortedRowModel,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table';
import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { button, grow } from './kit.css';
import { Menu, MenuCheck, MenuLabel, SelectBox } from './overlays';
import * as css from './table.css';

/**
 * The one table of the application. Every tabular view — problems,
 * submissions, scoreboards, users — is a `DataTable` given data and column
 * descriptions, so headers, density, alignment, sorting, empty states and
 * paging look and behave identically everywhere.
 *
 * TanStack Table provides the sorting and column-visibility logic; this file
 * is the only place that touches its API.
 */

export interface Column<T> {
  id: string;
  /** Text label; also used in the column menu. */
  header: string;
  /** Rich header content when the label alone is not enough. */
  headerNode?: ReactNode;
  cell: (row: T) => ReactNode;
  /** Numbers are right-aligned with tabular figures. */
  align?: 'left' | 'right' | 'center';
  /** Makes the column sortable by this value (client-side). */
  sortValue?: (row: T) => number | string;
  /** Sort descending on the first click (scores, counts). */
  descFirst?: boolean;
  /** Start hidden; the reader can show it from the column menu. */
  hidden?: boolean;
  /** Keep out of the column menu (identifying columns). */
  fixed?: boolean;
  /** Extra class for a body cell, e.g. a tone fill on scoreboards. */
  cellClass?: (row: T) => string | undefined;
}

const features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});

interface DataTableProps<T extends RowData> {
  data: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  /** Shown instead of the table when there are no rows. */
  empty: ReactNode;
  /** Filters, placed at the left of the toolbar. */
  toolbar?: ReactNode;
  /** Offer a menu to show and hide columns. */
  columnMenu?: boolean;
  /** Usually a `<Pager>`. */
  footer?: ReactNode;
  /** Newer data is loading; the current rows stay visible but dimmed. */
  stale?: boolean;
  highlight?: (row: T) => boolean;
  caption?: string;
}

export function DataTable<T extends RowData>({
  data,
  columns,
  rowKey,
  empty,
  toolbar,
  columnMenu = false,
  footer,
  stale = false,
  highlight,
  caption,
}: DataTableProps<T>) {
  const byId = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);
  const defs = useMemo<ColumnDef<typeof features, T>[]>(
    () =>
      columns.map((column) => ({
        id: column.id,
        header: column.header,
        accessorFn: (row: T) => column.sortValue?.(row) ?? null,
        enableSorting: column.sortValue !== undefined,
        sortDescFirst: column.descFirst ?? false,
        enableHiding: !column.fixed,
      })),
    [columns],
  );
  const initialVisibility = useMemo(
    () => Object.fromEntries(columns.filter((column) => column.hidden).map((column) => [column.id, false])),
    [columns],
  );

  const table = useTable({
    features,
    columns: defs,
    data,
    getRowId: (row) => String(rowKey(row)),
    initialState: { columnVisibility: initialVisibility },
  });

  const hideable = table.getAllLeafColumns().filter((column) => column.getCanHide());
  const rows = table.getRowModel().rows;

  return (
    <>
      {(toolbar || columnMenu) && (
        <div className={css.toolbar}>
          <div className={grow}>{toolbar}</div>
          {columnMenu && hideable.length > 0 && (
            <Menu label="Columns">
              <MenuLabel>Show columns</MenuLabel>
              {hideable.map((column) => (
                <MenuCheck key={column.id} checked={column.getIsVisible()} onChange={(visible) => column.toggleVisibility(visible)}>
                  {byId.get(column.id)?.header}
                </MenuCheck>
              ))}
            </Menu>
          )}
        </div>
      )}

      {data.length === 0 ? (
        empty
      ) : (
        <div className={css.scroller}>
          <table className={css.table} aria-busy={stale || undefined}>
            {caption && <caption hidden>{caption}</caption>}
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => {
                    const column = byId.get(header.column.id)!;
                    const sorted = header.column.getIsSorted();
                    const label = column.headerNode ?? column.header;
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className={`${css.headCell} ${css.align[column.align ?? 'left']}`}
                        aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                      >
                        {header.column.getCanSort() ? (
                          <button type="button" className={css.sortButton} onClick={header.column.getToggleSortingHandler()}>
                            {label}
                            <span aria-hidden className={css.sortIcon[sorted ? 'active' : 'idle']}>
                              {sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '↕'}
                            </span>
                          </button>
                        ) : (
                          label
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className={stale ? css.stale : undefined}>
              {rows.map((row) => (
                <tr key={row.id} className={`${css.row} ${highlight?.(row.original) ? css.rowHighlight : ''}`}>
                  {row.getVisibleCells().map((cell) => {
                    const column = byId.get(cell.column.id)!;
                    return (
                      <td key={cell.id} className={`${css.align[column.align ?? 'left']} ${column.cellClass?.(row.original) ?? ''}`}>
                        {column.cell(row.original)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footer}
    </>
  );
}

const PAGE_SIZES = ['20', '50', '100'] as const;

/**
 * Paging controls for server-paged tables. The page lives in the URL
 * (`?page=`, `?size=`), so a page can be linked, reloaded and navigated with
 * the browser's back button; the links work without JavaScript.
 */
export function Pager({ page, pageSize, total, sizes = false }: { page: number; pageSize: number; total: number; sizes?: boolean }) {
  const [params, setParams] = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const to = (target: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(target));
    return `?${next}`;
  };
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const secondary = button({ variant: 'secondary', size: 'sm' });

  return (
    <nav aria-label="Pagination" className={css.footer}>
      <span>
        {first}–{last} of {total}
      </span>
      {sizes && (
        <SelectBox
          size="sm"
          label="Rows per page"
          value={String(pageSize) as (typeof PAGE_SIZES)[number]}
          options={PAGE_SIZES.map((size) => ({ value: size, label: `${size} per page` }))}
          onChange={(size) => {
            const next = new URLSearchParams(params);
            next.set('size', size);
            next.delete('page');
            setParams(next, { preventScrollReset: true });
          }}
        />
      )}
      <span>
        {page > 1 ? (
          <Link role="button" className={secondary} to={to(page - 1)} rel="prev" preventScrollReset>
            ← Previous
          </Link>
        ) : (
          <span role="button" aria-disabled="true" className={secondary}>
            ← Previous
          </span>
        )}{' '}
        Page {page} of {pages}{' '}
        {page < pages ? (
          <Link role="button" className={secondary} to={to(page + 1)} rel="next" preventScrollReset>
            Next →
          </Link>
        ) : (
          <span role="button" aria-disabled="true" className={secondary}>
            Next →
          </span>
        )}
      </span>
    </nav>
  );
}
