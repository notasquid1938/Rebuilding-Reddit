import React, { useState } from 'react';
import styles from '../../styles/Search.module.css';

const DateSelector = ({ label, value, onChange, isOpen, onFocus, onBlur, options }) => {
  return (
    <div className={styles.selectContainer}>
      <label className={styles.label}>{label}</label>
      <select
        className={styles.select}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <option value="">Select {label}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {isOpen && (
        <div className={styles.dropdownList}>
          {options.map((option) => (
            <div key={option} className={styles.option} onClick={() => onChange(option)}>
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DateSelector;
