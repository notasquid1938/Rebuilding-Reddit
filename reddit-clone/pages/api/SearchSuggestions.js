import { MeiliSearch } from 'meilisearch'

export default async function handler(req, res) {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'Query parameter "query" is required' });
  }

  const client = new MeiliSearch({
    host: 'http://127.0.0.1:7700'
    //apiKey: 'masterKey',
  })

  const index = client.index('subreddits')

  const suggestions = await index.search(query, { limit: 5 });


  res.status(200).json({ suggestions });
}
