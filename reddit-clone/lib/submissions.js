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
  'author_flair_text', numeric('score'), numeric('created_utc'), numeric('controversiality'),
];

// Comment sorts: SQL for the paged top level, and the same order for replies.
// Controversial puts the comments Reddit flagged (controversiality = 1) first.
const COMMENT_ORDER = {
  top: { sql: 'score DESC NULLS LAST', compare: (a, b) => b.score - a.score },
  new: { sql: 'created_utc DESC NULLS LAST', compare: (a, b) => b.created_utc - a.created_utc },
  old: { sql: 'created_utc ASC NULLS LAST', compare: (a, b) => a.created_utc - b.created_utc },
  controversial: {
    sql: 'controversiality DESC NULLS LAST, score DESC NULLS LAST',
    compare: (a, b) => b.controversial - a.controversial || b.score - a.score,
  },
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
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
    controversial: toNum(row.controversiality) === 1,
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

// Months in which a subreddit has posts (from subreddit_monthly), so community
// feeds only touch those tables instead of every month in the archive.
async function subredditMonths(subreddit) {
  if (!(await hasTable('subreddit_monthly'))) return null;
  const db = await connectToDatabase();
  const { rows } = await db.query(
    `SELECT to_char(month, 'YYYY-MM') AS month FROM subreddit_monthly WHERE subreddit = $1`,
    [subreddit]
  );
  return new Set(rows.map((r) => r.month));
}

const TOP_POSTS_PER_MONTH = 1000;

// Unfiltered "Top" pages come from top_posts (each month's top 1000) when
// every month in range has been summarised and the page is within that depth.
async function queryTopPosts(tables, limit, offset) {
  if (offset + limit > TOP_POSTS_PER_MONTH || !(await hasTable('top_posts'))) return null;
  const db = await connectToDatabase();
  const months = tables.map((t) => `${t.month}-01`);
  const { rows: covered } = await db.query(
    'SELECT count(DISTINCT month)::int AS n FROM top_posts WHERE month = ANY($1::date[])',
    [months]
  );
  if (covered[0].n !== months.length) return null;
  const { rows } = await timedQuery(
    `SELECT * FROM top_posts WHERE month = ANY($1::date[]) ORDER BY score DESC NULLS LAST LIMIT $2 OFFSET $3`,
    [months, limit, offset]
  );
  return rows.map(normalizePost);
}

// Sorts other than Top (and New for one author) have no index in the monthly
// tables. Community and front-page feeds read them from feed_rollup (see
// scripts/site_tables.sql), which keeps each month's leading posts for each
// sort; author feeds are small enough to sort directly.
const ROLLUP_ORDER = {
  // Communities only (version 2 rows); the front page's Top is top_posts
  top: 'pscore DESC, pid DESC',
  controversial: 'controversy(pscore, pcomments) DESC, pid DESC',
  comments: 'pcomments DESC, pid DESC',
  new: 'pcreated DESC, pid DESC',
  old: 'pcreated ASC, pid ASC',
};
const MAX_ROLLUP_DEPTH = 10000;

const commentCount = `(CASE WHEN num_comments ~ '^[0-9]{1,9}$' THEN num_comments::integer ELSE 0 END)`;
const LIVE_ORDER = {
  top: 'score DESC',
  new: 'created_utc DESC',
  old: 'created_utc ASC',
  comments: `${commentCount} DESC`,
  controversial: `controversy(score::integer, ${commentCount}) DESC`,
};

export class FeedNotReadyError extends Error {}

// The leading `limit` posts after `offset` for one rollup sort. The listing
// is exact up to the point where a month that had more posts than the rollup
// kept runs out of kept posts; anything past that could be missing posts, so
// the page stops there and is flagged `truncated`.
async function queryRollup(subreddit, tables, sort, limit, offset, minVersion = 1) {
  if (!(await hasTable('feed_rollup'))) throw new FeedNotReadyError();
  const months = tables.map((t) => `${t.month}-01`);
  const db = await connectToDatabase();
  const { rows: covered } = await db.query(
    "SELECT count(*)::int AS n FROM feed_rollup WHERE subreddit = '' AND month = ANY($1::date[]) AND version >= $2",
    [months, minVersion]
  );
  if (covered[0].n !== months.length) throw new FeedNotReadyError();
  if (offset >= MAX_ROLLUP_DEPTH) return Object.assign([], { truncated: true });

  const order = ROLLUP_ORDER[sort];
  const { rows } = await timedQuery(
    `SELECT to_char(month, 'YYYY-MM') AS month, posts, kept, pid::text AS pid, rn FROM (
       SELECT r.month, r.posts, r.kept, p.*, row_number() OVER (PARTITION BY r.month ORDER BY ${order}) AS rn
         FROM feed_rollup r, unnest(r.ids, r.created, r.scores, r.comments) AS p(pid, pcreated, pscore, pcomments)
        WHERE r.subreddit = $1 AND r.month = ANY($2::date[])
     ) ranked
     WHERE rn <= kept
     ORDER BY ${order}
     LIMIT $3`,
    [subreddit || '', months, Math.min(offset + limit, MAX_ROLLUP_DEPTH)]
  );
  const { page, truncated } = rollupPage(rows, offset, limit);
  const posts = await postsByIds(page.map((r) => ({ month: r.month, id: BigInt(r.pid).toString(36) })));
  return Object.assign(posts, { truncated });
}

// rows: the listing's first offset + limit rollup entries in order, each with
// its rank in its month (rn), the month's post count and how many were kept.
export function rollupPage(rows, offset, limit, maxDepth = MAX_ROLLUP_DEPTH) {
  const end = rows.findIndex((r) => Number(r.posts) > Number(r.kept) && Number(r.rn) === Number(r.kept));
  const exact = end === -1 ? rows : rows.slice(0, end + 1);
  return {
    page: exact.slice(offset, offset + limit),
    truncated: (end !== -1 && exact.length < offset + limit) || offset + limit > maxDepth,
  };
}

// Full list rows for (month, id) pairs, in the order given
async function postsByIds(entries) {
  if (entries.length === 0) return [];
  const tables = new Map((await getSubmissionTables()).map((t) => [t.month, t]));
  const byMonth = new Map();
  for (const { month, id } of entries) {
    if (!tables.has(month)) continue;
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(id);
  }
  const params = [];
  const branches = [...byMonth].map(([month, ids]) => {
    params.push(ids);
    const t = tables.get(month);
    return `SELECT ${selectColumns(t, POST_LIST_COLUMNS)} FROM "${t.name}" WHERE id = ANY($${params.length})`;
  });
  if (branches.length === 0) return [];
  const { rows } = await timedQuery(branches.join(' UNION ALL '), params);
  const found = new Map(rows.map((row) => [row.id, normalizePost(row)]));
  return entries.map((e) => found.get(e.id)).filter(Boolean);
}

export async function queryPosts({ startDate, endDate, subreddit, author, sort = 'top', limit = 25, offset = 0 }) {
  const allTables = await getSubmissionTables();
  let tables = author ? allTables : tablesInRange(allTables, startDate, endDate);
  if (subreddit && !author) {
    const months = await subredditMonths(subreddit);
    if (months) tables = tables.filter((t) => months.has(t.month));
  }
  if (tables.length === 0) return [];

  if (!subreddit && !author && sort === 'top') {
    const top = await queryTopPosts(tables, limit, offset);
    if (top) return top;
  }
  // A community's Top through the monthly indexes reads the leading post of
  // every month (hundreds of random reads); use the rollup once it has Top
  if (subreddit && !author && sort === 'top') {
    try {
      return await queryRollup(subreddit, tables, 'top', limit, offset, 2);
    } catch (error) {
      if (!(error instanceof FeedNotReadyError)) throw error;
    }
  }
  if (!author && sort !== 'top' && ROLLUP_ORDER[sort]) return queryRollup(subreddit, tables, sort, limit, offset);

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
  const orderBy = LIVE_ORDER[sort] || LIVE_ORDER.top;
  params.push(limit, offset);
  const text = `SELECT * FROM (${branches.join(' UNION ALL ')}) AS posts${clause} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const { rows } = await timedQuery(text, params);
  return rows.map(normalizePost);
}

// Reddit ids are sequential base-36 numbers, so post_id_ranges narrows a
// lookup to the month(s) whose id range contains it.
async function tablesForId(tables, id) {
  if (!(await hasTable('post_id_ranges'))) return tables;
  const value = parseInt(id, 36);
  if (!Number.isSafeInteger(value)) return tables;
  const db = await connectToDatabase();
  const { rows } = await db.query(
    'SELECT table_name FROM post_id_ranges WHERE $1::bigint BETWEEN id_min AND id_max',
    [value]
  );
  const names = new Set(rows.map((r) => r.table_name));
  // Months without a range yet (just loaded / legacy) are still searched
  const { rows: known } = await db.query('SELECT table_name FROM post_id_ranges');
  const summarised = new Set(known.map((r) => r.table_name));
  return tables.filter((t) => names.has(t.name) || !summarised.has(t.name));
}

export async function getPostById(id) {
  const tables = await tablesForId(await getSubmissionTables(), id);
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
export async function fetchCommentTree(tables, rootFullnames, { depth = 4, limit, offset = 0, sort = 'top' } = {}) {
  const order = COMMENT_ORDER[sort] || COMMENT_ORDER.top;
  let roots;
  if (limit) {
    const branches = tables
      .filter((t) => t.columns.has('parent_id'))
      .map((t) => `SELECT ${selectColumns(t, COMMENT_COLUMNS)} FROM "${t.name}" WHERE parent_id = ANY($1)`);
    if (branches.length === 0) return [];
    const { rows } = await timedQuery(
      `${branches.join(' UNION ALL ')} ORDER BY ${order.sql}, id LIMIT $2 OFFSET $3`,
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
      node.replies = (byParent.get(node.id) || []).sort(order.compare);
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
  return roots.sort(order.compare);
}

const toMonth = (date) => (date ? new Date(date).toISOString().slice(0, 7) : null);

// Archive stats (subreddits_metadata) merged with the community's about page
// (subreddit_about, from the Arctic Shift subreddit snapshots).
export async function getSubredditInfo(name) {
  const [hasMeta, hasAbout, hasMonthly] = await Promise.all([
    hasTable('subreddits_metadata'),
    hasTable('subreddit_about'),
    hasTable('subreddit_monthly'),
  ]);
  let info = null;
  if (hasMeta) {
    const { rows } = await timedQuery(
      `SELECT name, entry_count, first_seen, last_seen, post_count
         FROM subreddits_metadata WHERE lower(name) = lower($1)
        ORDER BY post_count DESC LIMIT 1`,
      [name],
      5000
    );
    const row = rows[0];
    if (row) {
      info = {
        name: row.name,
        months: Number(row.entry_count),
        posts: Number(row.post_count),
        firstMonth: toMonth(row.first_seen),
        lastMonth: toMonth(row.last_seen),
      };
    }
  }
  // subreddits_metadata is rebuilt once per loader cycle; subreddit_monthly is
  // updated as each month loads, so take the totals from it when possible.
  if (hasMonthly) {
    const { rows } = await timedQuery(
      `SELECT count(*)::integer AS months, sum(posts)::bigint AS posts,
              to_char(min(month), 'YYYY-MM') AS first_month, to_char(max(month), 'YYYY-MM') AS last_month
         FROM subreddit_monthly WHERE subreddit = $1`,
      [info?.name || name],
      5000
    );
    const row = rows[0];
    if (row?.months > 0) {
      info = {
        name: info?.name || name,
        months: row.months,
        posts: Number(row.posts),
        firstMonth: row.first_month,
        lastMonth: row.last_month,
      };
    }
  }
  if (hasAbout) {
    const { rows } = await timedQuery(
      `SELECT name, title, public_description, description, subscribers, created_utc, over18,
              subreddit_type, banner_url, primary_color, key_color
         FROM subreddit_about WHERE lower(name) = lower($1)
        ORDER BY subscribers DESC NULLS LAST LIMIT 1`,
      [info?.name || name],
      5000
    );
    const row = rows[0];
    if (row) {
      info = {
        months: 0,
        posts: 0,
        firstMonth: null,
        lastMonth: null,
        ...info,
        name: info?.name || row.name,
        about: {
          title: row.title,
          publicDescription: row.public_description,
          description: row.description,
          subscribers: row.subscribers === null ? null : Number(row.subscribers),
          createdUtc: row.created_utc === null ? null : Number(row.created_utc),
          over18: row.over18,
          type: row.subreddit_type,
          bannerUrl: row.banner_url,
          color: row.key_color || row.primary_color,
          // Only a name was recorded: the subreddit was already banned or private
          unavailable: row.title === null && row.subscribers === null,
        },
      };
    }
  }
  return info;
}

// Wide ranges aggregate millions of rollup rows, and the data only changes
// when the loader runs, so results are kept for an hour. Concurrent requests
// share one query, and a failed refresh serves the previous result.
const topCommunitiesCache = new Map();
const topCommunitiesInFlight = new Map();
const TOP_COMMUNITIES_CACHE_MS = 60 * 60 * 1000;

export async function getTopCommunities(startDate, endDate, limit = 10) {
  const key = `${startDate || ''}|${endDate || ''}|${limit}`;
  const cached = topCommunitiesCache.get(key);
  if (cached && Date.now() - cached.time < TOP_COMMUNITIES_CACHE_MS) return cached.value;
  if (!topCommunitiesInFlight.has(key)) {
    const query = queryTopCommunities(startDate, endDate, limit)
      .then((value) => {
        if (topCommunitiesCache.size > 500) topCommunitiesCache.clear();
        topCommunitiesCache.set(key, { time: Date.now(), value });
        return value;
      })
      .finally(() => topCommunitiesInFlight.delete(key));
    topCommunitiesInFlight.set(key, query);
  }
  try {
    return await topCommunitiesInFlight.get(key);
  } catch (error) {
    if (cached) return cached.value;
    throw error;
  }
}

async function queryTopCommunities(startDate, endDate, limit) {
  // All time: subreddits_metadata already has the totals, indexed by post_count
  if (!isMonth(startDate) && !isMonth(endDate) && (await hasTable('subreddits_metadata'))) {
    const { rows } = await timedQuery(
      'SELECT name, post_count FROM subreddits_metadata ORDER BY post_count DESC LIMIT $1',
      [limit],
      10000
    );
    return rows.map((row) => ({ name: row.name, posts: Number(row.post_count) }));
  }
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
    20000
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

// A random thread: from the front page, one of a month's top posts (top_posts,
// NSFW left out); in a community, one of the posts feed_rollup kept for a
// month picked in proportion to how much the community posted then. Both
// tables are small, so this never waits on the monthly tables' disk.
export async function randomPostId(subreddit) {
  if (!subreddit) {
    if (!(await hasTable('top_posts'))) return null;
    const { rows } = await timedQuery(
      `SELECT id FROM top_posts
        WHERE coalesce(lower(over_18), 'false') <> 'true' AND id IS NOT NULL
        ORDER BY random() LIMIT 1`,
      [],
      5000
    );
    return rows[0]?.id || null;
  }
  if (!(await hasTable('subreddit_monthly')) || !(await hasTable('feed_rollup'))) return null;
  const { rows } = await timedQuery(
    `SELECT f.ids[1 + floor(random() * cardinality(f.ids))::int]::text AS id
       FROM (SELECT month FROM subreddit_monthly WHERE subreddit = $1
              ORDER BY -ln(1 - random()) / posts LIMIT 1) m
       JOIN feed_rollup f ON f.subreddit = $1 AND f.month = m.month`,
    [subreddit],
    5000
  );
  return rows[0]?.id ? BigInt(rows[0].id).toString(36) : null;
}

export async function getSubredditHistory(subreddit) {
  if (!(await hasTable('subreddit_monthly'))) return [];
  const { rows } = await timedQuery(
    `SELECT to_char(month, 'YYYY-MM') AS month, posts FROM subreddit_monthly WHERE subreddit = $1 ORDER BY month`,
    [subreddit],
    5000
  );
  return rows.map((r) => ({ month: r.month, posts: Number(r.posts) }));
}
