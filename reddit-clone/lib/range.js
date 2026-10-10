const MONTH_RE = /^\d{4}-\d{2}$/;

// Feed date ranges live in the URL (?from=YYYY-MM&to=YYYY-MM, or ?t=all) so
// feeds are shareable and survive reloads and back/forward navigation.
export function rangeFromQuery(query, fallback) {
  if (query.t === 'all') return null;
  if (MONTH_RE.test(query.from || '') && MONTH_RE.test(query.to || '')) {
    return query.from <= query.to ? { from: query.from, to: query.to } : { from: query.to, to: query.from };
  }
  return fallback;
}

export function rangeToQuery(range) {
  return range ? { from: range.from, to: range.to } : { t: 'all' };
}
