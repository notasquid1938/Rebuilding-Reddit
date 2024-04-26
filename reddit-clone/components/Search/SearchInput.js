import React, { useState } from 'react';
import styles from '../../styles/Search.module.css';

const SearchInput = ({ value, onChange, suggestions, onSuggestionClick }) => {
  return (
    <div className={styles.inputContainer}>
      <span className={styles.subredditPrefix}>r/</span>
      <input
        type="text"
        placeholder="Search for a subreddit..."
        value={value}
        onChange={onChange}
      />
      {suggestions.length > 0 && (
        <ul className={styles.inputSuggestions}>
          {suggestions.map((suggestion, index) => (
            <li className={styles.suggestion} key={index}>
              <button
                className={styles.suggestionButton}
                onClick={() => onSuggestionClick(suggestion)}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SearchInput;
