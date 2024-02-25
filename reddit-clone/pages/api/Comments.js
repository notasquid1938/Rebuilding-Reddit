import connectToDatabase from '../../db';

const replyColumns = ['id', 'parent_id', 'body', 'score', 'created_utc']; // Define columns to fetch from tables

export default async function handler(req, res) {
  try {
    const { id, page, commentsPerPage = 10 } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Missing post ID' });
    }

    const db = await connectToDatabase();
    
    // Fetch tables in the schema starting with 'rc'
    const rcTablesQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'rc%'
      ORDER BY table_name;
    `;
    const rcTablesResult = await db.query(rcTablesQuery);
    const rcTables = rcTablesResult.rows.map(row => row.table_name);

    const allComments = await fetchCommentsWithReplies(db, id, rcTables, page, commentsPerPage);

    return res.status(200).json(allComments);
  } catch (error) {
    console.error('Error fetching comments data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function fetchCommentsWithReplies(db, postId, rcTables, page, commentsPerPage) {
  const allComments = [];
  let remainingPerPage = commentsPerPage;
  let offset = (page - 1) * commentsPerPage; // Calculate offset based on page number

  // Build a UNION query to fetch comments from all tables
  let unionQuery = '';
  for (const table of rcTables) {
    unionQuery += `
      SELECT ${replyColumns.join(',')}
      FROM ${table}
      WHERE parent_id = 't3_${postId}'
      UNION ALL `;
  }
  // Remove the last 'UNION ALL' and add the ORDER BY, OFFSET, and LIMIT clauses
  unionQuery = unionQuery.slice(0, -10); // Remove the last 'UNION ALL'
  unionQuery += `
    ORDER BY score DESC
    OFFSET ${offset}
    LIMIT ${remainingPerPage};
  `;
  
  try {
    const result = await db.query(unionQuery);
    const matchingComments = result.rows;

    for (const comment of matchingComments) {
      const replies = await fetchFirstLevelReplies(db, comment.id, rcTables);
      allComments.push({ ...comment, replies });
      remainingPerPage--;

      if (remainingPerPage === 0) {
        break; // If we have reached the required number of comments per page, exit loop
      }
    }
  } catch (error) {
    console.error('Error fetching comments with replies:', error);
    throw error;
  }

  return allComments;
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

    firstLevelReplies.push(...matchingReplies);
  }

  return firstLevelReplies;
}
