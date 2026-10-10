import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import Feed from '@/components/Feed';
import FeedControls from '@/components/FeedControls';
import SubredditIcon from '@/components/SubredditIcon';
import { CommunityCard, TopCommunitiesCard, SidebarFooter } from '@/components/Sidebar';
import { addRecentCommunity } from '@/lib/hooks';
import { formatCount, monthLabel } from '@/lib/format';
import { rangeFromQuery, rangeToQuery } from '@/lib/range';
import { SITE_NAME } from '@/lib/site';
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

const CommunityBanner = ({ name, info }) => (
  <div className={styles.bannerWrap}>
    <div className={styles.banner} />
    <div className={styles.headerRow}>
      <SubredditIcon name={name} size={88} className={styles.bigIcon} />
      <div className={styles.headerText}>
        <h1 className={styles.headerTitle}>r/{name}</h1>
        {info && (
          <p className={styles.headerSub}>
            {formatCount(info.posts)} archived posts · {monthLabel(info.firstMonth)} – {monthLabel(info.lastMonth)}
          </p>
        )}
      </div>
    </div>
  </div>
);

function CommunityPage({ name, info }) {
  const router = useRouter();
  const range = rangeFromQuery(router.query, null);
  const feedQuery = { subreddit: name, startDate: range?.from, endDate: range?.to, sort: 'top' };

  useEffect(() => {
    if (info) addRecentCommunity(name);
  }, [name, info]);

  const setRange = (next) => {
    const query = { name, ...(next ? rangeToQuery(next) : {}) };
    router.push({ pathname: '/r/[name]', query }, undefined, { shallow: true });
  };

  return (
    <Layout
      banner={<CommunityBanner name={name} info={info} />}
      sidebar={
        <>
          <CommunityCard name={name} info={info} />
          <TopCommunitiesCard from={range?.from} to={range?.to} title="Other communities" exclude={name} />
          <SidebarFooter />
        </>
      }
    >
      <Head>
        <title>{`r/${name} - ${SITE_NAME}`}</title>
        <meta name="description" content={`Archived top posts from r/${name}, rebuilt from Reddit's history.`} />
        <meta property="og:title" content={`r/${name}`} />
      </Head>

      <FeedControls sort="top" range={range} onRangeChange={setRange} />
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
