import Link from 'next/link';
import SearchBar from './SearchBar';
import { MenuIcon, MoonIcon, SunIcon, CodeIcon } from './Icons';
import { useTheme } from '@/lib/hooks';
import styles from '@/styles/Layout.module.css';

export const Logo = () => (
  <Link href="/" className={styles.logo} aria-label="Reddit Rebuilt home">
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="var(--brand)" />
      <path
        fill="#fff"
        d="M16 7.25a8.75 8.75 0 1 0 8.75 8.75h-2.1A6.65 6.65 0 1 1 16 9.35V12l4.2-3.85L16 4.3v2.95Zm-1.05 4.5v5.12l4.13 2.48 1.07-1.8-3.1-1.85v-3.95h-2.1Z"
      />
    </svg>
    <span className={styles.logoText}>
      reddit<span className={styles.logoAccent}>rebuilt</span>
    </span>
  </Link>
);

const Header = ({ onToggleNav }) => {
  const [theme, toggleTheme] = useTheme();

  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <button type="button" className={`${styles.iconButton} ${styles.menuButton}`} onClick={onToggleNav} aria-label="Open navigation">
          <MenuIcon />
        </button>
        <Logo />
      </div>

      <div className={styles.headerCenter}>
        <SearchBar />
      </div>

      <div className={styles.headerRight}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <a
          className={styles.headerPill}
          href="https://github.com/notasquid1938/Rebuilding-Reddit"
          target="_blank"
          rel="noopener noreferrer"
        >
          <CodeIcon size={18} />
          <span>Source</span>
        </a>
      </div>
    </header>
  );
};

export default Header;
