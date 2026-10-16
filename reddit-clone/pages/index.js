import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import Feed from '@/components/Feed';
import FeedControls from '@/components/FeedControls';
import { PostSkeleton } from '@/components/PostCard';
import { AboutArchiveCard, TopCommunitiesCard, SidebarFooter } from '@/components/Sidebar';
import { DEFAULT_RANGE, SITE_NAME } from '@/lib/site';
import { monthLabel } from '@/lib/format';
import { rangeFromQuery, rangeToQuery } from '@/lib/range';
import { FEED_SORTS, sortFromQuery, withSort } from '@/lib/sorts';

function HomePage() {
  const router = useRouter();
  const range = router.isReady ? rangeFromQuery(router.query, DEFAULT_RANGE) : DEFAULT_RANGE;
  const sort = router.isReady ? sortFromQuery(router.query, 'top') : 'top';
  const feedQuery = { startDate: range?.from, endDate: range?.to, sort };
  const rangeTitle = range ? `${monthLabel(range.from)} – ${monthLabel(range.to)}` : 'All time';

  return (
    <Layout
      sidebar={
        <>
          <AboutArchiveCard />
          <TopCommunitiesCard from={range?.from} to={range?.to} title={`Top communities · ${rangeTitle}`} />
          <SidebarFooter />
        </>
      }
    >
      <Head>
        <title>{`${SITE_NAME} - Dive into Reddit's history`}</title>
        <meta name="description" content="A website for archiving and exploring old Reddit posts from 2005 onwards" />
        <meta property="og:title" content={SITE_NAME} />
        <meta property="og:description" content="Browse the top Reddit posts of any month since 2005." />
      </Head>

      <FeedControls
        sort={sort}
        sorts={FEED_SORTS}
        onSortChange={(next) => router.push({ pathname: '/', query: withSort(router.query, next, 'top') })}
        range={range}
        onRangeChange={(next) => router.push({ pathname: '/', query: withSort(rangeToQuery(next), sort, 'top') })}
      />
      <hr />
      {router.isReady ? (
        <Feed key={JSON.stringify(feedQuery)} query={feedQuery} />
      ) : (
        <PostSkeleton />
      )}
    </Layout>
  );
}

export default HomePage;
