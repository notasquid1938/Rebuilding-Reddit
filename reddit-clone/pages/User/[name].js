import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import Feed, { PAGE_SIZE } from '@/components/Feed';
import FeedControls from '@/components/FeedControls';
import UserAvatar from '@/components/UserAvatar';
import { UserCard, SidebarFooter } from '@/components/Sidebar';
import { PostSkeleton } from '@/components/PostCard';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { USER_SORTS, sortFromQuery, withSort } from '@/lib/sorts';
import styles from '@/styles/Profile.module.css';

const AUTHOR_RE = /^[A-Za-z0-9_-]{1,64}$/;

const feedQueryFor = (name, query) => ({ author: name, sort: sortFromQuery(query, 'new', USER_SORTS) });

// Rendered on the server so the title, canonical link and first page of posts
// are in the HTML
export async function getServerSideProps({ params, query, res }) {
  const { firstFeedPage } = await import('@/lib/submissions');
  const name = params.name;
  const firstPage = AUTHOR_RE.test(name) ? await firstFeedPage(feedQueryFor(name, query), PAGE_SIZE) : null;
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  return { props: { firstPage } };
}

function UserPage({ firstPage }) {
  const router = useRouter();
  const { name } = router.query;
  const sort = sortFromQuery(router.query, 'new', USER_SORTS);
  const valid = typeof name === 'string' && AUTHOR_RE.test(name);
  const feedQuery = feedQueryFor(name, router.query);

  const setSort = (next) => {
    router.push({ pathname: '/User/[name]', query: withSort({ name }, next, 'new') }, undefined, { shallow: true });
  };

  return (
    <Layout sidebar={valid && <><UserCard name={name} /><SidebarFooter /></>}>
      <Head>
        <title>{name ? `u/${name} - ${SITE_NAME}` : SITE_NAME}</title>
        {name && <meta name="description" content={`Archive of posts by u/${name}`} />}
        {valid && <link rel="canonical" href={`${SITE_URL}/User/${name}`} />}
      </Head>

      {!router.isReady ? (
        <PostSkeleton />
      ) : !valid ? (
        <p className={styles.notice}>That isn&apos;t a valid Reddit username.</p>
      ) : (
        <>
          <div className={styles.userHeader}>
            <UserAvatar name={name} size={72} />
            <div className={styles.headerText}>
              <h1 className={styles.headerTitle}>{name}</h1>
              <p className={styles.headerSub}>u/{name}</p>
            </div>
          </div>

          <nav className={styles.tabs} aria-label="Profile sections">
            <span className={`${styles.tab} ${styles.tabActive}`} aria-current="page">
              Posts
            </span>
            <span className={`${styles.tab} ${styles.tabDisabled}`} title="Browsing a user's comments isn't supported yet">
              Comments
            </span>
          </nav>

          <FeedControls sort={sort} sorts={USER_SORTS} onSortChange={setSort} />
          <hr />
          <Feed
            key={JSON.stringify(feedQuery)}
            query={feedQuery}
            initial={firstPage?.key === JSON.stringify(feedQuery) ? firstPage : null}
            context="user"
            emptyMessage={`u/${name} has no archived posts.`}
          />
        </>
      )}
    </Layout>
  );
}

export default UserPage;
