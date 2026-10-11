// PostgREST caps every response at its project-wide "max rows" setting
// (1000 by default) no matter what .limit() the client asks for — a
// .limit(50000) call silently comes back with 1000 rows. Confirmed live:
// an account with ~19,600 listening_events rows had every query (stats,
// recap) truncated to the oldest/first 1000, which is why "4 weeks" showed
// nothing (the real recent rows were never fetched) and "month" vs "season"
// recaps looked identical (both got the same truncated slice). This pages
// through with .range() until a page comes back short, so callers get the
// real row count instead of one page of it.
//
// `concurrency` > 1 asks for that many pages at once (in waves), for big
// reads where one page after another took seconds; the query must have a
// stable order (e.g. .order('played_at').order('id')) for pages not to
// overlap.
const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maxRows = 50000,
  concurrency = 1
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  let offset = 0;
  while (offset < maxRows) {
    const wave = Math.max(1, Math.min(concurrency, Math.ceil((maxRows - offset) / PAGE_SIZE)));
    const pages = await Promise.all(
      Array.from({ length: wave }, (_, i) => buildQuery(offset + i * PAGE_SIZE, offset + (i + 1) * PAGE_SIZE - 1))
    );
    for (const { data, error } of pages) {
      if (error) return { rows, error: error.message };
      const page = data || [];
      rows.push(...page);
      if (page.length < PAGE_SIZE) return { rows, error: null };
    }
    offset += wave * PAGE_SIZE;
  }
  return { rows, error: null };
}
