//Some notes on Trie 1.7mb CSV needed a 38mb trie.json
//Searching h consistently took 170ms to get suggestions using csv
//txt only takes 80ms

import fs from 'fs';
import readline from 'readline';
import fuzzysort from 'fuzzysort';

// Use a simple in-memory cache
const cache = {};

export default async function handler(req, res) {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'Query parameter "query" is required' });
  }

  // Check if suggestions are already cached
  if (cache[query]) {
    return res.status(200).json({ suggestions: cache[query] });
  }

  const suggestions = await getSuggestions(query);
  
  // Cache the suggestions for future requests
  cache[query] = suggestions;

  res.status(200).json({ suggestions });
}

async function getSuggestions(query) {
  const data = await loadSubreddits();
  const rankedSubreddits = rankSubreddits(query, data);

  return rankedSubreddits.slice(0, 5);
}

async function loadSubreddits() {
  const subreddits = [];

  const rl = readline.createInterface({
    input: fs.createReadStream('subreddits.txt'),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    subreddits.push(line);
  }

  return subreddits;
}

function rankSubreddits(query, subreddits) {
  // Adjust fuzzy search options as needed
  const rankedSubreddits = fuzzysort.go(query.toLowerCase(), subreddits);

  return rankedSubreddits.map(result => result.target);
}

