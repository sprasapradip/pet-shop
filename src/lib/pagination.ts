export const PAGE_SIZE = 24;
export const MAX_PUBLIC_PAGE = 50;

export function pageParams(raw: unknown, size = PAGE_SIZE, maxPage = MAX_PUBLIC_PAGE) {
  const page = Math.min(Math.max(1, Number.parseInt(String(raw ?? '1'), 10) || 1), maxPage);
  return { page, take: size, skip: (page - 1) * size };
}

export function pageMeta(total: number, page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(total / size));
  return { total, page, pages, size, hasPrev: page > 1, hasNext: page < pages };
}

/** Rebuilds the current query string with a different page number. */
export function pageUrl(basePath: string, query: Record<string, unknown>, page: number) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (k === 'page' || v === undefined || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => params.append(k, String(x)));
    else params.set(k, String(v));
  }
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
