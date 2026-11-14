export interface PageInput {
  page: number;
  pageSize: number;
}

export const offsetOf = ({ page, pageSize }: PageInput) => (page - 1) * pageSize;

export function pageOf<T>(items: T[], total: number, { page, pageSize }: PageInput) {
  return { items, total, page, pageSize };
}
