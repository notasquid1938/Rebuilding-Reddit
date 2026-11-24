import Head from 'next/head';
import Layout from '@/components/Layout';
import OpenRedditLink from '@/components/OpenRedditLink';
import { SidebarFooter } from '@/components/Sidebar';
import { archivedPath } from '@/lib/links';
import { SITE_NAME } from '@/lib/site';

// /open?url=<a Reddit link> goes to the link's archived copy; the bookmarklet
// in components/OpenRedditLink.js sends the Reddit page being viewed here
export async function getServerSideProps({ query }) {
  const url = typeof query.url === 'string' ? query.url : '';
  const path = archivedPath(url);
  if (path) return { redirect: { destination: path, permanent: false } };
  return { props: { url } };
}

export default function OpenPage({ url }) {
  return (
    <Layout sidebar={<SidebarFooter />}>
      <Head>
        <title>{`Open a Reddit link - ${SITE_NAME}`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <OpenRedditLink initialLink={url} initialError={Boolean(url)} />
    </Layout>
  );
}
