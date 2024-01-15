import { MeiliSearch } from 'meilisearch';

export default async function handler(req, res) {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'Query parameter "query" is required' });
  }

  const client = new MeiliSearch({
    host: 'http://127.0.0.1:7700'
    //apiKey: 'masterKey',
  });

  const index = client.index('subreddits');

  // Set the limit to 5 to get only the top 5 results
  const searchResults = await index.search(query, { limit: 5 });

  // Extract only the subreddit names from the search results
  const subredditNames = searchResults.hits.map(result => result.subreddit);

  res.status(200).json({ suggestions: subredditNames });
}
