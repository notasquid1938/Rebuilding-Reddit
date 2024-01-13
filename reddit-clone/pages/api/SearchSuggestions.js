import fs from 'fs';
import fuzzysort from 'fuzzysort';

export default async function handler(req, res) {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'Query parameter "query" is required' });
  }

  const startOverall = new Date();

  // Load and filter subreddits based on the query prefix
  const startLoad = new Date();
  const fileContent = fs.readFileSync('subreddits(HUGE).txt', 'utf-8');
  const subreddits = fileContent.split(/\r?\n/).filter(subreddit => subreddit.toLowerCase().startsWith(query.toLowerCase()));
  const endLoad = new Date();

  console.log(`Time taken for loading and filtering subreddits: ${endLoad - startLoad}ms`);

  // Perform fuzzy search and limit results to top 5
  const startFuzzySearch = new Date();
  const fuzzyResults = fuzzysort.go(query.toLowerCase(), subreddits, { limit: 5 });
  const endFuzzySearch = new Date();

  console.log(`Time taken for fuzzy search: ${endFuzzySearch - startFuzzySearch}ms`);

  const suggestions = fuzzyResults.map(result => result.target);

  const endOverall = new Date();
  console.log(`Total time taken: ${endOverall - startOverall}ms`);

  res.status(200).json({ suggestions });
}
