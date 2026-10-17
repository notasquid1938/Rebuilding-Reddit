import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, CalendarIcon } from './Icons';
import { useAvailableMonths } from '@/lib/hooks';
import { monthLabel, MONTHS } from '@/lib/format';
import { SORT_LABELS } from '@/lib/sorts';
import styles from '@/styles/Feed.module.css';

function useDismiss(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);
  return ref;
}

const MonthPicker = ({ label, value, onChange, months }) => {
  const years = useMemo(() => [...new Set(months.map((m) => m.slice(0, 4)))], [months]);
  const [year, month] = value ? value.split('-') : ['', ''];
  const monthsInYear = months.filter((m) => m.startsWith(year)).map((m) => m.slice(5));

  const setYear = (y) => {
    const available = months.filter((m) => m.startsWith(y)).map((m) => m.slice(5));
    onChange(`${y}-${available.includes(month) ? month : available[0]}`);
  };

  return (
    <fieldset className={styles.monthPicker}>
      <legend>{label}</legend>
      <select value={month} onChange={(e) => onChange(`${year}-${e.target.value}`)} aria-label={`${label} month`}>
        {monthsInYear.map((m) => (
          <option key={m} value={m}>
            {MONTHS[parseInt(m, 10) - 1]}
          </option>
        ))}
      </select>
      <select value={year} onChange={(e) => setYear(e.target.value)} aria-label={`${label} year`}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </fieldset>
  );
};

// Reddit-style "Top ▾  All time ▾" controls above a feed.
// range: { from, to } (YYYY-MM) or null for all time.
const FeedControls = ({ sort, sorts = ['top'], onSortChange, range, onRangeChange }) => {
  const months = useAvailableMonths();
  const [sortOpen, setSortOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [draft, setDraft] = useState(range);
  const sortRef = useDismiss(sortOpen, setSortOpen);
  const rangeRef = useDismiss(rangeOpen, setRangeOpen);

  useEffect(() => {
    if (rangeOpen) {
      setDraft(range || (months.length ? { from: months[0], to: months[months.length - 1] } : null));
    }
  }, [rangeOpen, range, months]);

  const rangeText = range
    ? range.from === range.to
      ? monthLabel(range.from)
      : `${monthLabel(range.from)} – ${monthLabel(range.to)}`
    : 'All time';

  const apply = () => {
    if (!draft) return;
    const [from, to] = draft.from <= draft.to ? [draft.from, draft.to] : [draft.to, draft.from];
    onRangeChange({ from, to });
    setRangeOpen(false);
  };

  return (
    <div className={styles.controls}>
      <div className={styles.dropdown} ref={sortRef}>
        <button
          type="button"
          className={styles.controlButton}
          onClick={() => sorts.length > 1 && setSortOpen(!sortOpen)}
          aria-haspopup={sorts.length > 1 ? 'listbox' : undefined}
          aria-expanded={sortOpen}
          disabled={sorts.length < 2}
        >
          <span>{SORT_LABELS[sort]}</span>
          {sorts.length > 1 && <ChevronDownIcon size={16} />}
        </button>
        {sortOpen && (
          <ul className={styles.menu} role="listbox">
            <li className={styles.menuHeading}>Sort by</li>
            {sorts.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  role="option"
                  aria-selected={s === sort}
                  className={`${styles.menuItem} ${s === sort ? styles.menuItemActive : ''}`}
                  onClick={() => {
                    onSortChange(s);
                    setSortOpen(false);
                  }}
                >
                  {SORT_LABELS[s]}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {onRangeChange && (
        <div className={styles.dropdown} ref={rangeRef}>
          <button type="button" className={styles.controlButton} onClick={() => setRangeOpen(!rangeOpen)} aria-expanded={rangeOpen}>
            <CalendarIcon size={16} />
            <span>{rangeText}</span>
            <ChevronDownIcon size={16} />
          </button>
          {rangeOpen && (
            <div className={`${styles.menu} ${styles.rangeMenu}`}>
              <p className={styles.menuHeading}>Show posts from</p>
              <button
                type="button"
                className={`${styles.menuItem} ${!range ? styles.menuItemActive : ''}`}
                onClick={() => {
                  onRangeChange(null);
                  setRangeOpen(false);
                }}
              >
                All time
              </button>
              {draft && months.length > 0 && (
                <div className={styles.rangeForm}>
                  <MonthPicker label="From" value={draft.from} months={months} onChange={(from) => setDraft({ ...draft, from })} />
                  <MonthPicker label="To" value={draft.to} months={months} onChange={(to) => setDraft({ ...draft, to })} />
                  <button type="button" className={styles.applyButton} onClick={apply}>
                    Apply
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FeedControls;
