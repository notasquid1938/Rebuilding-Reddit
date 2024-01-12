import React, { useState, useEffect } from 'react';
import styles from '../styles/Search.module.css';

const Search = ({ onDateRangeChange }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [availableCollections, setAvailableCollections] = useState([]);
  const [isStartDropdownOpened, setIsStartDropdownOpened] = useState(false);
  const [isEndDropdownOpened, setIsEndDropdownOpened] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (isStartDropdownOpened || isEndDropdownOpened || formSubmitted) {
      fetch('/api/AvailableDates')
        .then(response => response.json())
        .then(data => {
          const sortedCollections = data.collections.sort();
          setAvailableCollections(sortedCollections);
        })
        .catch(error => console.error('Error fetching available dates:', error));
    }
  }, [isStartDropdownOpened, isEndDropdownOpened, formSubmitted]);

  useEffect(() => {
    const fetchData = async () => {
      if (startDate && endDate && formSubmitted) {
        try {
          const response = await fetch(`/api/Posts?startDate=${startDate}&endDate=${endDate}`);
          const data = await response.json();
          console.log('Posts API response:', data);
        } catch (error) {
          console.error('Error fetching posts:', error);
        }
      }
    };

    fetchData();
  }, [startDate, endDate, formSubmitted]);

  const handleDateChange = (selectedDate, type) => {
    if (type === 'start') {
      setStartDate(selectedDate);
      setIsStartDropdownOpened(false);
    } else if (type === 'end') {
      setEndDate(selectedDate);
      setIsEndDropdownOpened(false);
    }
  };

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

  const handleSubmit = (e) => {
    e.preventDefault();
    onDateRangeChange(startDate, endDate);
    setFormSubmitted(true);
  };

  return (
    <div className={styles.searchContainer}>
      <form className={styles.formContainer} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor="start">Start Date:</label>
        <div className={styles.selectContainer}>
          <select
            id="start"
            className={styles.select}
            onChange={(e) => handleDateChange(e.target.value, 'start')}
            value={startDate}
            onFocus={() => setIsStartDropdownOpened(true)}
            onBlur={() => setIsStartDropdownOpened(false)}
          >
            <option value="">Select Start Date</option>
            {availableCollections.map((collection) => (
              <option key={collection} value={collection}>
                {collection}
              </option>
            ))}
          </select>
          {isStartDropdownOpened && (
            <div className={styles.dropdownList}>
              {availableCollections.map((collection) => (
                <div key={collection} className={styles.option} onClick={() => handleDateChange(collection, 'start')}>
                  {collection}
                </div>
              ))}
            </div>
          )}
        </div>
  
        <label className={styles.label} htmlFor="end">End Date:</label>
        <div className={styles.selectContainer}>
          <select
            id="end"
            className={styles.select}
            onChange={(e) => handleDateChange(e.target.value, 'end')}
            value={endDate}
            onFocus={() => setIsEndDropdownOpened(true)}
            onBlur={() => setIsEndDropdownOpened(false)}
          >
            <option value="">Select End Date</option>
            {availableCollections.map((collection) => (
              <option key={collection} value={collection}>
                {collection}
              </option>
            ))}
          </select>
          {isEndDropdownOpened && (
            <div className={styles.dropdownList}>
              {availableCollections.map((collection) => (
                <div key={collection} className={styles.option} onClick={() => handleDateChange(collection, 'end')}>
                  {collection}
                </div>
              ))}
            </div>
          )}
        </div>
        <button type="submit">Submit</button>
      </form>
  
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
    </div>
  );  
}

export default Search;
