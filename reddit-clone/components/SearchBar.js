// SearchBar.js
import { useState } from 'react';
import styles from '../styles/SearchBar.module.css';

const SearchBar = () => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  const handleInputChange = async (e) => {
    const inputValue = e.target.value;
    setQuery(inputValue);

    // Check if the input has text before making the API request
    if (inputValue.trim() === '') {
      setSuggestions([]);
      return;
    }

    const response = await fetch(`/api/SearchSuggestions?query=${inputValue}`);
    const data = await response.json();

    setSuggestions(data.suggestions);
  };

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion);
    setSuggestions([]);
  };

  return (
    <div className={styles.inputContainer}>
      <span className={styles.subredditPrefix}>r/</span>
      <input
        type="text"
        placeholder="Search for a subreddit..."
        value={query}
        onChange={handleInputChange}
      />
      {suggestions.length > 0 && (
        <ul className={styles.inputSuggestions}>
          {suggestions.map((suggestion, index) => (
            <li className={styles.suggestion} key={index}>
              <button
                className={styles.suggestionButton}
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchBar;
