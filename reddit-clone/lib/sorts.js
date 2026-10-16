// Feed sort orders, shared by the pages, FeedControls and /api/Posts.
export const SORT_LABELS = {
  top: 'Top',
  controversial: 'Controversial',
  comments: 'Most comments',
  new: 'New',
  old: 'Old',
};

export const FEED_SORTS = ['top', 'controversial', 'comments', 'new', 'old'];
export const USER_SORTS = ['new', 'top', 'controversial', 'comments', 'old'];

// Comment sorts in a thread
export const COMMENT_SORTS = ['top', 'new', 'old', 'controversial'];
export const isCommentSort = (value) => typeof value === 'string' && COMMENT_SORTS.includes(value);

export const isSort = (value) => typeof value === 'string' && FEED_SORTS.includes(value);

// ?sort=… in the URL; anything else (missing, repeated, unknown) is the fallback
export function sortFromQuery(query, fallback, allowed = FEED_SORTS) {
  return allowed.includes(query.sort) ? query.sort : fallback;
}

// The page's query with a new sort; the default sort is left out of the URL
export function withSort(query, sort, fallback) {
  const next = { ...query };
  if (sort === fallback) delete next.sort;
  else next.sort = sort;
  return next;
}
