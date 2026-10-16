const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
// Repeated parameters (?from=a&from=b) arrive as arrays
const isMonth = (value) => typeof value === 'string' && MONTH_RE.test(value);

// Feed date ranges live in the URL (?from=YYYY-MM&to=YYYY-MM, or ?t=all) so
// feeds are shareable and survive reloads and back/forward navigation.
export function rangeFromQuery(query, fallback) {
  if (query.t === 'all') return null;
  if (isMonth(query.from) && isMonth(query.to)) {
    return query.from <= query.to ? { from: query.from, to: query.to } : { from: query.to, to: query.from };
  }
  return fallback;
}

export function rangeToQuery(range) {
  return range ? { from: range.from, to: range.to } : { t: 'all' };
}

function nextMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

// [{ month, posts }] in order -> every month from the first to the last, 0 where missing
export function fillMonths(months) {
  if (months.length === 0) return [];
  const counts = new Map(months.map((m) => [m.month, m.posts]));
  const filled = [];
  for (let m = months[0].month; m <= months[months.length - 1].month; m = nextMonth(m)) {
    filled.push({ month: m, posts: counts.get(m) || 0 });
  }
  return filled;
}
