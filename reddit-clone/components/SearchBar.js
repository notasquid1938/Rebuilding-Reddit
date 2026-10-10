import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import SubredditIcon from './SubredditIcon';
import { SearchIcon, CloseIcon } from './Icons';
import { formatCount } from '@/lib/format';
import styles from '@/styles/Layout.module.css';

const SearchBar = () => {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Debounced suggestion lookup
  useEffect(() => {
    const trimmed = query.trim().replace(/^\/?r\//i, '');
    if (!trimmed || !/^[A-Za-z0-9_.]+$/.test(trimmed)) {
      setSuggestions([]);
      return;
    }
    let isActive = true;
    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(`/api/SearchSuggestions?query=${encodeURIComponent(trimmed)}`);
        if (isActive && response.ok) {
          const data = await response.json();
          setSuggestions(data.suggestions || []);
          setActive(-1);
        }
      } catch {
        if (isActive) setSuggestions([]);
      }
    }, 150);
    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    const close = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = (name) => {
    if (!name) return;
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    router.push(`/r/${encodeURIComponent(name)}`);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const typed = query.trim().replace(/^\/?r\//i, '');
      go(active >= 0 ? suggestions[active].name : suggestions[0]?.name || typed);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showDropdown = open && query.trim() !== '';

  return (
    <div className={styles.search} ref={containerRef}>
      <label className={`${styles.searchField} ${showDropdown ? styles.searchFieldOpen : ''}`}>
        <SearchIcon size={20} className={styles.searchIcon} />
        <span className="visually-hidden">Search communities</span>
        <input
          ref={inputRef}
          type="search"
          placeholder="Search communities"
          autoComplete="off"
          spellCheck="false"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="search-suggestions"
          aria-activedescendant={active >= 0 ? `suggestion-${active}` : undefined}
        />
        {query && (
          <button type="button" className={styles.searchClear} onClick={() => setQuery('')} aria-label="Clear search">
            <CloseIcon size={14} />
          </button>
        )}
      </label>

      {showDropdown && (
        <ul className={styles.searchDropdown} id="search-suggestions" role="listbox">
          {suggestions.length === 0 ? (
            <li className={styles.searchEmpty}>
              Press Enter to open r/{query.trim().replace(/^\/?r\//i, '')}
            </li>
          ) : (
            <>
              <li className={styles.searchHeading}>Communities</li>
              {suggestions.map((s, index) => (
                <li key={s.name} id={`suggestion-${index}`} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    className={`${styles.suggestion} ${index === active ? styles.suggestionActive : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(s.name)}
                  >
                    <SubredditIcon name={s.name} size={32} />
                    <span className={styles.suggestionText}>
                      <span className={styles.suggestionName}>r/{s.name}</span>
                      {s.posts != null && (
                        <span className={styles.suggestionMeta}>{formatCount(s.posts)} archived posts</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </>
          )}
        </ul>
      )}
    </div>
  );
};

export default SearchBar;
