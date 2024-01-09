// Timeline.js

import React, { useState, useEffect } from 'react';
import styles from '../styles/Timeline.module.css';

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
          // Sort the collections in ascending order before setting the state
          const sortedCollections = data.collections.sort();
          setAvailableCollections(sortedCollections);
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
    <div className={styles.timelineContainer}>
      <label className={styles.label} htmlFor="start">Start Date:</label>
      <div className={styles.selectContainer}>
        <select
          id="start"
          className={styles.select}
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
        {isDropdownOpened && (
          <div className={styles.dropdownList}>
            {availableCollections.map((collection) => (
              <div key={collection} className={styles.option} onClick={() => setStartDate(collection)}>
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
        {isDropdownOpened && (
          <div className={styles.dropdownList}>
            {availableCollections.map((collection) => (
              <div key={collection} className={styles.option} onClick={() => setEndDate(collection)}>
                {collection}
              </div>
            ))}
          </div>
        )}
      </div>

      {startDate && endDate && (
        <div className={styles.selectedRange}>
          <p>Selected Range: {startDate} to {endDate}</p>
          {/* Add your timeline rendering logic here */}
        </div>
      )}
    </div>
  );
};

export default Timeline;
