import { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { SITE_NAME } from '@/lib/site';
import { track } from '@/lib/analytics';
import styles from '@/styles/Feed.module.css';

export default function NotFound() {
  // Shows which missing pages people look for
  useEffect(() => {
    track('page-not-found', { path: window.location.pathname });
  }, []);

  return (
    <Layout>
      <Head>
        <title>{`Page not found - ${SITE_NAME}`}</title>
      </Head>
      <div className={styles.message}>
        <p className={styles.emptyTitle}>Hmm... we couldn&apos;t find that page</p>
        <p>It may never have been archived, or the link might be wrong.</p>
        <Link href="/" className={styles.retry} style={{ display: 'inline-flex', alignItems: 'center' }}>
          Go home
        </Link>
      </div>
    </Layout>
  );
}
