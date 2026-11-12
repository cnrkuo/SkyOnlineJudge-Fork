/** Helpers for reading route and query parameters in loaders and pages. */

/** Positive integer route/query parameter, or a 404. */
export function idParam(value: string | undefined | null): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Response('Not found', { status: 404 });
  return id;
}

/** Positive integer from a query string, or `undefined`. */
export function positive(value: string | null): number | undefined {
  const number = Number(value);
  return value !== null && Number.isInteger(number) && number > 0 ? number : undefined;
}

export const PAGE_SIZES = [20, 50, 100];

/** `?page=` and `?size=` with safe fallbacks. */
export function paging(params: URLSearchParams, defaultSize = 50): { page: number; pageSize: number } {
  const size = positive(params.get('size'));
  return { page: positive(params.get('page')) ?? 1, pageSize: size && PAGE_SIZES.includes(size) ? size : defaultSize };
}
