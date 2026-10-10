// Server-side helpers for querying the monthly rs_YYYY_MM / rc_YYYY_MM tables.
// Never import this file from client components.
import connectToDatabase from '@/db';

const TABLE_CACHE_MS = 5 * 60 * 1000;
const tableCache = {};

// Monthly tables were created from the keys of each dump's first JSON line, so
// a column can be missing from any given month (rs_2017_09 has no "subreddit").
// Every query goes through selectColumns() which substitutes NULL for gaps.
export async function getTables(prefix) {
  const cached = tableCache[prefix];
  if (cached && Date.now() - cached.time < TABLE_CACHE_MS) return cached.tables;

  const db = await connectToDatabase();
  const { rows } = await db.query(
    `SELECT c.relname AS table_name,
            array_agg(a.attname::text) AS columns
       FROM pg_class c
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE c.relnamespace = 'public'::regnamespace
        AND c.relkind = 'r'
        AND c.relname ~ $1
        AND pg_relation_size(c.oid) > 0
      GROUP BY c.relname
      ORDER BY c.relname`,
    [`^${prefix}_\\d{4}_\\d{2}$`]
  );

  const tables = rows.map((row) => ({
    name: row.table_name,
    month: row.table_name.slice(prefix.length + 1).replace('_', '-'),
    columns: new Set(row.columns),
  }));
  tableCache[prefix] = { time: Date.now(), tables };
  return tables;
}

export const getSubmissionTables = () => getTables('rs');
export const getCommentTables = () => getTables('rc');

export function selectColumns(table, columns) {
  return columns
    .map((col) => {
      if (col.sql) return `${col.sql(table)} AS "${col.name}"`;
      return table.columns.has(col) ? `"${col}"::text AS "${col}"` : `NULL::text AS "${col}"`;
    })
    .join(', ');
}

// Numeric columns are left untouched so ORDER BY can use their indexes.
const numeric = (name) => ({ name, sql: (t) => (t.columns.has(name) ? `"${name}"` : 'NULL::numeric') });
const truncated = (name, length) => ({
  name,
  sql: (t) => (t.columns.has(name) ? `left("${name}", ${length})` : 'NULL::text'),
});

const POST_LIST_COLUMNS = [
  'id', 'author', 'subreddit', 'title', 'url', 'domain', 'num_comments', 'is_self',
  'over_18', 'spoiler', 'stickied', 'link_flair_text', 'thumbnail', 'distinguished',
  numeric('score'), numeric('created_utc'), truncated('selftext', 700),
];

const POST_DETAIL_COLUMNS = [
  'id', 'author', 'subreddit', 'title', 'url', 'domain', 'num_comments', 'is_self',
  'over_18', 'spoiler', 'stickied', 'locked', 'link_flair_text', 'thumbnail',
  'distinguished', 'edited', 'permalink', 'selftext',
  numeric('score'), numeric('created_utc'),
];

const COMMENT_COLUMNS = [
  'id', 'parent_id', 'link_id', 'author', 'body', 'distinguished', 'edited', 'stickied',
  'author_flair_text', numeric('score'), numeric('created_utc'),
];

const MONTH_RE = /^\d{4}-\d{2}$/;
export const isMonth = (value) => typeof value === 'string' && MONTH_RE.test(value);
export const SUBREDDIT_RE = /^[A-Za-z0-9_.]{1,64}$/;
export const AUTHOR_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const ID_RE = /^[a-z0-9]{1,16}$/i;

export function tablesInRange(tables, startDate, endDate) {
  return tables.filter(
    (t) => (!isMonth(startDate) || t.month >= startDate) && (!isMonth(endDate) || t.month <= endDate)
  );
}

const nullish = (v) => v === null || v === undefined || v === '' || v === 'None';
const toBool = (v) => typeof v === 'string' && v.toLowerCase() === 'true';
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function normalizePost(row) {
  const post = {
    id: row.id,
    author: nullish(row.author) ? '[deleted]' : row.author,
    subreddit: nullish(row.subreddit) ? null : row.subreddit,
    title: row.title || '',
    url: nullish(row.url) ? null : row.url,
    domain: nullish(row.domain) ? null : row.domain,
    score: toNum(row.score),
    num_comments: toNum(row.num_comments),
    created_utc: toNum(row.created_utc),
    is_self: toBool(row.is_self),
    over_18: toBool(row.over_18),
    spoiler: toBool(row.spoiler),
    stickied: toBool(row.stickied),
    flair: nullish(row.link_flair_text) ? null : row.link_flair_text,
    thumbnail: nullish(row.thumbnail) ? null : row.thumbnail,
    distinguished: nullish(row.distinguished) ? null : row.distinguished,
    selftext: nullish(row.selftext) ? null : row.selftext,
  };
  if ('locked' in row) post.locked = toBool(row.locked);
  if ('edited' in row) post.edited = !nullish(row.edited) && row.edited !== 'False' ? toNum(row.edited) || true : false;
  return post;
}

export function normalizeComment(row) {
  return {
    id: row.id,
    parent_id: row.parent_id,
    author: nullish(row.author) ? '[deleted]' : row.author,
    body: row.body || '',
    score: toNum(row.score),
    created_utc: toNum(row.created_utc),
    distinguished: nullish(row.distinguished) ? null : row.distinguished,
    stickied: toBool(row.stickied),
    flair: nullish(row.author_flair_text) ? null : row.author_flair_text,
  };
}

// Run a query with a per-statement timeout so one expensive request can't
// pin a pool connection indefinitely.
export async function timedQuery(text, params, timeoutMs = 20000) {
  const db = await connectToDatabase();
  const client = await db.connect();
  try {
    await client.query(`SET statement_timeout = ${Math.floor(timeoutMs)}`);
    return await client.query(text, params);
  } finally {
    await client.query('RESET statement_timeout').catch(() => {});
    client.release();
  }
}

// Subreddit names are case-sensitive in the dumps; resolve "askreddit" to
// "AskReddit" when the metadata table is available.
export async function resolveSubreddit(name) {
  if (!(await hasTable('subreddits_metadata'))) return name;
  const db = await connectToDatabase();
  const { rows } = await db.query(
    `SELECT name FROM subreddits_metadata WHERE lower(name) = lower($1)
      ORDER BY post_count DESC LIMIT 1`,
    [name]
  );
  return rows[0]?.name || name;
}

const existingTables = new Map();
export async function hasTable(name) {
  const cached = existingTables.get(name);
  if (cached && Date.now() - cached.time < TABLE_CACHE_MS) return cached.exists;
  const db = await connectToDatabase();
  const { rows } = await db.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${name}`]);
  existingTables.set(name, { time: Date.now(), exists: rows[0].exists });
  return rows[0].exists;
}

export async function queryPosts({ startDate, endDate, subreddit, author, sort = 'top', limit = 25, offset = 0 }) {
  const allTables = await getSubmissionTables();
  const tables = author ? allTables : tablesInRange(allTables, startDate, endDate);
  if (tables.length === 0) return [];

  const params = [];
  const where = [];
  if (subreddit) {
    params.push(subreddit);
    where.push(`subreddit = $${params.length}`);
  }
  if (author) {
    params.push(author);
    where.push(`author = $${params.length}`);
  }

  // The filters must sit outside the UNION ALL: Postgres then treats the
  // filtered column as constant in every branch and merge-appends the
  // per-table (subreddit, score) / (author, created_utc) / (score) indexes
  // instead of sorting every matching row. No tie-breaker column: it forces an
  // incremental sort the planner badly overestimates. Btree order for equal
  // keys is deterministic, so OFFSET pages stay stable anyway.
  const branches = tables
    .filter((t) => (!subreddit || t.columns.has('subreddit')) && (!author || t.columns.has('author')))
    .map((t) => `SELECT ${selectColumns(t, POST_LIST_COLUMNS)} FROM "${t.name}"`);
  if (branches.length === 0) return [];

  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const orderBy = sort === 'new' ? 'created_utc DESC' : 'score DESC';
  params.push(limit, offset);
  const text = `SELECT * FROM (${branches.join(' UNION ALL ')}) AS posts${clause} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const { rows } = await timedQuery(text, params);
  return rows.map(normalizePost);
}

export async function getPostById(id) {
  const tables = await getSubmissionTables();
  const branches = tables
    .filter((t) => t.columns.has('id'))
    .map((t) => `SELECT ${selectColumns(t, POST_DETAIL_COLUMNS)}, '${t.month}' AS month FROM "${t.name}" WHERE id = $1`);
  if (branches.length === 0) return null;

  const { rows } = await timedQuery(`${branches.join(' UNION ALL ')} LIMIT 1`, [id], 10000);
  if (!rows[0]) return null;
  return { ...normalizePost(rows[0]), month: rows[0].month };
}

function addMonths(month, count) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + count, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Reddit archives threads after six months, so a post's comments live in its
// own month's table or one of the following six.
export async function commentTablesForMonth(month) {
  const tables = await getCommentTables();
  if (!isMonth(month)) return tables;
  return tablesInRange(tables, month, addMonths(month, 6));
}

async function fetchChildren(tables, parentIds) {
  if (parentIds.length === 0) return [];
  const branches = tables
    .filter((t) => t.columns.has('parent_id'))
    .map((t) => `SELECT ${selectColumns(t, COMMENT_COLUMNS)} FROM "${t.name}" WHERE parent_id = ANY($1)`);
  if (branches.length === 0) return [];
  const { rows } = await timedQuery(branches.join(' UNION ALL '), [parentIds]);
  return rows.map(normalizeComment);
}

// Fetch comments below `rootFullnames` (t3_ or t1_ ids) down to `depth` levels.
// Nodes at the bottom get `more: true` when they have unloaded children.
export async function fetchCommentTree(tables, rootFullnames, { depth = 4, limit, offset = 0 } = {}) {
  let roots;
  if (limit) {
    const branches = tables
      .filter((t) => t.columns.has('parent_id'))
      .map((t) => `SELECT ${selectColumns(t, COMMENT_COLUMNS)} FROM "${t.name}" WHERE parent_id = ANY($1)`);
    if (branches.length === 0) return [];
    const { rows } = await timedQuery(
      `${branches.join(' UNION ALL ')} ORDER BY score DESC LIMIT $2 OFFSET $3`,
      [rootFullnames, limit, offset]
    );
    roots = rows.map(normalizeComment);
  } else {
    roots = await fetchChildren(tables, rootFullnames);
  }

  let level = roots;
  for (let d = 1; d <= depth && level.length; d++) {
    const children = await fetchChildren(tables, level.map((c) => `t1_${c.id}`));
    const byParent = new Map();
    for (const child of children) {
      const key = child.parent_id.replace(/^t1_/, '');
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(child);
    }
    for (const node of level) {
      node.replies = (byParent.get(node.id) || []).sort((a, b) => b.score - a.score);
    }
    level = children;
  }

  if (level.length) {
    const branches = tables
      .filter((t) => t.columns.has('parent_id'))
      .map((t) => `SELECT DISTINCT parent_id FROM "${t.name}" WHERE parent_id = ANY($1)`);
    const { rows } = await timedQuery(branches.join(' UNION '), [level.map((c) => `t1_${c.id}`)]);
    const parents = new Set(rows.map((r) => r.parent_id.replace(/^t1_/, '')));
    for (const node of level) node.more = parents.has(node.id);
  }
  return roots.sort((a, b) => b.score - a.score);
}

const toMonth = (date) => (date ? new Date(date).toISOString().slice(0, 7) : null);

export async function getSubredditInfo(name) {
  if (!(await hasTable('subreddits_metadata'))) return null;
  const { rows } = await timedQuery(
    `SELECT name, entry_count, first_seen, last_seen, post_count
       FROM subreddits_metadata WHERE lower(name) = lower($1)
      ORDER BY post_count DESC LIMIT 1`,
    [name],
    5000
  );
  const row = rows[0];
  if (!row) return null;
  return {
    name: row.name,
    months: Number(row.entry_count),
    posts: Number(row.post_count),
    firstMonth: toMonth(row.first_seen),
    lastMonth: toMonth(row.last_seen),
  };
}

// Wide ranges aggregate millions of rollup rows, and the data only changes
// when the loader runs, so results are kept for an hour.
const topCommunitiesCache = new Map();
const TOP_COMMUNITIES_CACHE_MS = 60 * 60 * 1000;

export async function getTopCommunities(startDate, endDate, limit = 10) {
  const key = `${startDate || ''}|${endDate || ''}|${limit}`;
  const cached = topCommunitiesCache.get(key);
  if (cached && Date.now() - cached.time < TOP_COMMUNITIES_CACHE_MS) return cached.value;
  const value = await queryTopCommunities(startDate, endDate, limit);
  if (topCommunitiesCache.size > 500) topCommunitiesCache.clear();
  topCommunitiesCache.set(key, { time: Date.now(), value });
  return value;
}

async function queryTopCommunities(startDate, endDate, limit) {
  if (!(await hasTable('subreddit_monthly'))) return [];
  const params = [limit];
  let where = '';
  if (isMonth(startDate)) {
    params.push(`${startDate}-01`);
    where += ` AND month >= $${params.length}::date`;
  }
  if (isMonth(endDate)) {
    params.push(`${endDate}-01`);
    where += ` AND month <= $${params.length}::date`;
  }
  const { rows } = await timedQuery(
    `SELECT subreddit, SUM(posts)::bigint AS posts FROM subreddit_monthly
      WHERE true ${where} GROUP BY subreddit ORDER BY posts DESC LIMIT $1`,
    params,
    10000
  );
  return rows.map((row) => ({ name: row.subreddit, posts: Number(row.posts) }));
}

export async function getUserStats(author) {
  const tables = (await getSubmissionTables()).filter((t) => t.columns.has('author'));
  if (tables.length === 0) return null;
  const branches = tables.map((t) => `SELECT score, created_utc FROM "${t.name}" WHERE author = $1`);
  const { rows } = await timedQuery(
    `SELECT COUNT(*) AS posts, COALESCE(SUM(score), 0) AS karma,
            MIN(created_utc) AS first_post, MAX(created_utc) AS last_post
       FROM (${branches.join(' UNION ALL ')}) AS posts`,
    [author],
    8000
  );
  const row = rows[0];
  return {
    name: author,
    posts: Number(row.posts),
    karma: Number(row.karma),
    firstPost: row.first_post ? Number(row.first_post) : null,
    lastPost: row.last_post ? Number(row.last_post) : null,
  };
}
