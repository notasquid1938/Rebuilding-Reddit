import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import Feed from '@/components/Feed';
import FeedControls from '@/components/FeedControls';
import UserAvatar from '@/components/UserAvatar';
import { UserCard, SidebarFooter } from '@/components/Sidebar';
import { PostSkeleton } from '@/components/PostCard';
import { SITE_NAME } from '@/lib/site';
import { USER_SORTS, sortFromQuery, withSort } from '@/lib/sorts';
import styles from '@/styles/Profile.module.css';

const AUTHOR_RE = /^[A-Za-z0-9_-]{1,64}$/;

function UserPage() {
  const router = useRouter();
  const { name } = router.query;
  const sort = sortFromQuery(router.query, 'new', USER_SORTS);
  const valid = typeof name === 'string' && AUTHOR_RE.test(name);
  const feedQuery = { author: name, sort };

  const setSort = (next) => {
    router.push({ pathname: '/User/[name]', query: withSort({ name }, next, 'new') }, undefined, { shallow: true });
  };

  return (
    <Layout sidebar={valid && <><UserCard name={name} /><SidebarFooter /></>}>
      <Head>
        <title>{name ? `u/${name} - ${SITE_NAME}` : SITE_NAME}</title>
        {name && <meta name="description" content={`Archive of posts by u/${name}`} />}
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
            <span className={`${styles.tab} ${styles.tabDisabled}`} title="Comments haven't been archived yet">
              Comments
            </span>
          </nav>

          <FeedControls sort={sort} sorts={USER_SORTS} onSortChange={setSort} />
          <hr />
          <Feed
            key={JSON.stringify(feedQuery)}
            query={feedQuery}
            context="user"
            emptyMessage={`u/${name} has no archived posts.`}
          />
        </>
      )}
    </Layout>
  );
}

export default UserPage;
