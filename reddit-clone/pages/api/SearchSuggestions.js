import fs from 'fs';
import fuzzysort from 'fuzzysort';

export default async function handler(req, res) {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'Query parameter "query" is required' });
  }

  const startOverall = new Date();

  // Load subreddits from file
  const startLoad = new Date();
  const fileContent = fs.readFileSync('subreddits(HUGE).txt', 'utf-8');
  const endLoad = new Date();
  const loadTime = endLoad - startLoad;

  //console.log(`Time taken for loading subreddits: ${loadTime}ms`);

  // Filter subreddits based on the query prefix
  const startFilter = new Date();
  const subreddits = fileContent.split(/\r?\n/).filter(subreddit => subreddit.toLowerCase().startsWith(query.toLowerCase()));
  const endFilter = new Date();
  const filterTime = endFilter - startFilter;

  //console.log(`Time taken for filtering subreddits: ${filterTime}ms`);

  // Perform fuzzy search and limit results to top 5
  const startFuzzySearch = new Date();
  const fuzzyResults = fuzzysort.go(query.toLowerCase(), subreddits, { limit: 5 });
  const endFuzzySearch = new Date();
  const fuzzySearchTime = endFuzzySearch - startFuzzySearch;

  //console.log(`Time taken for fuzzy search: ${fuzzySearchTime}ms`);

  const suggestions = fuzzyResults.map(result => result.target);

  const endOverall = new Date();
  const totalTime = endOverall - startOverall;
  //console.log(`Total time taken: ${totalTime}ms`);

  res.status(200).json({ suggestions });
}
