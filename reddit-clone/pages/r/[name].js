import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import Feed from '@/components/Feed';
import FeedControls from '@/components/FeedControls';
import SubredditIcon from '@/components/SubredditIcon';
import HistoryChart from '@/components/HistoryChart';
import { ShuffleIcon } from '@/components/Icons';
import { CommunityCard, TopCommunitiesCard, SidebarFooter } from '@/components/Sidebar';
import { addRecentCommunity } from '@/lib/hooks';
import { formatCount, monthLabel } from '@/lib/format';
import { rangeFromQuery, rangeToQuery } from '@/lib/range';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { FEED_SORTS, sortFromQuery, withSort } from '@/lib/sorts';
import styles from '@/styles/Profile.module.css';

export async function getServerSideProps({ params, res }) {
  const { getSubredditInfo, SUBREDDIT_RE } = await import('@/lib/submissions');
  const name = params.name;
  if (!SUBREDDIT_RE.test(name)) return { notFound: true };

  let info = null;
  try {
    info = await getSubredditInfo(name);
  } catch (error) {
    console.error('Error loading subreddit info:', error.message);
  }
  // Canonicalise the casing (/r/askreddit -> /r/AskReddit)
  if (info && info.name !== name) {
    return { redirect: { destination: `/r/${encodeURIComponent(info.name)}`, permanent: true } };
  }
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  return { props: { name: info?.name || name, info } };
}

const CommunityBanner = ({ name, info }) => {
  const [bannerFailed, setBannerFailed] = useState(false);
  const about = info?.about;
  const color = about?.color && /^#[0-9a-f]{3,8}$/i.test(about.color) ? about.color : null;
  return (
    <div className={styles.bannerWrap}>
      <div className={styles.banner} style={color ? { background: color } : undefined}>
        {about?.bannerUrl && !bannerFailed && (
          <img
            src={about.bannerUrl}
            alt=""
            className={styles.bannerImage}
            referrerPolicy="no-referrer"
            onError={() => setBannerFailed(true)}
          />
        )}
      </div>
      <div className={styles.headerRow}>
        <SubredditIcon name={name} size={88} className={styles.bigIcon} />
        <div className={styles.headerText}>
          <h1 className={styles.headerTitle}>r/{name}</h1>
          {info?.posts > 0 && (
            <p className={styles.headerSub}>
              {formatCount(info.posts)} archived posts · {monthLabel(info.firstMonth)} – {monthLabel(info.lastMonth)}
            </p>
          )}
        </div>
        {info?.posts > 0 && (
          <Link href={`/random?subreddit=${encodeURIComponent(name)}`} className={styles.headerAction}>
            <ShuffleIcon size={16} />
            Random post
          </Link>
        )}
      </div>
    </div>
  );
};

function CommunityPage({ name, info }) {
  const router = useRouter();
  const range = rangeFromQuery(router.query, null);
  const sort = sortFromQuery(router.query, 'top');
  const feedQuery = { subreddit: name, startDate: range?.from, endDate: range?.to, sort };

  useEffect(() => {
    if (info?.posts) addRecentCommunity(name);
  }, [name, info]);

  const setRange = (next) => {
    const query = withSort({ name, ...(next ? rangeToQuery(next) : {}) }, sort, 'top');
    router.push({ pathname: '/r/[name]', query }, undefined, { shallow: true });
  };

  const setSort = (next) => {
    router.push({ pathname: '/r/[name]', query: withSort(router.query, next, 'top') }, undefined, { shallow: true });
  };

  return (
    <Layout
      banner={<CommunityBanner name={name} info={info} />}
      sidebar={
        <>
          <CommunityCard name={name} info={info} showSidebar />
          {info?.posts > 0 && <HistoryChart name={name} range={range} onSelect={(month) => setRange({ from: month, to: month })} />}
          <TopCommunitiesCard from={range?.from} to={range?.to} title="Other communities" exclude={name} />
          <SidebarFooter />
        </>
      }
    >
      <Head>
        <title>{`r/${name} - ${SITE_NAME}`}</title>
        <meta
          name="description"
          content={info?.about?.publicDescription || `Archived top posts from r/${name}, rebuilt from Reddit's history.`}
        />
        <meta property="og:title" content={`r/${name}`} />
        <link rel="canonical" href={`${SITE_URL}/r/${encodeURIComponent(name)}`} />
      </Head>

      <FeedControls sort={sort} sorts={FEED_SORTS} onSortChange={setSort} range={range} onRangeChange={setRange} />
      <hr />
      <Feed
        key={JSON.stringify(feedQuery)}
        query={feedQuery}
        context="subreddit"
        emptyMessage={
          info
            ? `r/${name} has no archived posts in this period.`
            : `There are no archived posts for r/${name}. Check the spelling, or try searching for it.`
        }
      />
    </Layout>
  );
}

export default CommunityPage;
