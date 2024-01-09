import React, { useState, useEffect } from 'react';

const Timeline = () => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [availableCollections, setAvailableCollections] = useState([]);
  const [isDropdownOpened, setIsDropdownOpened] = useState(false);

  useEffect(() => {
    // Fetch available collections from the API when either dropdown is opened
    if (isDropdownOpened) {
      fetch('/api/AvailableDates')
        .then(response => response.json())
        .then(data => {
          setAvailableCollections(data.collections);
        })
        .catch(error => console.error('Error fetching available dates:', error));
    }
  }, [isDropdownOpened]);

  const handleDateChange = (event, type) => {
    const selectedDate = event.target.value;

    if (type === 'start') {
      setStartDate(selectedDate);
    } else if (type === 'end') {
      setEndDate(selectedDate);
    }
  };

  return (
    <div>
      <label htmlFor="start">Start Date:</label>
      <select
        id="start"
        onChange={(e) => handleDateChange(e, 'start')}
        value={startDate}
        onFocus={() => setIsDropdownOpened(true)}
        onBlur={() => setIsDropdownOpened(false)}
      >
        <option value="">Select Start Date</option>
        {availableCollections.map((collection) => (
          <option key={collection} value={collection}>
            {collection}
          </option>
        ))}
      </select>

      <label htmlFor="end">End Date:</label>
      <select
        id="end"
        onChange={(e) => handleDateChange(e, 'end')}
        value={endDate}
        onFocus={() => setIsDropdownOpened(true)}
        onBlur={() => setIsDropdownOpened(false)}
      >
        <option value="">Select End Date</option>
        {availableCollections.map((collection) => (
          <option key={collection} value={collection}>
            {collection}
          </option>
        ))}
      </select>

      {startDate && endDate && (
        <div>
          <p>Selected Range: {startDate} to {endDate}</p>
          {/* Add your timeline rendering logic here */}
        </div>
      )}
    </div>
  );
};

export default Timeline;
