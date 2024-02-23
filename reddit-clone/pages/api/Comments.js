import connectToDatabase from '../../db';

const replyColumns = ['id', 'parent_id', 'body', 'score', 'created_utc']; // Define columns to fetch from tables

export default async function handler(req, res) {
  try {
    const { id, page = 1, commentsPerPage = 1 } = req.query;

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
  let offset = (page - 1) * commentsPerPage;

  for (const table of rcTables) {
    const query = `
      SELECT ${replyColumns.join(',')}
      FROM ${table}
      WHERE parent_id = 't3_${postId}'
      ORDER BY score DESC
      OFFSET ${offset}
      LIMIT ${remainingPerPage};
    `;
    const result = await db.query(query);
    const matchingComments = result.rows;

    for (const comment of matchingComments) {
      const replies = await fetchRepliesRecursively(db, comment.id, rcTables);
      allComments.push({ ...comment, replies });
      remainingPerPage--;

      if (remainingPerPage === 0) {
        break; // If we have reached the required number of comments per page, exit loop
      }
    }

    if (remainingPerPage === 0) {
      break; // If we have reached the required number of comments per page, exit loop
    } else {
      offset = Math.max(offset - commentsPerPage, 0); // Adjust offset for the next table
    }
  }

  return allComments;
}

async function fetchRepliesRecursively(db, parentId, rcTables) {
  const allReplies = [];

  for (const table of rcTables) {
    const query = `
      SELECT ${replyColumns.join(',')}
      FROM ${table}
      WHERE parent_id = 't1_${parentId}';
    `;
    const result = await db.query(query);
    const matchingReplies = result.rows;

    for (const reply of matchingReplies) {
      const nestedReplies = await fetchRepliesRecursively(db, reply.id, rcTables);
      reply.replies = nestedReplies;
      allReplies.push(reply);
    }
  }

  return allReplies;
}
