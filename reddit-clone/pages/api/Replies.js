import connectToDatabase from '../../db';

const replyColumns = ['id', 'parent_id', 'body', 'score', 'created_utc'];

export default async function handler(req, res) {
  try {
    const { commentId } = req.query;

    if (!commentId) {
      return res.status(400).json({ error: 'Missing comment ID' });
    }

    const db = await connectToDatabase();
    const rcTablesQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'rc%'
      ORDER BY table_name;
    `;
    const rcTablesResult = await db.query(rcTablesQuery);
    const rcTables = rcTablesResult.rows.map(row => row.table_name);

    const firstLevelReplies = await fetchFirstLevelReplies(db, commentId, rcTables);

    return res.status(200).json({ replies: firstLevelReplies });
  } catch (error) {
    console.error('Error fetching replies:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function fetchFirstLevelReplies(db, parentId, rcTables) {
  const firstLevelReplies = [];

  for (const table of rcTables) {
    const query = `
      SELECT ${replyColumns.join(',')}
      FROM ${table}
      WHERE parent_id = 't1_${parentId}';
    `;
    const result = await db.query(query);
    const matchingReplies = result.rows;

    for (const reply of matchingReplies) {
      // Fetch second level replies
      const secondLevelReplies = await fetchSecondLevelReplies(db, reply.id, rcTables);
      reply.replies = secondLevelReplies;

      firstLevelReplies.push(reply);
    }
  }

  return firstLevelReplies;
}

async function fetchSecondLevelReplies(db, parentId, rcTables) {
  const secondLevelReplies = [];

  for (const table of rcTables) {
    const query = `
      SELECT ${replyColumns.join(',')}
      FROM ${table}
      WHERE parent_id = 't1_${parentId}';
    `;
    const result = await db.query(query);
    const matchingReplies = result.rows;

    secondLevelReplies.push(...matchingReplies);
  }

  return secondLevelReplies;
}
