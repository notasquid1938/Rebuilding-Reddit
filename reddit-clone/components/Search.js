import React, { useState, useEffect } from 'react';
import styles from '../styles/Search.module.css';
import SearchInput from './Search/SearchInput';
import DateSelector from './Search/DateSelector';
import SubmitButton from './Search/SubmitButton';

const Search = ({ onDateRangeChange, onSubredditChange}) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [subreddit, setSubreddit] = useState(''); 
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
    setSubreddit(inputValue);

    // Check if the input has text before making the API request
    if (inputValue.trim() === '') {
      setSuggestions([]);
      setSubreddit('all')
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
    onSubredditChange(subreddit);
    setFormSubmitted(true);
  };

  return (
    <div className={styles.searchContainer}>
      <SearchInput
        value={query}
        onChange={handleInputChange}
        suggestions={suggestions}
        onSuggestionClick={handleSuggestionClick}
      />
      
      <form className={styles.formContainer} onSubmit={handleSubmit}>
        <DateSelector
          label="Start Date"
          value={startDate}
          onChange={(date) => handleDateChange(date, 'start')}
          isOpen={isStartDropdownOpened}
          onFocus={() => setIsStartDropdownOpened(true)}
          onBlur={() => setIsStartDropdownOpened(false)}
          options={availableCollections}
        />

        <DateSelector
          label="End Date"
          value={endDate}
          onChange={(date) => handleDateChange(date, 'end')}
          isOpen={isEndDropdownOpened}
          onFocus={() => setIsEndDropdownOpened(true)}
          onBlur={() => setIsEndDropdownOpened(false)}
          options={availableCollections}
        />

        <SubmitButton onSubmit={handleSubmit} />
      </form>
    </div>
  );
}

export default Search;