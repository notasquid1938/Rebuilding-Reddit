import { useEffect, useState } from 'react';
import Link from 'next/link';
import SubredditIcon from './SubredditIcon';
import { useAvailableMonths } from '@/lib/hooks';
import Markdown from './Markdown';
import { formatCount, monthLabel, fullDate, decodeEntities } from '@/lib/format';
import styles from '@/styles/Sidebar.module.css';

export const SidebarCard = ({ title, children }) => (
  <section className={styles.card}>
    {title && <h2 className={styles.cardTitle}>{title}</h2>}
    {children}
  </section>
);

const Stat = ({ value, label }) => (
  <div className={styles.stat}>
    <span className={styles.statValue}>{value}</span>
    <span className={styles.statLabel}>{label}</span>
  </div>
);

export const AboutArchiveCard = () => {
  const months = useAvailableMonths();
  return (
    <SidebarCard title="About Reddit Rebuilt">
      <p className={styles.text}>
        An archive of Reddit&apos;s history, rebuilt from the Pushshift dumps. Browse the top posts of any month since
        Reddit launched, explore old communities and look back at what people were talking about.
      </p>
      {months.length > 0 && (
        <div className={styles.stats}>
          <Stat value={monthLabel(months[0])} label="Oldest month" />
          <Stat value={monthLabel(months[months.length - 1])} label="Newest month" />
        </div>
      )}
    </SidebarCard>
  );
};

export const TopCommunitiesCard = ({ from, to, title = 'Top communities', exclude }) => {
  const [communities, setCommunities] = useState(null);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (from) params.set('startDate', from);
    if (to) params.set('endDate', to);
    fetch(`/api/TopCommunities?${params}`)
      .then((r) => (r.ok ? r.json() : { communities: [] }))
      .then((data) => active && setCommunities((data.communities || []).filter((c) => c.name !== exclude)))
      .catch(() => active && setCommunities([]));
    return () => {
      active = false;
    };
  }, [from, to, exclude]);

  if (communities && communities.length === 0) return null;
  return (
    <SidebarCard title={title}>
      <ol className={styles.communityList}>
        {(communities || Array.from({ length: 5 }, (_, i) => ({ name: null, key: i }))).map((c, i) => (
          <li key={c.name || c.key}>
            {c.name ? (
              <Link href={`/r/${c.name}`} className={styles.communityItem}>
                <span className={styles.rank}>{i + 1}</span>
                <SubredditIcon name={c.name} size={32} />
                <span className={styles.communityText}>
                  <span className={styles.communityName}>r/{c.name}</span>
                  <span className={styles.communityMeta}>{formatCount(c.posts)} posts</span>
                </span>
              </Link>
            ) : (
              <div className={`${styles.communityItem} ${styles.placeholder}`} />
            )}
          </li>
        ))}
      </ol>
    </SidebarCard>
  );
};

const CommunitySidebarText = ({ text }) => {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 600;
  return (
    <div className={styles.sidebarText}>
      <div className={expanded || !long ? undefined : styles.clamped}>
        <Markdown>{text}</Markdown>
      </div>
      {long && (
        <button type="button" className={styles.linkButton} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
};

export const CommunityCard = ({ name, info, showLink = false, showSidebar = false }) => {
  const about = info?.about;
  return (
    <SidebarCard>
      <div className={styles.communityHeader}>
        <SubredditIcon name={name} size={40} />
        <div className={styles.communityText}>
          <h2 className={styles.communityTitle}>{about?.title ? decodeEntities(about.title) : `r/${name}`}</h2>
          {about?.title && <span className={styles.communityMeta}>r/{name}</span>}
        </div>
      </div>
      {about?.unavailable && (
        <p className={styles.notice}>This community was banned or made private before it could be archived in full.</p>
      )}
      <p className={styles.text}>
        {about?.publicDescription
          ? decodeEntities(about.publicDescription)
          : `Archived posts from r/${name}${info?.firstMonth ? `, ${monthLabel(info.firstMonth)} to ${monthLabel(info.lastMonth)}` : ''}.`}
      </p>
      {about?.createdUtc && (
        <p className={styles.textSmall}>
          Created {new Date(about.createdUtc * 1000).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' })}
          {about.over18 ? ' · NSFW' : ''}
          {about.type && about.type !== 'public' ? ` · ${about.type}` : ''}
        </p>
      )}
      {info && (
        <div className={styles.stats}>
          {about?.subscribers != null && <Stat value={formatCount(about.subscribers)} label="Members (last snapshot)" />}
          <Stat value={formatCount(info.posts)} label="Archived posts" />
          {!(about?.subscribers != null) && <Stat value={info.months} label="Active months" />}
        </div>
      )}
      {showSidebar && about?.description && <CommunitySidebarText text={about.description} />}
      {showLink && (
        <Link href={`/r/${name}`} className={styles.primaryButton}>
          View community
        </Link>
      )}
    </SidebarCard>
  );
};

export const UserCard = ({ name }) => {
  const [stats, setStats] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setStats(null);
    setFailed(false);
    fetch(`/api/User?name=${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => active && setStats(data))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [name]);

  return (
    <SidebarCard>
      <h2 className={styles.cardHeading}>u/{name}</h2>
      {stats ? (
        <>
          <div className={styles.stats}>
            <Stat value={formatCount(stats.karma)} label="Post karma" />
            <Stat value={formatCount(stats.posts)} label="Archived posts" />
          </div>
          {stats.firstPost && (
            <div className={styles.stats}>
              <Stat value={fullDate(stats.firstPost).split(',').slice(0, 2).join(',')} label="First post" />
              <Stat value={fullDate(stats.lastPost).split(',').slice(0, 2).join(',')} label="Latest post" />
            </div>
          )}
        </>
      ) : failed ? (
        <p className={styles.text}>Stats aren&apos;t available for this account.</p>
      ) : (
        <div className={styles.stats}>
          <div className={`${styles.stat} ${styles.placeholder}`} />
          <div className={`${styles.stat} ${styles.placeholder}`} />
        </div>
      )}
    </SidebarCard>
  );
};

export const SidebarFooter = () => (
  <p className={styles.footer}>
    Reddit Rebuilt is an independent, non-commercial archive and is not affiliated with Reddit, Inc. Content belongs to
    its original authors.
  </p>
);
