import { useState } from 'react';

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

    // Make a request to the Suggestions API
    const response = await fetch(`/api/Suggestions?query=${inputValue}`);
    const data = await response.json();

    setSuggestions(data.suggestions);
  };

  return (
    <div>
      <input
        type="text"
        placeholder="Search for a subreddit..."
        value={query}
        onChange={handleInputChange}
      />
      <ul>
        {suggestions.map((suggestion, index) => (
          <li key={index}>{suggestion}</li>
        ))}
      </ul>
    </div>
  );
};

export default SearchBar;
