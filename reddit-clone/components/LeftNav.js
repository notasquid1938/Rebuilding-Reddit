import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SubredditIcon from './SubredditIcon';
import { HomeIcon, CalendarIcon, ChevronDownIcon, ChevronUpIcon, ArchiveIcon, CodeIcon, ExternalIcon } from './Icons';
import { useAvailableMonths, useRecentCommunities } from '@/lib/hooks';
import { isSort } from '@/lib/sorts';
import styles from '@/styles/Layout.module.css';

const Section = ({ title, children }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className={styles.navSection}>
      <button type="button" className={styles.navSectionTitle} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{title}</span>
        {open ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
      </button>
      {open && <ul className={styles.navList}>{children}</ul>}
    </div>
  );
};

const NavItem = ({ href, icon, children, active, external }) => (
  <li>
    {external ? (
      <a href={href} className={styles.navItem} target="_blank" rel="noopener noreferrer">
        {icon}
        <span className={styles.navLabel}>{children}</span>
        <ExternalIcon size={14} className={styles.navExternal} />
      </a>
    ) : (
      <Link href={href} className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}>
        {icon}
        <span className={styles.navLabel}>{children}</span>
      </Link>
    )}
  </li>
);

const LeftNav = ({ open, onClose }) => {
  const router = useRouter();
  const months = useAvailableMonths();
  const recent = useRecentCommunities();
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const { from, to, t } = router.query;
  const onHome = router.pathname === '/';
  // Browsing years keeps the front page's sort
  const sortParam = onHome && isSort(router.query.sort) && router.query.sort !== 'top' ? `&sort=${router.query.sort}` : '';

  return (
    <>
      <div className={`${styles.navBackdrop} ${open ? styles.navBackdropOpen : ''}`} onClick={onClose} />
      <nav className={`${styles.leftNav} ${open ? styles.leftNavOpen : ''}`} aria-label="Primary">
        <ul className={styles.navList}>
          <NavItem href="/" icon={<HomeIcon filled={onHome && !from && !t} />} active={onHome && !from && !t}>
            Home
          </NavItem>
          <NavItem href={`/?t=all${sortParam}`} icon={<ArchiveIcon />} active={onHome && t === 'all'}>
            All time
          </NavItem>
        </ul>
        <hr className={styles.navDivider} />

        {recent.length > 0 && (
          <>
            <Section title="RECENT">
              {recent.map((name) => (
                <NavItem
                  key={name}
                  href={`/r/${encodeURIComponent(name)}`}
                  icon={<SubredditIcon name={name} size={32} />}
                  active={router.pathname === '/r/[name]' && router.query.name?.toLowerCase() === name.toLowerCase()}
                >
                  r/{name}
                </NavItem>
              ))}
            </Section>
            <hr className={styles.navDivider} />
          </>
        )}

        <Section title="EXPLORE BY YEAR">
          {years.map((year) => {
            const yearMonths = months.filter((m) => m.startsWith(year));
            const start = yearMonths[0];
            const end = yearMonths[yearMonths.length - 1];
            return (
              <NavItem
                key={year}
                href={`/?from=${start}&to=${end}${sortParam}`}
                icon={<CalendarIcon />}
                active={onHome && from === start && to === end}
              >
                {year}
              </NavItem>
            );
          })}
        </Section>
        <hr className={styles.navDivider} />

        <Section title="RESOURCES">
          <NavItem href="https://github.com/notasquid1938/Rebuilding-Reddit" icon={<CodeIcon />} external>
            About Reddit Rebuilt
          </NavItem>
          <NavItem href="https://academictorrents.com/details/9c263fc85366c1ef8f5bb9da0203f4c8c8db75f4" icon={<ArchiveIcon />} external>
            Pushshift dumps
          </NavItem>
        </Section>

        <p className={styles.navFooter}>
          An independent archive of public Reddit posts. Not affiliated with Reddit, Inc.
        </p>
      </nav>
    </>
  );
};

export default LeftNav;
