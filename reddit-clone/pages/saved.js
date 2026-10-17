import Head from 'next/head';
import Layout from '@/components/Layout';
import PostCard from '@/components/PostCard';
import { SidebarCard, SidebarFooter } from '@/components/Sidebar';
import { useSavedPosts } from '@/lib/hooks';
import { SITE_NAME } from '@/lib/site';
import feedStyles from '@/styles/Feed.module.css';
import sidebarStyles from '@/styles/Sidebar.module.css';

function SavedPage() {
  const posts = useSavedPosts();

  return (
    <Layout
      sidebar={
        <>
          <SidebarCard title="Saved posts">
            <p className={sidebarStyles.text}>
              Posts you save are kept in this browser only. Clearing your browser data removes them.
            </p>
          </SidebarCard>
          <SidebarFooter />
        </>
      }
    >
      <Head>
        <title>{`Saved posts - ${SITE_NAME}`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <h1 className={feedStyles.pageTitle}>Saved posts</h1>
      <hr />
      <div className={feedStyles.feed}>
        {posts.map((post) => (
          <div key={post.id}>
            <PostCard post={post} />
            <hr />
          </div>
        ))}
        {posts.length === 0 && (
          <div className={feedStyles.message}>
            <p className={feedStyles.emptyTitle}>Nothing saved yet</p>
            <p>Use the Save button on any post to keep it here.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default SavedPage;
