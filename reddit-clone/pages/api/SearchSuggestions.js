import csv from 'csv-parser';
import fs from 'fs';
import fuzzysort from 'fuzzysort';

export default async function handler(req, res) {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'Query parameter "query" is required' });
  }

  const suggestions = await getSuggestions(query);
  res.status(200).json({ suggestions });
}

async function getSuggestions(query) {
  const data = await loadSubreddits();
  const rankedSubreddits = rankSubreddits(query, data);

  return rankedSubreddits.slice(0, 5);
}

async function loadSubreddits() {
  const subreddits = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream('subreddits.csv')
      .pipe(csv({ headers: false }))
      .on('data', row => {
        subreddits.push(row[0]);
      })
      .on('end', () => {
        resolve(subreddits);
      })
      .on('error', reject);
  });
}

function rankSubreddits(query, subreddits) {
  const rankedSubreddits = fuzzysort.go(query.toLowerCase(), subreddits, { key: 0 });
  return rankedSubreddits.map(result => result.target);
}